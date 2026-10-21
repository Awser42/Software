// Read only the current product UI. Catalog price JSON cannot identify the
// account's currently selected option or the price Chromium actually shows.
function inspectPricePage(selection) {
  const normalize = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  const key = value => normalize(value).toLowerCase();
  const groupSelector = '[class*="sku-item--property"], [class*="sku-item--group"], .sku-property, [role="radiogroup"][data-sku-property-id]';
  const titleSelector = '[class*="sku-item--title"], .sku-title, .sku-property-name, [data-sku-title]';
  const isVisible = element => {
    if (!element || element.closest('[hidden], [aria-hidden="true"], [role="dialog"], [role="tooltip"], dialog')) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && element.getClientRects().length > 0;
  };
  const excluded = element => {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      if (['DEL', 'S', 'STRIKE', 'ASIDE', 'HEADER', 'FOOTER', 'NAV'].includes(node.tagName)) return true;
      if (/recommend|related|sidebar|shipping|delivery|coupon|discount|original|old[-_]?price|crossed|strikethrough|review/i.test(String(node.className || ''))) return true;
      if (getComputedStyle(node).textDecorationLine.includes('line-through')) return true;
    }
    return false;
  };
  const visibleText = element => {
    if (!isVisible(element)) return '';
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const values = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !isVisible(parent) || excluded(parent) || parent.closest('script,style,noscript,template')) continue;
      values.push(node.textContent);
    }
    return normalize(values.join(''));
  };
  const firstAttribute = (element, names) => {
    for (const name of names) {
      const value = normalize(element.getAttribute(name));
      if (value) return value;
    }
    return '';
  };
  const qualifiedId = value => {
    const match = String(value || '').match(/^([^:;]+):([^;#]+)(?:#[^;]*)?$/);
    return match ? {group:match[1], value:match[2]} : null;
  };
  const selectedOption = element => {
    if (element.getAttribute('aria-pressed') === 'true' || element.getAttribute('aria-checked') === 'true' || /^(true|1)$/i.test(element.getAttribute('data-selected') || '') || element.getAttribute('data-state') === 'checked') return true;
    if (element.matches('input') && element.checked) return true;
    if (element.querySelector('input:checked')) return true;
    return String(element.className || '').split(/\s+/).some(token => !/unselected|not[-_]selected|inactive/i.test(token) && /(?:^|[-_])(?:selected|active|checked)(?:[-_]|$)/i.test(token));
  };
  const disabledOption = element => {
    if (element.disabled || element.closest('fieldset[disabled]') || [element.getAttribute('aria-disabled'), element.getAttribute('data-disabled')].some(value => /^(true|1)$/i.test(value || ''))) return true;
    if (element.querySelector('input:disabled')) return true;
    if (getComputedStyle(element).pointerEvents === 'none') return true;
    return /(?:^|[\s_-])(?:disabled|unavailable|soldout|sold-out|out-of-stock)(?:[\s_-]|$)/i.test(String(element.className || ''));
  };
  const safeOption = element => {
    if (!isVisible(element) || excluded(element) || element.closest('[data-action="buy"], [data-action="add-to-cart"], [class*="buy-now"], [class*="add-to-cart"]')) return false;
    if (element.matches('button[type="submit"], input[type="submit"]') || (element.matches('button') && element.closest('form') && element.getAttribute('type') !== 'button')) return false;
    if (element.matches('a[href]') && !/^#?$/.test(element.getAttribute('href') || '')) return false;
    const label = [visibleText(element), element.getAttribute('aria-label'), element.getAttribute('title'), element.querySelector('img')?.getAttribute('alt')].filter(Boolean).join(' ');
    return !/\b(?:buy now|add to cart|checkout|place order)\b/i.test(label);
  };

  const groups = [];
  for (const element of document.querySelectorAll(groupSelector)) {
    if (!isVisible(element) || excluded(element)) continue;
    const title = [...element.querySelectorAll(titleSelector)].find(node => isVisible(node) && node.closest(groupSelector) === element);
    const label = title ? visibleText(title) : normalize(element.getAttribute('aria-label'));
    if (!label) continue;
    const list = [...element.querySelectorAll('[class*="sku-item--skus"], .sku-property-list, [role="radiogroup"]')].find(node => isVisible(node) && node.closest(groupSelector) === element) || element;
    const optionSelector = '[data-sku-col], [data-sku-value-id], [data-property-value-id], [data-sku-id], .sku-property-item, li, [class*="sku-item--text"], [class*="sku-item--image"], [class*="sku-item--item"], [role="radio"]';
    const candidates = [...list.querySelectorAll(optionSelector + (list !== element || element.matches('[role="radiogroup"]') ? ', button' : ''))]
      .filter(node => node.closest(groupSelector) === element && safeOption(node));
    // A parent option and its nested span may both carry SKU attributes. Keep
    // the outer option, so there is only one target for a rendered choice.
    const options = candidates.filter(node => !candidates.some(other => other !== node && other.contains(node)));
    const values = options.map((node, index) => {
      const qualified = qualifiedId(firstAttribute(node, ['data-sku-col', 'data-sku-id']));
      const explicitId = firstAttribute(node, ['data-sku-value-id', 'data-property-value-id', 'data-value-id']);
      const id = qualifiedId(explicitId)?.value || explicitId || qualified?.value || '';
      const image = node.querySelector('img');
      const name = firstAttribute(node, ['data-value-name', 'title']) || normalize(image?.getAttribute('alt')) || visibleText(node) || normalize(node.getAttribute('aria-label'));
      return {id, name, selected:selectedOption(node), disabled:disabledOption(node), index, element:node, qualifiedGroup:qualified?.group || ''};
    }).filter(value => value.id || value.name);
    if (!values.length) continue;
    const qualifiedGroups = [...new Set(values.map(value => value.qualifiedGroup).filter(Boolean))];
    const id = firstAttribute(element, ['data-sku-property-id', 'data-sku-prop-id', 'data-property-id', 'data-pid']) || (qualifiedGroups.length === 1 ? qualifiedGroups[0] : '');
    let name = label.split(/[:：]/, 1)[0].trim();
    // Some layouts put the selected value in a child span without a colon.
    if (name === label && title) {
      const leading = normalize([...title.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(''));
      if (leading && leading !== label) name = leading.replace(/[:：]\s*$/, '').trim();
    }
    groups.push({id, name, values, element});
  }

  if (selection && typeof selection === 'object') {
    const exactGroupId = normalize(selection.groupId);
    let matchingGroups = exactGroupId ? groups.filter(group => group.id && group.id === exactGroupId) : [];
    if (!matchingGroups.length && normalize(selection.groupName)) matchingGroups = groups.filter(group => key(group.name) === key(selection.groupName));
    if (matchingGroups.length !== 1) return false;
    const group = matchingGroups[0];
    const exactValueId = normalize(selection.valueId);
    let matchingValues = exactValueId ? group.values.filter(value => value.id && value.id === exactValueId) : [];
    if (!matchingValues.length && normalize(selection.valueName)) matchingValues = group.values.filter(value => key(value.name) === key(selection.valueName));
    if (matchingValues.length !== 1) return false;
    const value = matchingValues[0];
    if (value.disabled || !safeOption(value.element)) return false;
    if (!value.selected) value.element.click();
    return true;
  }

  const headings = [...document.querySelectorAll('h1[data-pl="product-title"],h1[class*="title"],h1')].filter(node => isVisible(node) && !excluded(node));
  const distance = element => {
    if (!headings.length) return 0;
    const ancestors = [];
    for (let node = element; node; node = node.parentElement) ancestors.push(node);
    let best = Number.MAX_SAFE_INTEGER;
    for (const heading of headings) {
      let steps = 0;
      for (let node = heading; node; node = node.parentElement, steps++) {
        const index = ancestors.indexOf(node);
        if (index >= 0) { best = Math.min(best, index + steps); break; }
      }
    }
    return best;
  };
  const selectors = ['[class*="price-default--current"]', '[class*="price--current"]', '[class*="price--sale"]', '.product-price-current', '[itemprop="price"]'];
  const currentPrice = () => {
    const prices = [];
    const seen = new Set();
    selectors.forEach((selector, priority) => {
      for (const element of document.querySelectorAll(selector)) {
        if (seen.has(element) || !isVisible(element) || excluded(element)) continue;
        seen.add(element);
        const text = visibleText(element).replace(/([$€£¥₹₽₩])\s+(?=\d)/g, '$1').replace(/(\d)\s*([.,])\s*(?=\d)/g, '$1$2');
        if (/\d/.test(text)) prices.push({element, text, priority, distance:distance(element)});
      }
    });
    prices.sort((a, b) => a.priority - b.priority || a.distance - b.distance);
    return prices[0] || null;
  };
  const current = currentPrice();
  if (selection === 'begin-price-observation') {
    window.__archiverPriceWatch?.observer?.disconnect();
    const watch = {revision:0, element:current?.element || null, contentNodes:new Set(), observer:null};
    const contentNodes = element => {
      const nodes = new Set();
      if (!element || !isVisible(element) || excluded(element)) return nodes;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (normalize(node.textContent) && isVisible(node.parentElement) && !excluded(node.parentElement)) nodes.add(node);
      }
      return nodes;
    };
    watch.contentNodes = contentNodes(watch.element);
    const contains = (container, node) => container === node || (typeof container?.contains === 'function' && container.contains(node));
    watch.observer = new MutationObserver(records => {
      const previousElement = watch.element;
      const nextElement = currentPrice()?.element || null;
      const nextContent = contentNodes(nextElement || previousElement);
      let changed = false;
      for (const record of records) {
        if (record.type === 'attributes') {
          // Loading signals count only on the actual price or its nearby
          // wrapper, never the selected-option classes or other product UI.
          for (const price of [previousElement,nextElement].filter(Boolean)) {
            let ancestor = price;
            for (let depth = 0; ancestor && depth < 4 && !['BODY','HTML'].includes(ancestor.tagName); depth++, ancestor = ancestor.parentElement) {
              if (ancestor === record.target && isVisible(ancestor) && !excluded(ancestor)) changed = true;
            }
          }
          continue;
        }
        if (record.type === 'characterData') {
          if (watch.contentNodes.has(record.target) || nextContent.has(record.target)) changed = true;
          continue;
        }
        for (const removed of record.removedNodes) {
          if ((previousElement && contains(removed,previousElement)) || [...watch.contentNodes].some(node => contains(removed,node))) changed = true;
        }
        for (const added of record.addedNodes) {
          if ((nextElement && contains(added,nextElement)) || [...nextContent].some(node => contains(added,node))) changed = true;
        }
      }
      if (changed) watch.revision++;
      if (nextElement) watch.element = nextElement;
      watch.contentNodes = nextContent;
    });
    watch.observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-busy','data-loading']});
    window.__archiverPriceWatch = watch;
    return 0;
  }
  const isLoading = element => {
    if (!element || !isVisible(element)) return false;
    if (element.closest('[aria-busy="true"], [data-loading="true"]')) return true;
    for (let node = element, depth = 0; node && node !== document.body && depth < 4; node = node.parentElement, depth++) {
      if (/(?:^|[\s_-])(?:loading|skeleton|spinner)(?:[\s_-]|$)/i.test(String(node.className || ''))) return true;
    }
    const block = element.closest('[class*="price-default--wrap"], [class*="price--wrap"], .product-price');
    return !!block && [...block.querySelectorAll('[aria-busy="true"], [data-loading="true"], [class*="loading"], [class*="skeleton"], [class*="spinner"]')].some(isVisible);
  };
  const loading = current ? isLoading(current.element) : [...document.querySelectorAll('[class*="price-default--"], [class*="price--"], .product-price')].some(element => !excluded(element) && isLoading(element));
  const selectedIds = [...document.querySelectorAll('[data-selected-sku-id], [data-current-sku-id]')]
    .filter(element => isVisible(element) && !excluded(element))
    .map(element => firstAttribute(element, ['data-selected-sku-id', 'data-current-sku-id'])).filter(Boolean);
  const uniqueSelectedIds = [...new Set(selectedIds)];
  return {
    displayed:current?.text || null,
    loading,
    revision:Number(window.__archiverPriceWatch?.revision) || 0,
    groups:groups.map(({id, name, values}) => ({id, name, values:values.map(({id, name, selected, disabled, index}) => ({id, name, selected, disabled, index}))})),
    selectedSkuId:uniqueSelectedIds.length === 1 ? uniqueSelectedIds[0] : null,
    productId:location.pathname.match(/\/(?:item|i)\/(\d+)\.html/i)?.[1] || null
  };
}

async function readPriceState(page) {
  return page.evaluate(inspectPricePage, null);
}

async function selectObservedValue(page, selection) {
  if (!selection || typeof selection !== 'object') return false;
  return page.evaluate(inspectPricePage, selection);
}

async function beginPriceObservation(page) {
  return page.evaluate(inspectPricePage, 'begin-price-observation');
}

async function endPriceObservation(page) {
  return page.evaluate(() => {
    window.__archiverPriceWatch?.observer?.disconnect();
    delete window.__archiverPriceWatch;
  });
}

module.exports = {readPriceState, selectObservedValue, beginPriceObservation, endPriceObservation};
