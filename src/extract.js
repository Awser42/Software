// Runs in the product page. Only observed fields are returned; no inferred prices.
async function extractPage(page, extraData = []) {
  return page.evaluate((extraData) => {
    const text = v => typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
    const arr = v => Array.isArray(v) ? v : [];
    const absolute = u => {
      if (!u || typeof u !== 'string') return '';
      try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; }
    };
    const original = u => absolute(text(u).replace(/(\.(?:jpe?g|png|webp))_\d+x\d+[^/?]*(?:\.(?:jpe?g|png|webp))?(?=\?|$)/i, '$1'));
    const unique = xs => [...new Set(xs.filter(Boolean))];
    const one = selectors => selectors.map(s => document.querySelector(s)?.textContent?.trim()).find(Boolean) || null;
    const roots = [...extraData];
    for (const key of ['runParams', '__INIT_DATA__', '__INITIAL_STATE__', '__NEXT_DATA__', '_dida_config_', '__AER_DATA__']) {
      try { if (window[key]) roots.push(window[key]); } catch {}
    }
    const structured = [];
    for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { const value = JSON.parse(el.textContent); structured.push(...arr(value['@graph']), ...(Array.isArray(value) ? value : [value])); } catch {}
    }
    const product = structured.find(x => x?.['@type'] === 'Product' || arr(x?.['@type']).includes('Product')) || {};
    const modules = {};
    const aliases = {PRODUCT_TITLE:'titleModule', PRODUCT_INFO:'productInfoComponent', IMAGE_PC:'imageModule', IMAGE:'imageModule', SKU:'skuModule', PRICE:'priceModule', PRODUCT_PROP:'specsModule', PRODUCT_DESC:'descriptionModule'};
    const seen = new WeakSet();
    let visits = 0;
    function walk(obj, depth = 0) {
      if (!obj || typeof obj !== 'object' || seen.has(obj) || depth > 15 || ++visits > 20000) return;
      seen.add(obj);
      for (const [key, value] of Object.entries(obj)) {
        if (aliases[key] && value && typeof value === 'object') modules[aliases[key]] = value.data || value;
        if (['titleModule', 'imageModule', 'skuModule', 'priceModule', 'specsModule', 'descriptionModule', 'productInfoComponent', 'imageComponent', 'skuComponent', 'priceComponent', 'productPropComponent', 'productDescComponent'].includes(key) && value && typeof value === 'object') modules[key] = value;
        walk(value, depth + 1);
      }
    }
    roots.forEach(x => walk(x));
    const titleData = modules.titleModule || modules.productInfoComponent || {};
    const imageData = modules.imageModule || modules.imageComponent || {};
    const sku = modules.skuModule || modules.skuComponent || {};
    const price = modules.priceModule || modules.priceComponent || {};
    const specs = modules.specsModule || modules.productPropComponent || {};
    const desc = modules.descriptionModule || modules.productDescComponent || {};
    const title = text(titleData.subject || titleData.title || product.name) || one(['h1[data-pl="product-title"]', 'h1[class*="title"]', '.product-title-text', 'h1']);
    let images = arr(imageData.imagePathList || imageData.imageUrlList || imageData.imageList).map(x => original(typeof x === 'object' ? x.url || x.imageUrl : x));
    images.push(...(Array.isArray(product.image) ? product.image : product.image ? [product.image] : []).map(x => original(typeof x === 'object' ? x.url : x)));
    for (const img of document.querySelectorAll('[class*="slider--"] img, .images-view-list img, [class*="image-view"] img, [class*="magnifier"] img')) images.push(original(img.getAttribute('data-src') || img.currentSrc || img.src));
    const properties = arr(sku.productSKUPropertyList || sku.skuPropertyList).map(p => ({
      id: text(p.skuPropertyId || p.propertyId), name: text(p.skuPropertyName || p.propertyName),
      values: arr(p.skuPropertyValues || p.values).map(v => ({ id: text(v.propertyValueId || v.skuPropertyValueId), name: text(v.propertyValueDisplayName || v.propertyValueName || v.name), image: original(v.skuPropertyImagePath || v.imageUrl || '') || null }))
    }));
    if (!properties.length) {
      for (const group of document.querySelectorAll('[class*="sku-item--"], .sku-property')) {
        const name = group.querySelector('[class*="title"], .sku-title')?.textContent?.trim();
        if (!name) continue;
        const values = [...group.querySelectorAll('[data-sku-col], [class*="item--"], li')].map(el => ({id: el.getAttribute('data-sku-col') || '', name: el.getAttribute('title') || el.querySelector('img')?.alt || el.textContent?.trim(), image: original(el.querySelector('img')?.src || '') || null})).filter(v => v.name);
        if (values.length) properties.push({id: '', name: name.replace(/:\s*$/, ''), values});
      }
    }
    const variations = arr(sku.skuPriceList || sku.skuList).map(row => {
      const val = row.skuVal || row;
      const attributes = text(row.skuAttr || row.skuPropIds || row.skuPropertyIds);
      const names = attributes.split(';').filter(Boolean).map(pair => {
        const [pid, rest = ''] = pair.split(':'); const vid = rest.split('#')[0];
        const prop = properties.find(p => p.id === pid); const value = prop?.values.find(v => v.id === vid);
        return value ? `${prop.name}: ${value.name}` : pair;
      });
      return {skuId: text(row.skuId), name: names.join(' / ') || null, attributes: attributes || null,
        price: val.skuActivityAmount || val.skuAmount || val.price || null,
        originalPrice: val.skuAmount || null, availableQuantity: val.availQuantity ?? val.inventory ?? null,
        raw: row};
    });
    const specifications = arr(specs.props || specs.productPropList || specs.properties).map(p => ({name: text(p.attrName || p.name), value: text(p.attrValue || p.value)})).filter(p => p.name || p.value);
    if (!specifications.length) for (const el of document.querySelectorAll('.product-specs-list li, [class*="specification--prop"], [class*="specification--line"]')) {
      const parts = [...el.querySelectorAll('span')].map(e => e.textContent.trim()).filter(Boolean);
      if (parts.length >= 2) specifications.push({name: parts[0], value: parts.slice(1).join(' ')});
    }
    const descriptionEl = document.querySelector('#product-description, .product-description, [class*="description--detail"], .detailmodule_html');
    const descriptionHtml = descriptionEl?.innerHTML || (typeof desc.description === 'string' && /<[^>]+>/.test(desc.description) ? desc.description : null);
    const descriptionText = descriptionEl?.innerText || text(product.description) || null;
    const offers = product.offers || null;
    const displayed = one(['[class*="price--current"]', '[class*="price--sale"]', '.product-price-current', '[itemprop="price"]']);
    return {
      title: title || null, sourceUrl: location.href, capturedAt: new Date().toISOString(),
      images: unique(images), descriptionHtml, descriptionText,
      descriptionUrl: absolute(desc.descriptionUrl || desc.detailDesc || '') || null,
      descriptionImages: descriptionEl ? unique([...descriptionEl.querySelectorAll('img')].map(img => original(img.getAttribute('data-src') || img.src))) : [],
      properties, sizes: properties.filter(p => /size|尺寸/i.test(p.name)), colors: properties.filter(p => /colou?r|颜色/i.test(p.name)),
      variations, prices: {displayed: displayed || null, structuredOffers: offers, sourceModule: Object.keys(price).length ? price : null},
      specifications, raw: {modules, structuredProduct: product},
      warnings: []
    };
  }, extraData);
}

async function parseDescription(page, html) {
  return page.evaluate(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const el of doc.querySelectorAll('script, iframe, object, embed, form, link, meta, base')) el.remove();
    for (const el of doc.querySelectorAll('*')) for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || /^(javascript|vbscript):/i.test(attr.value.trim())) el.removeAttribute(attr.name);
    }
    const images = [];
    for (const img of doc.querySelectorAll('img')) {
      try {
        const u = new URL(img.getAttribute('data-src') || img.getAttribute('src'), location.href);
        if (/^https?:$/.test(u.protocol)) { img.src = u.href; images.push(u.href); }
      } catch {}
    }
    return {html: doc.body.innerHTML, text: doc.body.textContent.trim(), images: [...new Set(images)]};
  }, html);
}
module.exports = {extractPage, parseDescription};
