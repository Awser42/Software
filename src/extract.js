// All extraction is based on the requested product's observed page content.
// These helpers run inside Chromium and deliberately ignore recommendation UI.
function pageTools() {
  const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const requestedId = location.pathname.match(/\/(?:item|i)\/(\d+)\.html/i)?.[1] || null;
  const excluded = element => {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      if (['HEADER','FOOTER','NAV','ASIDE'].includes(node.tagName)) return true;
      if (/recommend|related|similar[-_]?item|sponsored|feedback|(?:^|[\s_-])reviews?(?:[\s_-]|$)|productReviews?|customerReviews?/i.test(String(node.className || ''))) return true;
      const id = node.getAttribute('data-product-id') || node.getAttribute('data-item-id');
      if (id && requestedId && /^\d+$/.test(id) && id !== requestedId) return true;
    }
    return false;
  };
  const visible = element => {
    if (!element || element.closest('[hidden],[aria-hidden="true"],dialog,[role="dialog"],[role="tooltip"]')) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && (element.getClientRects().length > 0 || style.display === 'contents');
  };
  const control = element => /^(?:view|show|see|read) (?:more|less)(?:\s*[⌄⌃↓↑+−-])?$/i.test(normalize(element.textContent));
  const textOf = element => {
    const blocks = new Set(['P','DIV','LI','UL','OL','SECTION','ARTICLE','H1','H2','H3','H4','H5','H6','TR','DT','DD']);
    function read(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE || !visible(node) || excluded(node) || node.matches('script,style,noscript,template,button,input,select,textarea,svg') || control(node)) return '';
      if (node.tagName === 'BR') return '\n';
      return [...node.childNodes].map(read).join('') + (blocks.has(node.tagName) ? '\n' : '');
    }
    return read(element).replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  };
  const htmlOf = element => {
    const clone = element.cloneNode(true);
    const originals = [element,...element.querySelectorAll('*')];
    const copies = [clone,...clone.querySelectorAll('*')];
    for (let index = originals.length - 1; index >= 1; index--) {
      const original = originals[index], copy = copies[index];
      if (!visible(original) || excluded(original) || original.matches('script,style,noscript,template,iframe,object,embed,form,link,meta,base,button,input,select,textarea,svg') || control(original)) {copy.remove(); continue;}
      for (const attribute of [...copy.attributes]) if (/^on/i.test(attribute.name) || /^(javascript|vbscript):/i.test(attribute.value.trim())) copy.removeAttribute(attribute.name);
    }
    return clone.innerHTML;
  };
  const absolute = value => {
    if (typeof value !== 'string' || !value.trim() || /^(?:null|undefined|#|about:blank)$/i.test(value.trim())) return '';
    try {const url = new URL(value,location.href); return /^https?:$/.test(url.protocol) ? url.href : '';} catch {return '';}
  };
  const original = value => absolute(String(value || '').replace(/(\.(?:jpe?g|png|webp|avif))_\d+x\d+[^/?]*(?=\?|$)/i,'$1'));
  const bestSrcset = value => (/^\s*(?:data|blob):/i.test(String(value || '')) ? [] : String(value || '').split(',')).map(part => {
    const match = part.trim().match(/^(\S+)(?:\s+(\d+(?:\.\d+)?)([wx]))?$/);
    return match ? {url:match[1],size:Number(match[2]) || 1} : null;
  }).filter(Boolean).sort((a,b) => b.size - a.size)[0]?.url || '';
  const imageOf = image => {
    const declared = image.getAttribute('src');
    const current = declared && !/^(?:null|undefined|#|about:blank)$/i.test(declared.trim()) ? image.currentSrc : '';
    const candidates = [image.getAttribute('data-original'),bestSrcset(image.getAttribute('data-srcset') || image.getAttribute('srcset')),image.getAttribute('data-src'),image.getAttribute('data-lazy-src'),current,declared];
    return candidates.map(original).find(Boolean) || '';
  };
  const unique = values => [...new Set(values.filter(Boolean))];
  const title = () => {
    for (const selector of ['h1[data-pl="product-title"]','h1[class*="title"]','.product-title-text','h1']) {
      const candidates = [...document.querySelectorAll(selector)].filter(element => visible(element) && !excluded(element));
      const value = candidates.map(textOf).find(value => value && value.length < 3000);
      if (value) return value;
    }
    return '';
  };
  return {normalize,requestedId,excluded,visible,control,textOf,htmlOf,absolute,original,imageOf,unique,title};
}

// Embed this module's trusted helper in the function sent through Playwright.
// No site content is evaluated as code, and page CSP does not need unsafe-eval.
function evaluateWithTools(page,fn,argument) {
  const source = fn.toString().replace(/(\)\s*(?:=>\s*)?\{)/,match => match + '\n' + pageTools.toString() + '\n');
  const browserFunction = Function('return (' + source + ');')();
  return page.evaluate(browserFunction,argument);
}

function overviewInPage({expand}) {
  const {normalize,excluded,visible,control,textOf,htmlOf,imageOf,unique} = pageTools();
  const headingText = element => {
    const copy = element.cloneNode(true);
    for (const icon of copy.querySelectorAll('svg,img,script,style,[aria-hidden="true"]')) icon.remove();
    return normalize(copy.textContent).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'').toLowerCase();
  };
  const headings = [...document.querySelectorAll('h2,h3,h4,div,span,p,strong,b')]
    .filter(element => /ai overview of item/i.test(element.textContent || '') && normalize(element.textContent).length < 180 && visible(element) && !excluded(element) && headingText(element) === 'ai overview of item');
  for (const heading of headings) {
    let container = heading.parentElement;
    for (let depth = 0; container && depth < 8; depth++, container = container.parentElement) {
      if (['BODY','HTML','MAIN'].includes(container.tagName) || container.querySelector('h1,[class*="price-default--current"],[class*="sku-item--property"],#product-description,.product-description,[class*="description--detail"]')) break;
      if (!visible(container) || excluded(container)) continue;
      const allText = textOf(container);
      if (allText.length > 40000) break;
      const native = /seo[-_]?sellpoints|ai[-_]?overview|aiOverview/i.test(String(container.className || '')) || container.getAttribute('data-role') === 'ai-overview';
      const disclaimer = element => {
        for (let node = element; node && node !== container; node = node.parentElement) {
          if (/disclaimer/i.test(String(node.className || '')) || /^(?:disclaimer\s*:|this content is generated by ai)/i.test(normalize(node.textContent))) return true;
        }
        return false;
      };
      let points = [...container.querySelectorAll('li,[class*="sellpoints--item"],[class*="sellpoints--point"],[class*="sellpoint--item"],[class*="bullet"],[data-role="ai-overview-point"]')]
        .filter(element => visible(element) && !excluded(element) && !disclaimer(element));
      points = points.filter(element => !points.some(other => other !== element && other.contains(element)));
      if (!points.length && native) {
        points = [...container.querySelectorAll('p,div')].filter(element => {
          const value = textOf(element);
          return visible(element) && !disclaimer(element) && !control(element) && value.length >= 8 && headingText(element) !== 'ai overview of item' && !element.contains(heading) && ![...element.children].some(child => ['DIV','P','LI'].includes(child.tagName) && textOf(child).length >= 8);
        });
      }
      const features = unique(points.map(textOf).filter(value => /[\p{L}\p{N}]/u.test(value) && !/^(?:disclaimer\s*:|this content is generated by ai)/i.test(value)));
      if (!features.length) continue;
      const initial = {text:allText,html:htmlOf(container),images:unique([...container.querySelectorAll('img')].filter(image => visible(image) && !excluded(image)).map(imageOf)),features,source:'ai-overview',expanded:false,
        loading:container.getAttribute('aria-busy') === 'true' || !![...container.querySelectorAll('[aria-busy="true"],[class*="loading"],[class*="skeleton"]')].find(visible)};
      if (expand) {
        const button = [...container.querySelectorAll('button,a,[role="button"],span,div')].reverse().find(element => visible(element) && /^(?:view|show|see|read) more(?:\s*[⌄↓+])?$/i.test(normalize(element.textContent)) && !element.querySelector('button,a,[role="button"]') && (!element.matches('a[href]') || /^#?$/.test(element.getAttribute('href') || '')) && !element.matches('button[type="submit"]'));
        if (button) {button.click(); initial.expanded = true;}
      }
      return initial;
    }
  }
  return null;
}

async function captureOverview(page, {expand = true} = {}) {
  const args = {expand};
  const initial = await evaluateWithTools(page,overviewInPage,args);
  if (!initial?.expanded) return initial;
  const started = Date.now(), deadline = started + 6000;
  let best = initial, lastKey = initial.text, changedAt = started, changed = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(200);
    const current = await evaluateWithTools(page,overviewInPage,{...args,expand:false});
    if (!current) continue;
    if (current.features.length > best.features.length || current.features.length === best.features.length && current.text.length >= best.text.length) best = current;
    const signature = JSON.stringify([current.text,current.images]);
    if (signature !== lastKey) {lastKey = signature; changedAt = Date.now();}
    if (current.text !== initial.text || current.features.length > initial.features.length) changed = true;
    if (changed && !current.loading && Date.now() - started >= 2000 && Date.now() - changedAt >= 800) return {...current,expanded:true,settled:true};
  }
  return {...best,expanded:true,settled:!best.loading};
}

function productDetailsInPage({tab,expand}) {
  const {normalize,excluded,visible,control,textOf,htmlOf,imageOf,unique} = pageTools();
  const descriptionSelector = '#product-description,.product-description,[class*="description--detail"],[class*="description--content"],.detailmodule_html,[data-role="product-description"]';
  const valid = element => visible(element) && !excluded(element);
  if (tab) {
    const labels = tab === 'description' ? /^(?:description|product description|product details|overview)$/i : /^(?:specifications|specification|item specifics|product specifications|features)$/i;
    const candidates = [...document.querySelectorAll('[role="tab"],[class*="tab--item"],[class*="tab-item"],[class*="tabbar"] a,[class*="tabbar"] button,[class*="tabbar"] span,a[href^="#product-description"],a[href^="#product-spec"]')];
    const target = candidates.find(element => valid(element) && labels.test(normalize(element.textContent)) && (!element.matches('a[href]') || /^#/.test(element.getAttribute('href') || '')) && !element.matches('button[type="submit"]'));
    if (!target || target.getAttribute('aria-selected') === 'true') return false;
    target.click(); return true;
  }
  const descriptions = [...document.querySelectorAll(descriptionSelector)].filter(valid);
  const topDescriptions = descriptions.filter(element => !descriptions.some(other => other !== element && other.contains(element)));
  const sellerDescriptionHtml = topDescriptions.map(htmlOf).filter(Boolean).join('\n') || null;
  const sellerDescriptionText = unique(topDescriptions.map(textOf)).join('\n\n') || null;
  const descriptionImages = unique(topDescriptions.flatMap(element => [...element.querySelectorAll('img')].filter(image => valid(image)).map(imageOf)));
  const scopes = [...document.querySelectorAll('.product-specs-list,[class*="specification--"],[class*="specification-list"],[class*="product-prop"],[class*="productProp"],[data-role="specifications"],#product-specification')].filter(valid);
  const featureScopes = [...document.querySelectorAll('[class*="product-feature"],[class*="feature--list"],[data-role="features"]')].filter(valid);
  for (const heading of document.querySelectorAll('h2,h3,h4,strong,[role="heading"]')) {
    if (!valid(heading)) continue;
    const label = normalize(heading.textContent);
    const isSpecs = /^(?:specifications?|item specifics|product specifications)$/i.test(label);
    const isFeatures = /^(?:features|product features|product highlights|highlights)$/i.test(label);
    if (!isSpecs && !isFeatures) continue;
    for (let container = heading.parentElement, depth = 0; container && depth < 4; container = container.parentElement, depth++) {
      if (['BODY','HTML','MAIN'].includes(container.tagName) || container.querySelector('h1,[class*="sku-item--property"]')) break;
      if (isSpecs && container.querySelector('table,dl,li,[class*="specification--prop"],[class*="specification--line"]')) {scopes.push(container); break;}
      if (isFeatures && container.querySelector('li,p,[class*="feature--item"]')) {featureScopes.push(container); break;}
    }
  }
  const specifications = [], seen = new Set();
  const add = (name,value) => {
    name = normalize(name).replace(/[:：]\s*$/,''); value = normalize(value);
    if (!name || !value || name === value) return;
    const identity = JSON.stringify([name,value]);
    if (!seen.has(identity)) {seen.add(identity); specifications.push({name,value});}
  };
  for (const scope of [...new Set(scopes)]) {
    for (const row of scope.querySelectorAll('tr')) {
      if (!valid(row)) continue;
      const cells = [...row.querySelectorAll('th,td')].filter(valid).map(textOf).filter(Boolean);
      if (cells.length >= 2) add(cells[0],cells.slice(1).join(' '));
    }
    for (const term of scope.querySelectorAll('dt')) if (valid(term) && term.nextElementSibling?.tagName === 'DD' && valid(term.nextElementSibling)) add(textOf(term),textOf(term.nextElementSibling));
    const rows = [...scope.querySelectorAll('li,[class*="specification--prop"],[class*="specification--line"],[class*="specification--item"]')].filter(valid);
    if (scope.matches('[class*="specification--prop"],[class*="specification--line"],[class*="specification--item"]')) rows.push(scope);
    for (const row of rows.filter(element => !rows.some(other => other !== element && element.contains(other)))) {
      const name = [...row.querySelectorAll('[class*="name"],[class*="title"],[class*="label"]')].find(valid);
      const value = [...row.querySelectorAll('[class*="value"],[class*="desc"]')].find(valid);
      if (name && value) {add(textOf(name),textOf(value)); continue;}
      const spans = [...row.querySelectorAll('span')].filter(element => valid(element) && !element.querySelector('span')).map(textOf).filter(Boolean);
      if (spans.length >= 2) {add(spans[0],spans.slice(1).join(' ')); continue;}
      const plain = textOf(row).match(/^([^:：\n]+)[:：]\s*([\s\S]+)$/);
      if (plain) add(plain[1],plain[2]);
    }
  }
  if (expand) {
    window.__archiverDetailsExpanded ||= new WeakSet();
    let clicked = 0;
    for (const scope of [...new Set([...topDescriptions,...scopes,...featureScopes])]) {
      for (const button of [...scope.querySelectorAll('button,a,[role="button"],span,div')].reverse()) {
        if (!valid(button) || window.__archiverDetailsExpanded.has(button) || !/^(?:view|show|see|read) more(?:\s*[⌄↓+])?$/i.test(normalize(button.textContent)) || button.querySelector('button,a,[role="button"]') || button.matches('button[type="submit"]') || button.matches('a[href]') && !/^#?$/.test(button.getAttribute('href') || '')) continue;
        window.__archiverDetailsExpanded.add(button); button.click(); clicked++;
        break;
      }
    }
    return clicked;
  }
  const features = unique(featureScopes.flatMap(scope => [...scope.querySelectorAll('li,p,[class*="feature--item"]')].filter(element => valid(element) && !control(element)).map(textOf)));
  return {sellerDescriptionHtml,sellerDescriptionText,descriptionImages,specifications,features};
}

async function captureProductDetails(page) {
  const args = {};
  let result = await evaluateWithTools(page,productDetailsInPage,args);
  const mergeText = (previous,next) => {
    if (!next) return previous || null;
    if (!previous || next.includes(previous)) return next;
    if (previous.includes(next)) return previous;
    return previous + '\n\n' + next;
  };
  const merge = next => {
    for (const field of ['sellerDescriptionHtml','sellerDescriptionText']) result[field] = mergeText(result[field],next[field]);
    result.descriptionImages = [...new Set([...result.descriptionImages,...next.descriptionImages])];
    result.features = [...new Set([...result.features,...next.features])];
    const specs = new Map([...result.specifications,...next.specifications].map(row => [JSON.stringify([row.name,row.value]),row])); result.specifications = [...specs.values()];
  };
  const collectFrames = async () => {
    for (const frame of page.frames().filter(frame => frame !== page.mainFrame())) {
      try {
        const address = frame.url();
        if (/captcha|passport|signin|login|recommend|(?:[\/._-])reviews?(?:[\/?. _-]|$)|_____tmd|punish/i.test(address)) continue;
        const url = new URL(address);
        if (/^https?:$/.test(url.protocol) && !/(^|\.)(aliexpress\.(com|us)|alicdn\.com|aliexpress-media\.com)$/i.test(url.hostname)) continue;
        let descriptionFrame = /desc|detail/i.test(address);
        const element = await frame.frameElement();
        try {
          const identity = await element.evaluate(element => {
            const style = getComputedStyle(element);
            let visible = style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0 && !element.closest('[hidden],[aria-hidden="true"]');
            for (let node = element; node && node !== document.body; node = node.parentElement) if (/recommend|related|feedback|(?:^|[\s_-])reviews?(?:[\s_-]|$)|productReviews?|customerReviews?/i.test(String(node.className || ''))) visible = false;
            return {visible,description:/desc|detail/i.test([element.id,element.className,element.getAttribute('name'),element.getAttribute('data-role')].join(' '))};
          });
          if (!identity.visible) continue;
          descriptionFrame ||= identity.description;
        } finally {await element.dispose();}
        if (!descriptionFrame) continue;
        const html = await frame.locator('body').innerHTML({timeout:1200});
        const clean = await parseDescription(frame,html);
        merge({sellerDescriptionHtml:clean.html,sellerDescriptionText:clean.text,descriptionImages:clean.images,specifications:[],features:[]});
      } catch {}
    }
  };
  await collectFrames();
  for (const tab of [null,'description','specifications']) {
    const clicked = tab ? await evaluateWithTools(page,productDetailsInPage,{...args,tab}) : await evaluateWithTools(page,productDetailsInPage,{...args,expand:true});
    if (!clicked) continue;
    const started = Date.now(), deadline = started + 4500;
    let lastKey = '', changedAt = started;
    while (Date.now() < deadline) {
      await page.waitForTimeout(200);
      await evaluateWithTools(page,productDetailsInPage,{...args,expand:true});
      const snapshot = await evaluateWithTools(page,productDetailsInPage,args); merge(snapshot);
      await collectFrames();
      const description = tab === 'description' || !tab;
      const value = description ? [result.sellerDescriptionText,result.descriptionImages] : [snapshot.specifications,snapshot.features];
      const signature = JSON.stringify(value);
      if (signature !== lastKey) {lastKey = signature; changedAt = Date.now();}
      const nonempty = description ? !!result.sellerDescriptionText || result.descriptionImages.length : snapshot.specifications.length || snapshot.features.length;
      if (nonempty && Date.now() - started >= 1500 && Date.now() - changedAt >= 600) break;
    }
    await collectFrames();
  }
  return result;
}

async function extractPage(page, extraData = [], preferredOverview) {
  const overview = preferredOverview === undefined ? await captureOverview(page) : preferredOverview;
  const data = await evaluateWithTools(page,({extraData}) => {
    const tools = pageTools();
    const {normalize,requestedId,excluded,visible,textOf,original,imageOf,unique,title:visibleTitle,absolute} = tools;
    const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    const arr = value => Array.isArray(value) ? value : [];
    const directId = object => {
      if (!object || typeof object !== 'object') return '';
      for (const field of ['productId','productID','product_id','itemId','itemID','item_id']) {
        const id = text(object[field]); if (/^\d+$/.test(id)) return id;
      }
      for (const field of ['url','productUrl','itemUrl','detailUrl','@id']) {
        const id = text(object[field]).match(/\/(?:item|i)\/(\d+)\.html/i)?.[1]; if (id) return id;
      }
      return '';
    };
    const matching = object => !requestedId || !directId(object) || directId(object) === requestedId;
    const roots = [];
    for (const field of ['runParams','__INIT_DATA__','__INITIAL_STATE__','__NEXT_DATA__','_dida_config_','__AER_DATA__']) {
      try {if (window[field]) roots.push(window[field]);} catch {}
    }
    roots.push(...extraData);
    const modules = {}, scores = {};
    const aliases = {PRODUCT_TITLE:'titleModule',PRODUCT_INFO:'productInfoComponent',IMAGE_PC:'imageModule',IMAGE:'imageModule',SKU:'skuModule',PRICE:'priceModule',PRODUCT_PROP:'specsModule',PRODUCT_DESC:'descriptionModule'};
    const moduleNames = new Set(['titleModule','imageModule','skuModule','priceModule','specsModule','descriptionModule','productInfoComponent','imageComponent','skuComponent','priceComponent','productPropComponent','productDescComponent']);
    const seen = new WeakSet(); let visits = 0;
    function walk(object,depth = 0,inheritedMatch = false) {
      if (!object || typeof object !== 'object' || seen.has(object) || depth > 16 || ++visits > 25000 || !matching(object)) return;
      seen.add(object);
      const knownMatch = inheritedMatch || !!(requestedId && directId(object) === requestedId);
      for (const [field,value] of Object.entries(object)) {
        if (/recommend|related|similar|sponsored|feedback|searchresults|(?:^|[_-])reviews?(?:[_-]|$)|^(?:product|customer)?reviews?(?:list|data|module|component|info)?$/i.test(field)) continue;
        const moduleName = aliases[field] || (moduleNames.has(field) ? field : null);
        if (moduleName && value && typeof value === 'object') {
          const payload = aliases[field] ? value.data || value : value;
          if (matching(payload)) {
            const score = knownMatch || requestedId && directId(payload) === requestedId ? 2 : 0;
            if (!(moduleName in modules) || score > scores[moduleName]) {modules[moduleName] = payload; scores[moduleName] = score;}
          }
        }
        walk(value,depth + 1,knownMatch);
      }
    }
    roots.forEach(root => walk(root));
    const choose = (...names) => names.filter(name => modules[name]).sort((a,b) => scores[b] - scores[a]).map(name => modules[name])[0] || {};
    const titleData = choose('titleModule','productInfoComponent'), imageData = choose('imageModule','imageComponent'), sku = choose('skuModule','skuComponent'), price = choose('priceModule','priceComponent'), specs = choose('specsModule','productPropComponent'), desc = choose('descriptionModule','productDescComponent');
    const structured = [];
    for (const element of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {const value = JSON.parse(element.textContent); structured.push(...arr(value['@graph']),...(Array.isArray(value) ? value : [value]));} catch {}
    }
    const products = structured.filter(value => (value?.['@type'] === 'Product' || arr(value?.['@type']).includes('Product')) && matching(value));
    const observedTitle = visibleTitle();
    const product = products.find(value => requestedId && directId(value) === requestedId) || products.find(value => observedTitle && normalize(value.name) === normalize(observedTitle)) || (!observedTitle && products.length === 1 ? products[0] : {}) || {};
    const title = observedTitle || text(titleData.subject || titleData.title || product.name) || null;
    const gallery = unique([...document.querySelectorAll('[class*="slider--"] img,.images-view-list img,[class*="image-view"] img,[class*="magnifier"] img,.magnifier-image')].filter(element => visible(element) && !excluded(element)).map(imageOf));
    const moduleImages = arr(imageData.imagePathList || imageData.imageUrlList || imageData.imageList).map(value => original(typeof value === 'object' ? value.url || value.imageUrl : value));
    const productImages = (Array.isArray(product.image) ? product.image : product.image ? [product.image] : []).map(value => original(typeof value === 'object' ? value.url : value));
    const trustedImages = Math.max(scores.imageModule ?? -1,scores.imageComponent ?? -1) > 0;
    const images = unique([...gallery,...(!gallery.length || trustedImages ? moduleImages : []),...(!gallery.length || directId(product) === requestedId || normalize(product.name) === normalize(observedTitle) ? productImages : [])]);
    const properties = arr(sku.productSKUPropertyList || sku.skuPropertyList).map(property => ({
      id:text(property.skuPropertyId ?? property.propertyId),name:text(property.skuPropertyName || property.propertyName),
      values:arr(property.skuPropertyValues || property.values).map(value => ({id:text(value.propertyValueId ?? value.skuPropertyValueId),name:text(value.propertyValueDisplayName || value.propertyValueName || value.name),image:original(value.skuPropertyImagePath || value.imageUrl || '') || null}))
    }));
    for (const group of document.querySelectorAll('[class*="sku-item--property"],[class*="sku-item--group"],.sku-property')) {
      if (!visible(group) || excluded(group)) continue;
      const heading = group.querySelector('[class*="sku-item--title"],.sku-title,.sku-property-name'); if (!heading) continue;
      const name = textOf(heading).split(/[:：]/,1)[0].trim(); if (!name) continue;
      const list = group.querySelector('[class*="sku-item--skus"],.sku-property-list') || group;
      const values = [...list.querySelectorAll('[data-sku-col],[data-sku-value-id],[data-property-value-id],[class*="sku-item--text"],[class*="sku-item--image"],.sku-property-item,li')].filter(element => visible(element) && !excluded(element)).map(element => {
        const qualified = (element.getAttribute('data-sku-col') || element.getAttribute('data-sku-id') || '').match(/^([^:;]+):([^;#]+)/);
        const image = element.querySelector('img');
        return {id:element.getAttribute('data-sku-value-id') || element.getAttribute('data-property-value-id') || qualified?.[2] || '',name:element.getAttribute('title') || image?.getAttribute('alt') || textOf(element),image:image ? imageOf(image) || null : null,groupId:qualified?.[1] || ''};
      }).filter(value => value.name);
      const id = group.getAttribute('data-property-id') || group.getAttribute('data-sku-property-id') || values.find(value => value.groupId)?.groupId || '';
      let property = properties.find(property => id && property.id === id || normalize(property.name).toLowerCase() === normalize(name).toLowerCase());
      if (!property) {property = {id,name,values:[]}; properties.push(property);} else {property.name = name; if (id) property.id = id;}
      for (const value of values) {
        const previous = property.values.find(previous => value.id && previous.id === value.id || normalize(previous.name) === normalize(value.name));
        const clean = {id:value.id,name:value.name,image:value.image};
        if (previous) Object.assign(previous,{...clean,id:clean.id || previous.id,image:clean.image || previous.image}); else property.values.push(clean);
      }
    }
    const variations = arr(sku.skuPriceList || sku.skuList).map(row => {
      const value = row.skuVal || row;
      const attributes = text(row.skuAttr || row.skuPropIds || row.skuPropertyIds);
      const names = attributes.split(';').filter(Boolean).map(pair => {
        const [propertyId,rest = ''] = pair.split(':'); const valueId = rest.split('#')[0];
        const property = properties.find(property => property.id === propertyId), option = property?.values.find(value => value.id === valueId);
        return option ? `${property.name}: ${option.name}` : pair;
      });
      return {skuId:text(row.skuId),name:names.join(' / ') || null,attributes:attributes || null,price:value.skuActivityAmount ?? value.skuAmount ?? value.price ?? null,originalPrice:value.skuAmount ?? null,availableQuantity:value.availQuantity ?? value.inventory ?? null,raw:row};
    });
    const specifications = arr(specs.props || specs.productPropList || specs.properties).map(property => ({name:text(property.attrName || property.name),value:text(property.attrValue || property.value)})).filter(property => property.name && property.value);
    const displayed = ['[class*="price-default--current"]','[class*="price--current"]','[class*="price--sale"]','.product-price-current','[itemprop="price"]'].flatMap(selector => [...document.querySelectorAll(selector)]).filter(element => visible(element) && !excluded(element) && !element.closest('del,s,strike')).map(textOf).find(Boolean) || null;
    return {title,titleSource:observedTitle ? 'dom' : title ? 'structured' : null,sourceUrl:location.href,capturedAt:new Date().toISOString(),images,descriptionUrl:absolute(desc.descriptionUrl || desc.detailDesc || '') || null,
      structuredDescriptionHtml:typeof desc.description === 'string' && /<[^>]+>/.test(desc.description) ? desc.description : null,
      structuredDescriptionText:text(product.description) || null,
      properties,sizes:properties.filter(property => /size|尺寸/i.test(property.name)),colors:properties.filter(property => /colou?r|颜色/i.test(property.name)),variations,
      prices:{displayed,structuredOffers:product.offers || null,sourceModule:Object.keys(price).length ? price : null},specifications,features:[],raw:{modules,structuredProduct:product},warnings:[]};
  },{extraData});
  const details = await evaluateWithTools(page,productDetailsInPage,{});
  data.sellerDescriptionHtml = details.sellerDescriptionHtml || data.structuredDescriptionHtml;
  data.sellerDescriptionText = details.sellerDescriptionText || data.structuredDescriptionText;
  data.descriptionHtml = data.sellerDescriptionHtml;
  data.descriptionText = data.sellerDescriptionText;
  data.descriptionSource = data.descriptionText || data.descriptionHtml ? 'seller' : null;
  data.descriptionImages = details.descriptionImages;
  data.specifications = [...new Map([...data.specifications,...details.specifications].map(row => [JSON.stringify([row.name,row.value]),row])).values()];
  data.features = details.features;
  if (overview?.text) {
    data.descriptionText = overview.text; data.descriptionHtml = overview.html; data.descriptionSource = 'ai-overview';
    data.descriptionImages = [...new Set([...data.descriptionImages,...overview.images])];
    data.features = [...new Set([...overview.features || [],...data.features])];
  }
  delete data.structuredDescriptionHtml; delete data.structuredDescriptionText;
  return data;
}

async function parseDescription(page, html, baseUrl) {
  return page.evaluate(({html,baseUrl}) => {
    const document = new DOMParser().parseFromString(html,'text/html');
    for (const element of document.querySelectorAll('script,style,noscript,template,iframe,object,embed,form,link,meta,base')) element.remove();
    for (const element of document.querySelectorAll('*')) for (const attribute of [...element.attributes]) if (/^on/i.test(attribute.name) || /^(javascript|vbscript):/i.test(attribute.value.trim())) element.removeAttribute(attribute.name);
    const images = [];
    const bestSrcset = value => (/^\s*(?:data|blob):/i.test(String(value || '')) ? [] : String(value || '').split(',')).map(part => {
      const match = part.trim().match(/^(\S+)(?:\s+(\d+(?:\.\d+)?)([wx]))?$/);
      return match ? {url:match[1],size:Number(match[2]) || 1} : null;
    }).filter(Boolean).sort((a,b) => b.size - a.size)[0]?.url || '';
    for (const image of document.querySelectorAll('img')) {
      const values = [image.getAttribute('data-original'),bestSrcset(image.getAttribute('data-srcset') || image.getAttribute('srcset')),image.getAttribute('data-src'),image.getAttribute('data-lazy-src'),image.getAttribute('src')];
      for (const value of values) {
        if (!value || /^(?:null|undefined|#|about:blank)$/i.test(value.trim())) continue;
        try {
          const source = value.replace(/(\.(?:jpe?g|png|webp|avif))_\d+x\d+[^/?]*(?=\?|$)/i,'$1');
          const url = new URL(source,baseUrl || location.href);
          if (!/^https?:$/.test(url.protocol)) continue;
          image.src = url.href; images.push(url.href); break;
        } catch {}
      }
    }
    const blocks = new Set(['P','DIV','LI','UL','OL','SECTION','ARTICLE','H1','H2','H3','H4','H5','H6','TR','DT','DD']);
    function readable(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      if (node.tagName === 'BR') return '\n';
      return [...node.childNodes].map(readable).join('') + (blocks.has(node.tagName) ? '\n' : '');
    }
    const text = readable(document.body).replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
    return {html:document.body.innerHTML,text,images:[...new Set(images)]};
  },{html,baseUrl});
}

module.exports = {extractPage,parseDescription,captureOverview,captureProductDetails};
