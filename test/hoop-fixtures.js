// Controlled option/price fixtures, not live AliExpress prices.
const hoops=['without hoop','with 1 hoop','with 3 hoops'];
const designs=['set 1','set 2','set 3','set 4'];
const prices=[['$10.10','$12.20','$15.30'],['$11.15','$13.25','$16.35'],['$12.40','$14.50','$18.60'],['$14.15','$17.25','$20.35']];
const imageUrl=design=>`https://ae01.alicdn.com/kf/hoop-design-${design+1}.png`;
function hoopHtml(id,{catalog='partial',stale=false,disabled=false,sizes=false}={}){
  const properties=[{skuPropertyId:14,skuPropertyName:'Color',skuPropertyValues:designs.map((name,index)=>({propertyValueId:index+1,propertyValueDisplayName:name,skuPropertyImagePath:imageUrl(index)}))},{skuPropertyId:5,skuPropertyName:'Size',skuPropertyValues:hoops.map((name,index)=>({propertyValueId:index+20,propertyValueDisplayName:name}))}];
  if(sizes){properties[1].skuPropertyName='Hoop';properties.push({skuPropertyId:6,skuPropertyName:'Size',skuPropertyValues:[{propertyValueId:1,propertyValueDisplayName:'15 cm'},{propertyValueId:2,propertyValueDisplayName:'20 cm'}]});}
  const skuPriceList=designs.flatMap((_,design)=>hoops.flatMap((_,hoop)=>catalog==='none'||catalog==='partial'&&hoop!==0?[]:[{skuId:`design-${design+1}-hoop-${hoop}`,skuAttr:`14:${design+1};5:${hoop+20}${sizes?';6:1':''}`,skuVal:{skuAmount:{currency:'USD',value:'999.00'}}}]));
  return `<!doctype html><html><body><h1>3pcs Set Christmas Embroidery Kit with EN Instructions</h1><div class="product-price"><span class="price-default--current" id="price">${prices[3][0]}</span><small>3 pcs, $4.72/pc</small></div>
  <div class="sku-item--property" data-property-id="14"><div class="sku-item--title">Color: <span id="color-label">set 4</span></div><div class="sku-item--skus">${designs.map((name,index)=>`<button type="button" class="sku-item--image ${index===3?'sku-item--selected':''}" data-sku-col="14:${index+1}" title="${name}" aria-pressed="${index===3}"><img alt="${name}" data-src="${imageUrl(index)}"></button>`).join('')}</div></div>
  <div class="sku-item--property" data-property-id="5"><div class="sku-item--title">${sizes?'Hoop':'Size'}: <span id="size-label">without hoop</span></div><div class="sku-item--skus">${hoops.map((name,index)=>`<button type="button" class="sku-item--text ${index===0?'sku-item--selected':''}" data-sku-col="5:${index+20}" title="${name}" aria-pressed="${index===0}">${name}</button>`).join('')}</div></div>
  ${sizes?'<div class="sku-item--property" data-property-id="6"><div class="sku-item--title">Size: <span id="dimension-label">15 cm</span></div><div class="sku-item--skus"><button type="button" class="sku-item--text sku-item--selected" data-sku-col="6:1" title="15 cm" aria-pressed="true">15 cm</button><button type="button" class="sku-item--text" data-sku-col="6:2" title="20 cm" aria-pressed="false">20 cm</button></div></div>':''}
  <p class="product-description">Fixture cotton embroidery kit with selectable hoop packaging.</p><script>
  window.runParams=${JSON.stringify({productId:String(id),skuModule:{productSKUPropertyList:properties,skuPriceList}})};
  window.priceEvents=[{design:3,hoop:0,price:${JSON.stringify(prices[3][0])}}];window.optionClicks=0;
  const prices=${JSON.stringify(prices)},stale=${JSON.stringify(stale)},disabled=${JSON.stringify(disabled)},sizes=${JSON.stringify(sizes)};
  for(const button of document.querySelectorAll('[data-sku-col]'))button.onclick=()=>{
    if(button.getAttribute('aria-pressed')==='true'||button.getAttribute('aria-disabled')==='true')return;
    window.optionClicks++;
    for(const sibling of button.parentElement.children){sibling.setAttribute('aria-pressed','false');sibling.classList.remove('sku-item--selected');}
    button.setAttribute('aria-pressed','true');button.classList.add('sku-item--selected');
    const design=Number(document.querySelector('[data-property-id="14"] [aria-pressed="true"]').dataset.skuCol.split(':')[1])-1;
    const hoop=Number(document.querySelector('[data-property-id="5"] [aria-pressed="true"]').dataset.skuCol.split(':')[1])-20;
    const dimension=sizes?Number(document.querySelector('[data-property-id="6"] [aria-pressed="true"]').dataset.skuCol.split(':')[1])-1:0;
    if(sizes)document.getElementById('dimension-label').textContent=['15 cm','20 cm'][dimension];
    document.getElementById('color-label').textContent=${JSON.stringify(designs)}[design];document.getElementById('size-label').textContent=${JSON.stringify(hoops)}[hoop];
    if(disabled){document.querySelector('[data-sku-col="5:22"]').setAttribute('aria-disabled',String(design===0));document.querySelector('[data-sku-col="14:1"]').setAttribute('aria-disabled',String(hoop===2));}
    if(stale&&hoop===1)return;
    const price=document.getElementById('price');price.setAttribute('aria-busy','true');
    setTimeout(()=>{const amount=dimension?'$'+(Number(prices[design][hoop].slice(1))+0.75).toFixed(2):prices[design][hoop];price.textContent=amount;price.removeAttribute('aria-busy');window.priceEvents.push({design,hoop,dimension,price:amount});},70);
  };</script></body></html>`;
}
module.exports={hoops,designs,prices,imageUrl,hoopHtml};
