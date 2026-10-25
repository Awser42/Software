// Controlled option/price examples, not live account data.
const imageUrl = design => `https://ae01.alicdn.com/kf/fixture-${design}.png`;
const designColors = {C1:'#cf2020', C2:'#207e25', C3:'#2030cf', C4:'#bf20bf', C5:'#20bfbf', C6:'#cf8020', shared:'#dddddd'};
const fixed = Object.fromEntries(Object.keys(designColors).filter(key => key !== 'shared').map((design, index) => [design, [
  {id:'20', label:'without hoop', price:design === 'C1' ? '$5.25' : `$${(5.30 + index / 10).toFixed(2)}`},
  {id:'21', label:'with 20cm hoop', price:design === 'C1' || design === 'C4' ? '$6.89' : `$${(7.10 + index / 10).toFixed(2)}`}
]]));
const dependent = {
  C1:[{id:'20',label:'15 cm without hoop',price:'$5.25'}, {id:'21',label:'20 cm with hoop',price:'$6.89'}],
  C2:[{id:'30',label:'10 cm without hoop',price:'$3.10'}, {id:'31',label:'18 cm with hoop',price:'$6.89'}, {id:'32',label:'25 cm with hoop',price:'$9.40'}],
  C4:[{id:'40',label:'30 cm with hoop',price:'$12.70'}]
};

function html(id, catalog, resetSizes, {staleSku=null}={}) {
  const designs = Object.keys(catalog), initial = catalog[designs[0]];
  const properties = [
    {skuPropertyId:14,skuPropertyName:'Color',skuPropertyValues:designs.map(design => ({propertyValueId:design,propertyValueDisplayName:design,skuPropertyImagePath:imageUrl(design)}))},
    {skuPropertyId:5,skuPropertyName:'Size',skuPropertyValues:initial.map(size => ({propertyValueId:size.id,propertyValueDisplayName:size.label}))}
  ];
  // This response looks complete for the initial size list, but does not know
  // the design-dependent sizes revealed later by the real controls.
  const skuPriceList = designs.flatMap(design => initial.map(size => ({skuId:`${design}-${size.id}`,skuAttr:`14:${design};5:${size.id}`,skuVal:{skuAmount:{currency:'USD',value:'999.00'}}})));
  return `<!doctype html><html><body><h1>Fixture example - design and size mapping (not live product data)</h1>
  <div class="product-price"><span id="price" class="price-default--current">${initial[0].price}</span></div>
  <div class="sku-item--property" data-property-id="14"><div class="sku-item--title">Color</div><div class="sku-item--skus">${designs.map((design, index) => `<button type="button" class="sku-item--image" data-sku-col="14:${design}" title="${design}" aria-pressed="${index === 0}"><img data-src="${imageUrl(design)}" alt="${design}"></button>`).join('')}</div></div>
  <div class="sku-item--property" data-property-id="5"><div class="sku-item--title">Size</div><div id="sizes" class="sku-item--skus">${initial.map((size, index) => `<button type="button" class="sku-item--text" data-sku-col="5:${size.id}" title="${size.label}" aria-pressed="${index === 0}">${size.label}</button>`).join('')}</div></div>
  ${staleSku ? `<div data-selected-sku-id="${staleSku}">Stale selected SKU</div>` : ''}
  <script>
  window.runParams=${JSON.stringify({productId:id,skuModule:{productSKUPropertyList:properties,skuPriceList}})};
  const catalog=${JSON.stringify(catalog)},resetSizes=${JSON.stringify(resetSizes)};
  document.addEventListener('click',event=>{
    const button=event.target.closest('button[data-sku-col]');if(!button||button.getAttribute('aria-pressed')==='true')return;
    for(const other of button.parentElement.children)other.setAttribute('aria-pressed','false');button.setAttribute('aria-pressed','true');
    const design=document.querySelector('[data-property-id="14"] [aria-pressed="true"]').title;
    if(resetSizes&&button.dataset.skuCol.startsWith('14:'))document.getElementById('sizes').innerHTML=catalog[design].map(size=>'<button type="button" class="sku-item--text" data-sku-col="5:'+size.id+'" title="'+size.label+'">'+size.label+'</button>').join('');
    const selected=document.querySelector('[data-property-id="5"] [aria-pressed="true"]');
    const size=selected&&catalog[design].find(size=>size.id===selected.dataset.skuCol.split(':')[1]);
    if(window.blockHoopPrice&&selected?.dataset.skuCol==='5:21')return;
    const price=document.getElementById('price');price.setAttribute('aria-busy','true');
    setTimeout(()=>{price.textContent=size?size.price:'';price.removeAttribute('aria-busy');},65);
  });</script></body></html>`;
}

module.exports={imageUrl,designColors,fixed,dependent,html};
