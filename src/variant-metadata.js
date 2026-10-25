const {createHash} = require('node:crypto');

const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const key = value => normalize(value).toLowerCase();
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);
const designGroup = name => /design|pattern|style|model|colou?r|图案|款式|颜色/i.test(name);
const sizeGroup = name => /size|dimension|尺寸/i.test(name);
const packGroup = name => /hoop|frame|pack|bundle|quantity|绣绷|框|包装|数量/i.test(name);
const optionKey = option => [String(option.propertyId || key(option.name)), String(option.id || key(option.value))];
const canonical = options => options.map(optionKey).sort((a, b) => {const x=JSON.stringify(a),y=JSON.stringify(b);return x<y?-1:x>y?1:0;});
const optionText = options => options.map(option => `${normalize(option.name)}: ${normalize(option.value)}`).join(' / ');

function variantMetadata(product, variant, options) {
  const productId = String(product.productId || product.sourceUrl || '');
  const designs = options.filter(option => designGroup(option.name));
  const sizes = options.filter(option => sizeGroup(option.name));
  // AliExpress often calls a hoop/pack selector "Size". Preserve its exact
  // label and value; "without hoop" is not a measurement of zero centimetres.
  const packs = options.filter(option => packGroup(option.name) || sizeGroup(option.name) && /hoop|frame|pack|bundle|绣绷|框|包装/i.test(option.value));
  const identity = options.length ? canonical(options) : [variant?.skuId || variant?.attributes || variant?.name || 'product-level'];
  return {
    'Product ID': String(product.productId || ''),
    'Variant ID': variant ? 'V' + digest([productId, identity]) : '',
    'Design ID': designs.length ? 'D' + digest([productId, canonical(designs)]) : '',
    Design: designs.map(option => normalize(option.value)).join(' / '),
    Size: sizes.map(option => normalize(option.value)).join(' / '),
    'Hoop / Pack': packs.map(option => normalize(option.value)).join(' / '),
    Options: optionText(options),
    'Options JSON': JSON.stringify(options.map(option => ({name:normalize(option.name), value:normalize(option.value), propertyId:String(option.propertyId || ''), valueId:String(option.id || '')})))
  };
}

function priceCurrency(price) {
  const text = normalize(price);
  const code = text.match(/\b(?:USD|EUR|GBP|CAD|AUD|NZD|SGD|HKD|JPY|CNY|INR|PKR|AED|SAR|BRL|RUB|KRW|TRY|PLN|SEK|NOK|DKK|CHF|ZAR|MXN)\b/i)?.[0];
  if (code) return code.toUpperCase();
  if (/^US\s*\$/i.test(text)) return 'USD';
  // A bare dollar sign does not establish USD rather than another dollar.
  return text.match(/[$€£¥₹₽₩₺]/)?.[0] || '';
}

module.exports = {variantMetadata, priceCurrency, designGroup, optionKey};
