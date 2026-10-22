const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {existsSync}=require('node:fs');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const {extractPage}=require('../src/extract');
const {captureVisiblePrices}=require('../src/prices');
const {readPriceState}=require('../src/price-page');
const {makeArchive}=require('../src/archive');
const {convertToJpeg}=require('../src/jpeg');
const {unzip,archiveTable}=require('./workbook');
const {hoops,designs,prices,imageUrl,hoopHtml}=require('./hoop-fixtures');
let browser,tmp;
const options={settleMs:30,timeoutMs:1000},queue={checkpoint:async()=>{}};
before(async()=>{tmp=await fs.mkdtemp(path.join(os.tmpdir(),'hoop-prices-'));browser=await chromium.launch({headless:true,...(process.env.TEST_CHROMIUM?{executablePath:process.env.TEST_CHROMIUM}:existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});});
after(async()=>{await browser?.close();await fs.rm(tmp,{recursive:true,force:true});});
async function fixture(settings={}){const page=await browser.newPage();await page.route('https://www.aliexpress.com/**',route=>route.fulfill({contentType:'text/html',body:hoopHtml('731',settings)}));await page.goto('https://www.aliexpress.com/item/731.html');return page;}
for(const catalog of ['partial','full','none'])test(`${catalog} catalog captures each design with all three actual hoop prices`,async()=>{
  const page=await fixture({catalog});try{
    const product=await extractPage(page);await captureVisiblePrices(page,product,queue,options);
    const confirmed=product.variations.filter(variant=>variant.displayedPrice);assert.equal(confirmed.length,12);
    const keys=new Set();for(const variant of confirmed){const design=variant.observedOptions.find(option=>option.name==='Color')?.value,hoop=variant.observedOptions.find(option=>option.name==='Size')?.value;const key=design+'/'+hoop;assert(!keys.has(key));keys.add(key);assert.equal(variant.displayedPrice,prices[designs.indexOf(design)][hoops.indexOf(hoop)]);}
    assert.equal(product.prices.displayedUnassigned,false);assert((await page.evaluate(()=>window.optionClicks))<40,'Do not repeatedly revisit already observed combinations');
    const restored=await readPriceState(page);assert.equal(restored.groups[0].values.find(value=>value.selected).name,'set 4');assert.equal(restored.groups[1].values.find(value=>value.selected).name,'without hoop');
  }finally{await page.close();}
});
test('each design/hoop Excel row points only to its own confirmed-cost JPEG',async()=>{
  const page=await fixture();try{
    const product=await extractPage(page);await captureVisiblePrices(page,product,queue,options);
    const colors=['#137c53','#ba3434','#d79d24','#277aa7'],sources=[];
    for(const color of colors)sources.push(Buffer.from(await page.evaluate(color=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,320,240);return canvas.toDataURL('image/png').split(',')[1];},color),'base64'));
    const requests=[];const result=await makeArchive(product,tmp,{get:async url=>{requests.push(url);return {ok:()=>true,url:()=>url,headers:()=>({'content-type':'image/png'}),body:async()=>sources[designs.findIndex((_,index)=>imageUrl(index)===url)]};}},async()=>{},(bytes,mime)=>convertToJpeg(page,bytes,mime));
    const table=await archiveTable(result.path),entries=await unzip(result.path),rows=table.slice(1).map(row=>Object.fromEntries(table[0].map((name,index)=>[name,row[index]])));
    assert.equal(rows.length,12);assert.equal(result.images,12);assert.equal(requests.length,4);
    for(const row of rows){const expected=prices[designs.indexOf(row.Color)][hoops.indexOf(row.Size)];assert.equal(row.Price,expected);const images=row.Images.split('\n');assert.equal(images.length,1);assert(images[0].includes(`Color-${row.Color}-Size-${row.Size}-cost-${expected}-`));assert.equal(entries[images[0]].readUInt16BE(0),0xffd8);}
  }finally{await page.close();}
});
test('a disabled design/hoop combination is not invented during discovery',async()=>{
  const page=await fixture({disabled:true});try{const product=await extractPage(page);await captureVisiblePrices(page,product,queue,options);const confirmed=product.variations.filter(variant=>variant.displayedPrice);assert.equal(confirmed.length,11);assert(!confirmed.some(variant=>variant.observedOptions.some(option=>option.value==='set 1')&&variant.observedOptions.some(option=>option.value==='with 3 hoops')));}finally{await page.close();}
});
test('a hoop switch without a fresh price never copies the previous hoop cost',async()=>{
  const page=await fixture({stale:true});try{const product=await extractPage(page);await captureVisiblePrices(page,product,queue,{...options,timeoutMs:350});assert(product.warnings.some(warning=>/fresh price|price update/.test(warning)));assert(!product.variations.some(variant=>variant.displayedPrice&&variant.observedOptions.some(option=>option.value==='with 1 hoop')));}finally{await page.close();}
});
test('independent design, physical size and hoop groups each keep their own complete combination price',async()=>{
  const page=await fixture({sizes:true});try{
    const product=await extractPage(page);await captureVisiblePrices(page,product,queue,options);const confirmed=product.variations.filter(variant=>variant.displayedPrice);assert.equal(confirmed.length,24);const seen=new Set();
    for(const variant of confirmed){assert.equal(variant.observedOptions.length,3);const value=name=>variant.observedOptions.find(option=>option.name===name).value;const key=[value('Color'),value('Size'),value('Hoop')].join('/');assert(!seen.has(key));seen.add(key);const amount=prices[designs.indexOf(value('Color'))][hoops.indexOf(value('Hoop'))],expected=value('Size')==='20 cm'?'$'+(Number(amount.slice(1))+0.75).toFixed(2):amount;assert.equal(variant.displayedPrice,expected);}
  }finally{await page.close();}
});
test('one design with a partial catalog still captures all three visible hoop options',async()=>{
  const page=await fixture();try{
    await page.evaluate(()=>{document.querySelector('[data-property-id="14"]').hidden=true;const sku=window.runParams.skuModule;sku.productSKUPropertyList=sku.productSKUPropertyList.filter(property=>property.skuPropertyId!==14);sku.skuPriceList=[{skuId:'one-design',skuAttr:'5:20',skuVal:{skuAmount:{value:'999.00',currency:'USD'}}}];});
    const product=await extractPage(page);await captureVisiblePrices(page,product,queue,options);assert.equal(product.variations.filter(variant=>variant.displayedPrice).length,3);assert.deepEqual(new Set(product.variations.map(variant=>variant.displayedPrice)),new Set(prices[3]));
  }finally{await page.close();}
});
test('discovery safety limits produce an explicit warning instead of silently claiming complete pricing',async()=>{
  const page=await fixture();try{const product=await extractPage(page);await captureVisiblePrices(page,product,queue,{...options,maxObservedRows:3});assert.equal(product.variations.filter(variant=>variant.displayedPrice).length,3);assert(product.warnings.some(warning=>warning.includes('safety limit')));}finally{await page.close();}
});
