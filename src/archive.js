const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const archiver = require('archiver');
const crypto = require('node:crypto');

const safeName = v => String(v || 'product').normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 110) || 'product';
const csvCell = v => { let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); if (/^[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
const csv = (rows, columns) => '\uFEFF' + [columns, ...rows.map(row => columns.map(k => row[k]))].map(r => r.map(csvCell).join(',')).join('\r\n');
const escapeHtml = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
function productKey(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw new Error('Use an HTTPS AliExpress product URL.');
  const id = u.pathname.match(/\/(?:item|i)\/(\d+)\.html/i)?.[1];
  if (!id || !/(^|\.)aliexpress\.(com|us)$/i.test(u.hostname)) throw new Error('Expected an aliexpress.com or aliexpress.us /item/NUMBER.html URL.');
  return id;
}
function normalizedUrl(url) { productKey(url); const u = new URL(url); u.protocol = 'https:'; u.search = ''; u.hash = ''; return u.href; }

async function makeArchive(product, output, request, checkpoint = async () => {}) {
  await fsp.mkdir(output, {recursive: true});
  const id = product.productId || crypto.createHash('sha256').update(product.sourceUrl).digest('hex').slice(0, 12);
  const name = `${safeName(product.title)}-${id}`;
  const stage = await fsp.mkdtemp(path.join(output, '.archive-'));
  const tempZip = path.join(output, `.${name}-${crypto.randomUUID()}.zip.partial`);
  const files = []; let preview = null;
  product.assets = [];
  try {
    const groups = [['images', product.images], ['description-images', product.descriptionImages], ['variation-images', product.properties.flatMap(p => p.values.map(v => v.image).filter(Boolean))]];
    const downloaded = new Map();
    for (const [folder, urls] of groups) {
      let index = 0;
      for (const url of [...new Set(urls || [])]) {
        await checkpoint();
        if (downloaded.has(url)) { product.assets.push({url, file: downloaded.get(url), status: 'downloaded'}); continue; }
        try {
          const u = new URL(url);
          if (!/^https?:$/.test(u.protocol) || !/(^|\.)(alicdn\.com|aliexpress-media\.com|aliexpress\.(com|us))$/i.test(u.hostname)) throw new Error('Image host is not an AliExpress CDN; skipped');
          const response = await request.get(url, {timeout: 30000, maxRedirects: 3});
          if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
          const mime = (response.headers()['content-type'] || '').split(';')[0];
          const ext = {'image/jpeg':'.jpg', 'image/png':'.png', 'image/webp':'.webp', 'image/gif':'.gif', 'image/avif':'.avif'}[mime];
          if (!ext) throw new Error(`Unsupported image content type: ${mime}`);
          const bytes = await response.body();
          if (bytes.length > 30 * 1024 * 1024) throw new Error('Image exceeds 30 MB');
          const file = `${folder}/${String(++index).padStart(3, '0')}${ext}`;
          await fsp.mkdir(path.join(stage, folder), {recursive: true});
          await fsp.writeFile(path.join(stage, file), bytes);
          files.push(file); downloaded.set(url, file);
          product.assets.push({url, file, status: 'downloaded', bytes: bytes.length});
          if (!preview && bytes.length < 2 * 1024 * 1024) preview = `data:${mime};base64,${bytes.toString('base64')}`;
        } catch (error) {
          product.assets.push({url, file: null, status: 'failed', error: error.message});
          product.warnings.push(`Image unavailable: ${url} (${error.message})`);
        }
      }
    }
    let html = product.descriptionHtml || `<p>${escapeHtml(product.descriptionText || 'Description not available in the observed page.')}</p>`;
    for (const [url, file] of downloaded) html = html.split(escapeHtml(url)).join(file).split(url).join(file);
    // Archive HTML is offline content: no scripts, remote styles, or live image requests.
    html = html.replace(/\s(?:srcset|style)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
    const document = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"><title>${escapeHtml(product.title || 'Product description')}</title><style>body{max-width:1000px;margin:32px auto;font:16px system-ui}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
    const details = [product.title || '(Title missing)', `Source: ${product.sourceUrl}`, `Captured: ${product.capturedAt}`, '', 'PRICES AS OBSERVED (currency, location, account, selected variant and tax/shipping may affect them)', JSON.stringify(product.prices, null, 2), '', 'DESCRIPTION', product.descriptionText || '(Not available)', '', 'OPTIONS', ...product.properties.map(p => `${p.name}: ${p.values.map(v => v.name).join(', ')}`), '', 'SPECIFICATIONS', ...product.specifications.map(p => `${p.name}: ${p.value}`), '', 'WARNINGS', ...product.warnings, '', 'Missing values are null or empty. No prices, stock, options, or descriptions were invented.'].join('\n');
    await Promise.all([
      fsp.writeFile(path.join(stage, 'product.json'), JSON.stringify(product, null, 2)),
      fsp.writeFile(path.join(stage, 'product-details.txt'), details),
      fsp.writeFile(path.join(stage, 'description.html'), document),
      fsp.writeFile(path.join(stage, 'variations.csv'), csv(product.variations, ['skuId', 'name', 'attributes', 'price', 'originalPrice', 'availableQuantity'])),
      fsp.writeFile(path.join(stage, 'specifications.csv'), csv(product.specifications, ['name', 'value'])),
      fsp.writeFile(path.join(stage, 'options.csv'), csv(product.properties.flatMap(p => p.values.map(v => ({property:p.name, ...v}))), ['property', 'id', 'name', 'image']))
    ]);
    await new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(tempZip, {flags:'wx'}); const zip = archiver('zip', {zlib:{level:6}});
      dest.on('close', resolve); dest.on('error', reject); zip.on('error', reject); zip.on('warning', reject);
      zip.pipe(dest); zip.directory(stage, false); zip.finalize().catch(reject);
    });
    // Never overwrite an existing archive, including files made outside this app.
    let finalPath = path.join(output, `${name}.zip`);
    for (let i = 2; ; i++) {
      try { await fsp.copyFile(tempZip, finalPath, fs.constants.COPYFILE_EXCL); break; }
      catch (e) { if (e.code !== 'EEXIST') throw e; finalPath = path.join(output, `${name}-${i}.zip`); }
    }
    return {path: finalPath, title: product.title, productId: id, warnings: product.warnings, images: files.length, preview, capturedAt: product.capturedAt};
  } finally {
    await fsp.rm(stage, {recursive:true, force:true}); await fsp.rm(tempZip, {force:true});
  }
}
module.exports = {makeArchive, productKey, normalizedUrl, safeName, csv};
