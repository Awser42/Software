const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const archiver = require('archiver');
const crypto = require('node:crypto');

const safeName = v => String(v || 'product').normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 110) || 'product';
const csvCell = v => { let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); if (/^[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
const csv = (rows, columns) => '\uFEFF' + [columns, ...rows.map(row => columns.map(k => row[k]))].map(r => r.map(csvCell).join(',')).join('\r\n');
function productKey(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw new Error('Use an HTTPS AliExpress product URL.');
  const id = u.pathname.match(/\/(?:item|i)\/(\d+)\.html/i)?.[1];
  if (!id || !/(^|\.)aliexpress\.(com|us)$/i.test(u.hostname)) throw new Error('Expected an aliexpress.com or aliexpress.us /item/NUMBER.html URL.');
  return id;
}
function normalizedUrl(url) { productKey(url); const u = new URL(url); u.protocol = 'https:'; u.search = ''; u.hash = ''; return u.href; }

// Keep only observed money fields; never serialize a price object as JSON or
// assign a product's selected/displayed price to every SKU.
function money(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value !== 'object') return '';
  for (const key of ['formatedAmount', 'formattedAmount', 'formattedPrice', 'priceText']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
  }
  const amount = value.value ?? value.amount ?? value.price;
  if (typeof amount !== 'string' && typeof amount !== 'number') return '';
  const currency = value.currency ?? value.priceCurrency ?? value.currencyCode ?? '';
  return [typeof currency === 'string' ? currency.trim() : '', String(amount).trim()].filter(Boolean).join(' ');
}
function observedProductPrice(prices = {}) {
  if (money(prices.displayed)) return money(prices.displayed);
  if (prices.mode === 'visible-variation') return '';
  const offers = Array.isArray(prices.structuredOffers) ? prices.structuredOffers : [prices.structuredOffers];
  const values = offers.filter(Boolean).map(offer => {
    if (offer.price != null) return money({value: offer.price, currency: offer.priceCurrency});
    if (offer.lowPrice != null && offer.highPrice != null) {
      const low = money({value:offer.lowPrice,currency:offer.priceCurrency});
      return offer.lowPrice === offer.highPrice ? low : low + ' – ' + money({value:offer.highPrice,currency:offer.priceCurrency});
    }
    return '';
  }).filter(Boolean);
  if (values.length) return [...new Set(values)].join(' / ');
  const module = prices.sourceModule || {};
  for (const key of ['minActivityAmount', 'activityAmount', 'minAmount', 'minPrice', 'price']) {
    const value = money(module[key]); if (value) return value;
  }
  return '';
}
function productRows(product) {
  const base = {Title:product.title || '', Description:product.descriptionText || ''};
  const variants = product.variations || [];
  const visibleMode = product.prices?.mode === 'visible-variation';
  const rows = variants.map(v => ({...base, Variation:v.name || v.attributes || v.skuId || '', Price:money(visibleMode ? v.displayedPrice : v.price)}));
  if (!variants.length) {
    for (const property of product.properties || []) for (const value of property.values || []) {
      if (value.name) rows.push({...base, Variation:[property.name,value.name].filter(Boolean).join(': '), Price:''});
    }
  }
  // A separate blank-variation row retains an exposed product-level price when
  // no per-SKU prices were exposed. It does not claim to price any option.
  const productPrice=observedProductPrice(product.prices);
  if (!rows.length || (visibleMode ? product.prices.displayedUnassigned && productPrice : !rows.some(row=>row.Price))) rows.unshift({...base,Variation:'',Price:productPrice});
  return rows;
}
async function makeArchive(product, output, request, checkpoint = async () => {}, encodeJpeg) {
  await fsp.mkdir(output, {recursive: true});
  const id = product.productId || crypto.createHash('sha256').update(product.sourceUrl).digest('hex').slice(0, 12);
  const name = `${safeName(product.title)}-${id}`;
  const stage = await fsp.mkdtemp(path.join(output, '.archive-'));
  const tempZip = path.join(output, `.${name}-${crypto.randomUUID()}.zip.partial`);
  const files = []; let preview = null;
  product.assets = []; product.warnings ||= [];
  try {
    // Prioritize variation names when the same URL is also a gallery image.
    const variants = (product.properties || []).flatMap(p => (p.values || []).filter(v => v.image).map(v => ({url:v.image, label:`variation-${safeName([p.name,v.name].filter(Boolean).join('-'))}`})));
    const images = [...variants, ...(product.images || []).map(url=>({url,label:'main'})), ...(product.descriptionImages || []).map(url=>({url,label:'description'}))];
    const attempted = new Set(); let index = 0;
    const imageHost = url => /^https?:$/.test(url.protocol) && /(^|\.)(alicdn\.com|aliexpress-media\.com|aliexpress\.(com|us))$/i.test(url.hostname);
    for (const {url,label} of images) {
      await checkpoint();
      if (attempted.has(url)) continue;
      attempted.add(url);
      try {
        if (!imageHost(new URL(url))) throw new Error('Image host is not an AliExpress CDN; skipped');
        const response = await request.get(url, {timeout:30000, maxRedirects:3});
        if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
        if (typeof response.url === 'function' && !imageHost(new URL(response.url()))) throw new Error('Image redirected outside the AliExpress CDN');
        const headers = response.headers();
        const mime = (headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!/^image\/(jpeg|png|webp|gif|avif|bmp|x-ms-bmp)$/.test(mime)) throw new Error(`Unsupported image content type: ${mime}`);
        if (Number(headers['content-length']) > 30*1024*1024) throw new Error('Image exceeds 30 MB');
        const source = await response.body();
        if (source.length > 30*1024*1024) throw new Error('Image exceeds 30 MB');
        if (!encodeJpeg) throw new Error('JPEG codec is unavailable; image was not renamed');
        const bytes = await encodeJpeg(source, mime);
        if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error('Image codec did not produce JPEG bytes');
        const file = `Images/${label}-${String(++index).padStart(3, '0')}.jpg`;
        await fsp.mkdir(path.join(stage, 'Images'), {recursive:true});
        await fsp.writeFile(path.join(stage,file),bytes);
        files.push(file);
        product.assets.push({url,file,status:'downloaded',bytes:bytes.length});
        if (!preview && bytes.length < 2*1024*1024) preview = `data:image/jpeg;base64,${bytes.toString('base64')}`;
      } catch (error) {
        product.assets.push({url,file:null,status:'failed',error:error.message});
        product.warnings.push(`Image unavailable: ${url} (${error.message})`);
      }
    }
    await fsp.writeFile(path.join(stage,'product.csv'),csv(productRows(product),['Title','Description','Variation','Price']));
    await new Promise((resolve,reject) => {
      const dest = fs.createWriteStream(tempZip,{flags:'wx'}); const zip = archiver('zip',{zlib:{level:6}});
      dest.on('close',resolve); dest.on('error',reject); zip.on('error',reject); zip.on('warning',reject);
      zip.pipe(dest); zip.directory(stage,false); zip.finalize().catch(reject);
    });
    let finalPath = path.join(output,`${name}.zip`);
    for (let i=2; ; i++) {
      try { await fsp.copyFile(tempZip,finalPath,fs.constants.COPYFILE_EXCL); break; }
      catch (e) { if (e.code !== 'EEXIST') throw e; finalPath=path.join(output,`${name}-${i}.zip`); }
    }
    return {path:finalPath,title:product.title,productId:id,warnings:product.warnings,images:files.length,preview,capturedAt:product.capturedAt,exportFormat:'csv-jpeg-v1',priceMode:product.prices?.mode==='visible-variation'?'visible-variation-v1':null};
  } finally {
    await fsp.rm(stage,{recursive:true,force:true}); await fsp.rm(tempZip,{force:true});
  }
}
module.exports = {makeArchive, productKey, normalizedUrl, safeName, csv};
