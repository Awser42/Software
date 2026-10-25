const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const archiver = require('archiver');
const crypto = require('node:crypto');
const {imageQuality} = require('./media-quality');
const {writeSpreadsheet} = require('./spreadsheet');
const {readArchivePreview} = require('./archive-preview');
const {variantMetadata, priceCurrency, optionKey} = require('./variant-metadata');

const safeName = v => String(v || 'product').normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 110) || 'product';
function filenamePart(value,limit){let result='';for(const character of safeName(value)){if(Buffer.byteLength(result+character)>limit)break;result+=character;}return result||'option';}
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
const EXPORT_FORMAT='product-xlsx-jpeg-v10';
const filenameCost=value=>money(value).replace(/(?:US\s*\$|\bUSD\b\s*\$?)/gi,'$').replace(/\$\s+(?=\d)/g,'$');
const COLUMNS=['Title','Variation','Price','Size','Color','Description','Seller Description','Features','Specifications','Images','Product ID','Variant ID','Design ID','Design','Hoop / Pack','Currency','Price Status','Options','Options JSON','Matched Images','Shared Images','Option Status'];
const lines=values=>[...new Set((values||[]).map(v=>typeof v==='string'?v.trim():[v?.name,v?.value].filter(x=>x!=null&&x!=='').join(': ').trim()).filter(Boolean))].join('\n');
function variantOptions(product,variant) {
  if (variant?.observedOptions?.length) return variant.observedOptions;
  const options=[];
  for (const pair of String(variant?.attributes||'').split(';').filter(Boolean)) {
    const [pid,rest='']=pair.trim().split(':'); const vid=rest.split('#')[0];
    const prop=(product.properties||[]).find(p=>String(p.id)===pid);
    const val=prop?.values?.find(v=>String(v.id)===vid);
    if (val) options.push({name:prop.name,value:val.name,propertyId:pid,id:vid,image:val.image});
  }
  return options;
}
function variantImageUrls(product,variant,options) {
  const urls=new Set(variant.observedImageUrls||[]);
  for (const option of options) {
    if (option.image) urls.add(option.image);
    for (const p of product.properties||[]) if ((option.propertyId&&String(p.id)===String(option.propertyId)) || String(p.name).toLowerCase()===String(option.name).toLowerCase()) {
      for (const v of p.values||[]) if ((option.id&&String(v.id)===String(option.id)) || v.name===option.value) if (v.image) urls.add(v.image);
    }
  }
  return urls;
}
function rowImages(product,variant,options,role=null) {
  const assets=(product.assets||[]).filter(a=>a.status==='downloaded');
  if (!variant) return role==='matched'?'':[...new Set(assets.map(a=>a.file))].join('\n');
  const variantIndex=(product.variations||[]).indexOf(variant);
  const urls=variantImageUrls(product,variant,options);
  const selected=assets.filter(a=>a.variantIndex===variantIndex||(a.variantIndex==null&&urls.has(a.url)));
  return [...new Set(selected.filter(a=>!role||a.imageRole===role).map(a=>a.file))].join('\n');
}
async function nameVariationImages(product,stage,files,checkpoint) {
  const assets=product.assets.filter(a=>a.status==='downloaded'),replacements=new Map();
  // The gallery can contain photos of every design. A known C4 thumbnail must
  // never be relabelled as C1 merely because it also appears in that gallery.
  const owners=new Map();
  for(const property of product.properties||[])for(const value of property.values||[])if(value.image){
    if(!owners.has(value.image))owners.set(value.image,[]);
    owners.get(value.image).push({name:property.name,propertyId:property.id,value:value.name,id:value.id});
  }
  for(const variant of product.variations||[])for(const option of variantOptions(product,variant))if(option.image){
    if(!owners.has(option.image))owners.set(option.image,[]);owners.get(option.image).push(option);
  }
  for (const [variantIndex,variant] of (product.variations||[]).entries()) {
    const options=variantOptions(product,variant),urls=variantImageUrls(product,variant,options);
    const metadata=variantMetadata(product,variant,options);
    const selected=new Set(options.map(option=>JSON.stringify(optionKey(option))));
    const eligible=assets.filter(asset=>{
      const known=owners.get(asset.url)||[];
      if(known.length)return known.some(option=>selected.has(JSON.stringify(optionKey(option))));
      return urls.has(asset.url)||asset.kind!=='variation'||(product.images||[]).includes(asset.url)||(product.descriptionImages||[]).includes(asset.url);
    });
    const sources=[...new Set(eligible.map(a=>a.file))];
    const optionLimit=Math.max(8,Math.floor(100/Math.max(1,options.length))-1);
    const label=filenamePart(options.map(o=>safeName([o.name,o.value].filter(Boolean).join('-')).slice(0,optionLimit)).join('-')||variant.name||variant.attributes||variant.skuId,100);
    const price=filenameCost(product.prices?.mode==='visible-variation'?variant.displayedPrice:variant.price);
    for (const [imageIndex,source] of sources.entries()) {
      await checkpoint();
      const imageRole=eligible.some(a=>a.file===source&&urls.has(a.url))?'matched':'shared';
      const priceLabel=price?`-cost-${filenamePart(price,30)}${product.prices?.mode==='visible-variation'?'-confirmed':'-catalog-unverified'}`:'-price-unconfirmed';
      const file=`Images/variation-${label}${priceLabel}-${metadata['Variant ID']}-${metadata['Design ID']||'design-unspecified'}-${imageRole}-${variantIndex+1}-${String(imageIndex+1).padStart(3,'0')}.jpg`;
      await fsp.copyFile(path.join(stage,source),path.join(stage,file),fs.constants.COPYFILE_EXCL);
      files.push(file);
      if (!replacements.has(source)) replacements.set(source,[]);
      replacements.get(source).push({file,variantIndex,imageRole});
    }
  }
  // A shared photo needs distinct names when observed sizes or prices differ.
  for (const source of replacements.keys()) {
    await fsp.rm(path.join(stage,source));
    files.splice(files.indexOf(source),1);
  }
  product.assets=product.assets.flatMap(asset=>replacements.has(asset.file)?replacements.get(asset.file).map(replacement=>({...asset,...replacement,kind:'variation'})):asset);
  // Unused catalog thumbnails stay available as clearly marked references,
  // without being associated with an unobserved design/size combination.
  for(const [index,source] of [...files].entries())if(!replacements.has(source)&&!source.includes('-matched-')&&!source.includes('-shared-')){
    const file=source.replace(/\.jpg$/,'-reference.jpg');
    await fsp.rename(path.join(stage,source),path.join(stage,file));files[index]=file;
    for(const asset of product.assets)if(asset.file===source){asset.file=file;asset.imageRole='reference';}
  }
  if(!product.variations?.length){
    const price=filenameCost(observedProductPrice(product.prices));
    if(price)for(const [index,source] of [...files].entries()){
      const file=source.replace(/\.jpg$/,`-cost-${safeName(price).slice(0,40)}.jpg`);
      await checkpoint();await fsp.rename(path.join(stage,source),path.join(stage,file));files[index]=file;
      for(const asset of product.assets)if(asset.file===source)asset.file=file;
    }
  }
}
function productRows(product) {
  const base={Title:product.title||'',Description:product.descriptionText||'','Seller Description':product.sellerDescriptionText||'',Features:lines(product.features),Specifications:lines(product.specifications)};
  const variants=product.variations||[];const visibleMode=product.prices?.mode==='visible-variation';
  const row=(variant,name,price,options=[])=>({...base,...variantMetadata(product,variant,options),Variation:name,Price:price,
    Color:lines(options.filter(o=>/colou?r|颜色/i.test(o.name)).map(o=>o.value)),
    Currency:priceCurrency(price),
    'Price Status':!price?'unconfirmed':!variant?'product-level':visibleMode?'confirmed-visible':'catalog-unverified',
    'Option Status':!variant?'product-level':variant.observedOptions?.length?'confirmed-selected':variant.attributes?'catalog-only':'unconfirmed-options',
    Images:rowImages(product,variant,options),
    'Matched Images':rowImages(product,variant,options,'matched'),
    'Shared Images':rowImages(product,variant,options,'shared')});
  const rows=variants.map(v=>row(v,v.name||v.attributes||v.skuId||'',money(visibleMode?v.displayedPrice:v.price),variantOptions(product,v)));
  if (!variants.length) for (const p of product.properties||[]) for (const v of p.values||[]) if (v.name) rows.push(row({},[p.name,v.name].filter(Boolean).join(': '),'',[{name:p.name,value:v.name,propertyId:p.id,id:v.id,image:v.image}]));
  const productPrice=observedProductPrice(product.prices);
  if (!rows.length || (visibleMode?product.prices.displayedUnassigned&&productPrice:!rows.some(r=>r.Price))) rows.unshift(row(null,'',productPrice));
  return rows;
}
async function makeArchive(product, output, request, checkpoint = async () => {}, encodeJpeg) {
  await fsp.mkdir(output, {recursive: true});
  const id = product.productId || crypto.createHash('sha256').update(product.sourceUrl).digest('hex').slice(0, 12);
  const name = `${safeName(product.title)}-${id}`;
  const stage = await fsp.mkdtemp(path.join(output, '.archive-'));
  const tempZip = path.join(output, `.${name}-${crypto.randomUUID()}.zip.partial`);
  const files = []; let preview = null, previewRank = Infinity, filteredImages = 0;
  product.assets = []; product.warnings ||= [];
  try {
    // Prioritize variation names when the same URL is also a gallery image.
    const variants = (product.properties || []).flatMap(p => (p.values || []).filter(v => v.image).map(v => ({url:v.image,kind:'variation', label:`variation-${safeName([p.name,v.name].filter(Boolean).join('-'))}`})));
    const measuredVariants=(product.variations||[]).flatMap(v=>(v.observedImageUrls||[]).map(url=>({url,kind:'variation',label:`variation-${safeName(v.name)}`})));
    const images = [...variants,...measuredVariants, ...(product.images || []).map(url=>({url,kind:'main',label:'main'})), ...(product.descriptionImages || []).map(url=>({url,kind:'description',label:'description'}))];
    const attempted = new Set(), contentFiles = new Map(), pixelFiles = new Map(); let index = 0;
    const imageHost = url => /^https?:$/.test(url.protocol) && /(^|\.)(alicdn\.com|aliexpress-media\.com|aliexpress\.(com|us))$/i.test(url.hostname);
    const choosePreview = (url, kind, bytes, info) => {
      const galleryIndex = (product.images || []).indexOf(url);
      const rank = galleryIndex >= 0 ? galleryIndex : kind === 'main' ? 0 : kind === 'variation' ? 100000 : 200000;
      const candidate = info?.preview || bytes?.preview || (bytes?.length < 2*1024*1024 ? `data:image/jpeg;base64,${bytes.toString('base64')}` : null);
      if (candidate && rank < previewRank) {preview = candidate; previewRank = rank;}
    };
    for (const {url,label,kind} of images) {
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
        const contentHash = crypto.createHash('sha256').update(source).digest('hex');
        const previous = contentFiles.get(contentHash);
        if (previous) {
          if (previous.status === 'filtered') {product.assets.push({...previous,url});filteredImages++;continue;}
          const alias = {...previous,url,kind,duplicate:true}; product.assets.push(alias);
          choosePreview(url,kind,null,previous);continue;
        }
        if (!encodeJpeg) throw new Error('JPEG codec is unavailable; image was not renamed');
        const bytes = await encodeJpeg(source, mime);
        if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error('Image codec did not produce JPEG bytes');
        const quality = imageQuality(bytes);
        if (!quality.accepted) {
          const asset = {url,file:null,kind,status:'filtered',width:quality.width,height:quality.height,reason:quality.reason};
          product.assets.push(asset); contentFiles.set(contentHash,asset);filteredImages++;continue;
        }
        const pixelHash = bytes.pixelHash || crypto.createHash('sha256').update(bytes).digest('hex');
        const matching = pixelFiles.get(pixelHash);
        if (matching) {
          const alias = {...matching,url,kind,duplicate:true}; product.assets.push(alias);contentFiles.set(contentHash,alias);
          choosePreview(url,kind,bytes,alias);continue;
        }
        const file = `Images/${label}-${String(++index).padStart(3, '0')}.jpg`;
        await fsp.mkdir(path.join(stage, 'Images'), {recursive:true});
        await fsp.writeFile(path.join(stage,file),bytes);
        files.push(file);
        const asset = {url,file,kind,status:'downloaded',bytes:bytes.length,width:quality.width,height:quality.height,preview:bytes.preview||null};
        product.assets.push(asset);contentFiles.set(contentHash,asset);pixelFiles.set(pixelHash,asset);
        choosePreview(url,kind,bytes,asset);
      } catch (error) {
        product.assets.push({url,file:null,status:'failed',error:error.message});
        product.warnings.push(`Image unavailable: ${url} (${error.message})`);
      }
    }
    if (!String(product.descriptionText || '').trim() && !String(product.sellerDescriptionText || '').trim()) {
      const warning = 'Description text was not exposed by the page. The description cells were left blank; image content was not invented as text.';
      if (!product.warnings.includes(warning)) product.warnings.push(warning);
    }
    await nameVariationImages(product,stage,files,checkpoint);
    const rows=productRows(product);
    product.imageMap=[...new Set(product.assets.filter(asset=>asset.status==='downloaded').map(asset=>asset.file))].map(file=>{
      const asset=product.assets.find(asset=>asset.file===file),variant=product.variations?.[asset.variantIndex];
      const row=variant?rows.find(row=>row['Variant ID']===variantMetadata(product,variant,variantOptions(product,variant))['Variant ID']):null;
      return {File:file,'Variant ID':row?.['Variant ID']||'','Design ID':row?.['Design ID']||'',Design:row?.Design||'',Size:row?.Size||'','Hoop / Pack':row?.['Hoop / Pack']||'',Price:row?.Price||'','Price Status':row?.['Price Status']||'product-reference',Role:asset.imageRole||'reference','Source URLs':lines(product.assets.filter(a=>a.file===file).map(a=>a.url)),'Option Status':row?.['Option Status']||'product-reference'};
    });
    await writeSpreadsheet(path.join(stage,'product.xlsx'),product,rows);
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
    return {path:finalPath,title:product.title,productId:id,warnings:product.warnings,images:files.length,filteredImages,preview,capturedAt:product.capturedAt,exportFormat:EXPORT_FORMAT,rowCount:rows.length,captureComplete:product.prices?.captureCoverage?.complete,variationCoverage:product.prices?.captureCoverage,descriptionPreview:(product.descriptionText||'').slice(0,1000),sellerDescriptionPreview:(product.sellerDescriptionText||'').slice(0,600),descriptionFull:(product.descriptionText||'').slice(0,50000),sellerDescriptionFull:(product.sellerDescriptionText||'').slice(0,50000),descriptionTruncated:(product.descriptionText||'').length>50000,sellerDescriptionTruncated:(product.sellerDescriptionText||'').length>50000,featuresPreview:lines(product.features),specificationsPreview:lines(product.specifications),specificationCount:(product.specifications||[]).length,featureCount:(product.features||[]).length,detailsPreview:rows.slice(0,5).map(r=>({title:r.Title,variation:r.Variation,price:r.Price,size:[...new Set([r.Size,r['Hoop / Pack']].filter(Boolean))].join(' / '),color:r.Color,design:r.Design,hoop:r['Hoop / Pack'],variantId:r['Variant ID'],priceStatus:r['Price Status']})),priceMode:product.prices?.mode==='visible-variation'?'visible-variation-v1':null};
  } finally {
    await fsp.rm(stage,{recursive:true,force:true}); await fsp.rm(tempZip,{force:true});
  }
}
module.exports = {makeArchive, productKey, normalizedUrl, safeName, COLUMNS, EXPORT_FORMAT, readArchivePreview};
