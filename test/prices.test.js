const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {existsSync}=require('node:fs');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const yauzl=require('yauzl');
const {captureVisiblePrices}=require('../src/prices');
const {readPriceState}=require('../src/price-page');
const {makeArchive}=require('../src/archive');
let browser,tmp;
const queue={checkpoint:async()=>{}};
const options={settleMs:60,timeoutMs:1100};
function product({variations=true}={}){return {title:'Dragonfly Embroidery Starter Kit',descriptionText:'Observed embroidery kit description.',sourceUrl:'https://www.aliexpress.com/item/3256810248416998.html',productId:'3256810248416998',capturedAt:new Date().toISOString(),images:[],descriptionImages:[],warnings:[],properties:[{id:'5',name:'Size',values:[{id:'20',name:'20*20cm'},{id:'21',name:'15X15cm'}]}],variations:variations?[{skuId:'large',attributes:'5:20',name:'Size: 20*20cm',price:{currency:'USD',value:'99.00'}},{skuId:'small',attributes:'5:21',name:'Size: 15X15cm',price:{currency:'USD',value:'88.00'}}]:[],prices:{displayed:'$8.15',sourceModule:{minActivityAmount:{currency:'USD',value:'77.00'}}}};}
async function fixture({small='normal',ambiguous=false,secondGroup=false}={}){
 const page=await browser.newPage();
 await page.route('https://www.aliexpress.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await page.goto('https://www.aliexpress.com/item/3256810248416998.html');
 await page.setContent(`<!doctype html><html><body>
 <h1>Dragonfly Embroidery Starter Kit</h1>
 <div hidden class="price-default--current">$199.00</div>
 <div class="shipping-cost"><span class="price-default--current">Shipping $40.00</span></div>
 <div class="coupon-panel"><span class="price-default--current">Coupon $2.00</span></div>
 <del class="price-default--current">$99.00</del>
 <div class="recommendations"><span class="price-default--current">$500.00</span></div>
 <div class="product-price"><span id="price" class="price-default--current">$8.15</span></div>
 <div class="sku-item--property" data-property-id="5"><div id="size-title" class="sku-item--title">Size${ambiguous?'':':20*20cm'}</div><div class="sku-item--skus">
 <button class="sku-item--text ${ambiguous?'':'sku-item--selected'}" data-sku-col="5:20" aria-pressed="${!ambiguous}" title="20*20cm">20*20cm</button>
 <button class="sku-item--text" data-sku-col="5:21" aria-pressed="false" title="15X15cm">15X15cm</button>
 </div></div>
 ${secondGroup?'<div class="sku-item--property" data-property-id="14"><div class="sku-item--title">Color:Red</div><div class="sku-item--skus"><button class="sku-item--text sku-item--selected" data-sku-col="14:1" aria-pressed="true" title="Red">Red</button><button class="sku-item--text" data-sku-col="14:2" aria-pressed="false" title="Blue">Blue</button></div></div>':''}
 <script>window.clicks=[];window.priceUpdates=[];for(const button of document.querySelectorAll('[data-sku-col]'))button.onclick=()=>{window.clicks.push(button.dataset.skuCol);const group=button.closest('.sku-item--property');if(button.getAttribute('aria-pressed')==='true')return;for(const sibling of group.querySelectorAll('[data-sku-col]')){sibling.classList.remove('sku-item--selected');sibling.setAttribute('aria-pressed','false');}button.classList.add('sku-item--selected');button.setAttribute('aria-pressed','true');group.querySelector('.sku-item--title').textContent=(button.dataset.skuCol.startsWith('5:')?'Size:':'Color:')+button.title;const price=document.getElementById('price');const mode=${JSON.stringify(small)};const silent=['silent-stale','delayed-silent','same-silent'].includes(mode);if(!silent)price.setAttribute('aria-busy','true');if(button.dataset.skuCol==='5:21'&&['stale','silent-stale'].includes(mode))return;if(button.dataset.skuCol==='5:21'&&mode==='blank'){price.textContent='';price.removeAttribute('aria-busy');return;}setTimeout(()=>{price.textContent=button.dataset.skuCol==='5:21'&&mode!=='same-silent'?'$6.40':'$8.15';window.priceUpdates.push(button.dataset.skuCol);if(!silent)price.removeAttribute('aria-busy');},silent?400:260);};</script>
 </body></html>`);
 return page;
}
function csvRows(input){const s=input.toString('utf8').replace(/^\uFEFF/,'');const result=[];let row=[],cell='',quoted=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\r'&&s[i+1]==='\n'&&!quoted){row.push(cell);result.push(row);row=[];cell='';i++;}else cell+=c;}row.push(cell);result.push(row);return result;}
async function archiveRows(data){const result=await makeArchive(data,tmp,{get:async()=>{throw new Error('Unexpected image request');}});const bytes=await new Promise((resolve,reject)=>{yauzl.open(result.path,{lazyEntries:true},(error,zip)=>{if(error)return reject(error);zip.on('error',reject);zip.on('entry',entry=>{if(entry.fileName!=='product.csv'){zip.readEntry();return;}zip.openReadStream(entry,(error,stream)=>{if(error)return reject(error);const chunks=[];stream.on('data',c=>chunks.push(c));stream.on('error',reject);stream.on('end',()=>{zip.close();resolve(Buffer.concat(chunks));});});});zip.on('end',()=>reject(new Error('product.csv missing')));zip.readEntry();});});return csvRows(bytes);}
before(async()=>{tmp=await fs.mkdtemp(path.join(os.tmpdir(),'visible-price-tests-'));browser=await chromium.launch({headless:true,...(process.env.TEST_CHROMIUM?{executablePath:process.env.TEST_CHROMIUM}:existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});});
after(async()=>{await browser?.close();await fs.rm(tmp,{recursive:true,force:true});});
test('snapshot reads only the visible selected product price and explicit size state',async()=>{
 const page=await fixture();try{const state=await readPriceState(page);assert.equal(state.displayed,'$8.15');const size=state.groups.find(g=>g.name==='Size');assert(size);assert.equal(size.values.find(v=>v.name==='20*20cm').selected,true);assert.equal(size.values.find(v=>v.name==='15X15cm').selected,false);}finally{await page.close();}
});
test('each selectable size uses its current account-visible price instead of hidden SKU catalog amounts',async()=>{
 const page=await fixture();try{const data=product();const result=await captureVisiblePrices(page,data,queue,options);assert.equal(result,data);assert.equal(data.prices.mode,'visible-variation');assert.equal(data.variations.find(v=>v.attributes==='5:20').displayedPrice,'$8.15');assert.equal(data.variations.find(v=>v.attributes==='5:21').displayedPrice,'$6.40');const rows=await archiveRows(data);assert.deepEqual(rows[0],['Title','Description','Variation','Price']);assert.equal(rows.find(r=>r[2]==='Size: 20*20cm')[3],'$8.15');assert.equal(rows.find(r=>r[2]==='Size: 15X15cm')[3],'$6.40');assert(!rows.some(r=>/99\.00|88\.00|77\.00|40\.00|500\.00/.test(r[3])));}finally{await page.close();}
});
test('an unchanged previous price during a timed-out size switch is never assigned to the new size',async()=>{
 const page=await fixture({small:'stale'});try{const data=product();await captureVisiblePrices(page,data,queue,{...options,timeoutMs:450});assert.equal(data.variations.find(v=>v.attributes==='5:20').displayedPrice,'$8.15');assert.equal(data.variations.find(v=>v.attributes==='5:21').displayedPrice,null);assert(data.warnings.length);const rows=await archiveRows(data);assert.equal(rows.find(r=>r[2]==='Size: 15X15cm')[3],'');assert(!rows.some(r=>r[3].includes('88.00')));}finally{await page.close();}
});
test('a stale previous price without any loading indicator is not reused after selection changes',async()=>{
 const page=await fixture({small:'silent-stale'});try{const data=product();await captureVisiblePrices(page,data,queue,{...options,timeoutMs:600});assert.equal(data.variations.find(v=>v.attributes==='5:21').displayedPrice,null);assert(data.warnings.length);const rows=await archiveRows(data);assert.equal(rows.find(r=>r[2]==='Size: 15X15cm')[3],'');}finally{await page.close();}
});
test('a delayed current-price update without a loading indicator is awaited before assignment',async()=>{
 const page=await fixture({small:'delayed-silent'});try{const data=product();await captureVisiblePrices(page,data,queue,options);assert.equal(data.variations.find(v=>v.attributes==='5:21').displayedPrice,'$6.40');assert((await page.evaluate(()=>window.priceUpdates)).includes('5:21'));}finally{await page.close();}
});
test('equal variant prices require an observed price-panel rerender after the option switch',async()=>{
 const page=await fixture({small:'same-silent'});try{const data=product();await captureVisiblePrices(page,data,queue,options);assert.equal(data.variations.find(v=>v.attributes==='5:21').displayedPrice,'$8.15');assert((await page.evaluate(()=>window.priceUpdates)).includes('5:21'),'A stable old number alone is not confirmation of an equal price');}finally{await page.close();}
});
test('a selected size without a visible price stays blank in CSV',async()=>{
 const page=await fixture({small:'blank'});try{const data=product();await captureVisiblePrices(page,data,queue,{...options,timeoutMs:450});assert.equal(data.variations.find(v=>v.attributes==='5:21').displayedPrice,null);const rows=await archiveRows(data);assert.equal(rows.find(r=>r[2]==='Size: 15X15cm')[3],'');}finally{await page.close();}
});
test('an initially ambiguous display price is kept as an unassigned product row',async()=>{
 const page=await fixture({ambiguous:true});try{const data=product();await captureVisiblePrices(page,data,queue,options);assert.equal(data.prices.displayedUnassigned,true);const rows=await archiveRows(data);assert(rows.some(r=>r[2]===''&&r[3]==='$8.15'));assert.equal(rows.find(r=>r[2]==='Size: 15X15cm')[3],'$6.40');}finally{await page.close();}
});
test('one observed size group can be measured without structured SKU prices',async()=>{
 const page=await fixture();try{const data=product({variations:false});await captureVisiblePrices(page,data,queue,options);assert.equal(data.variations.length,2);const rows=await archiveRows(data);assert(rows.some(r=>r[2].includes('20*20cm')&&r[3]==='$8.15'));assert(rows.some(r=>r[2].includes('15X15cm')&&r[3]==='$6.40'));}finally{await page.close();}
});
test('multiple option groups without observed combinations never generate Cartesian SKU prices',async()=>{
 const page=await fixture({secondGroup:true});try{const data=product({variations:false});data.properties.push({id:'14',name:'Color',values:[{id:'1',name:'Red'},{id:'2',name:'Blue'}]});await captureVisiblePrices(page,data,queue,options);assert.equal(data.variations.length,0);const rows=await archiveRows(data);assert(rows.some(r=>r[2]===''&&r[3]==='$8.15'));for(const row of rows.slice(1)){if(row[2])assert.equal(row[3],'');assert(!(row[2].includes('Size:')&&row[2].includes('Color:')));}assert(data.warnings.length);}finally{await page.close();}
});
for(const [label,settleMs,delayMs,timeoutMs] of [['scaled',100,600,1200],['normal settling',1000,1600,2300]]) test(`a multi-group SKU switch never assigns an intermediate combination price (${label})`,async()=>{
 const page=await fixture();try{
  await page.setContent(`<!doctype html><html><body><h1>Dragonfly Embroidery Starter Kit</h1><div class="product-price"><span id="price" class="price-default--current">$8.15</span></div>
  <div class="sku-item--property" data-property-id="14"><div class="sku-item--title">Color:Red</div><div class="sku-item--skus"><button class="sku-item--text sku-item--selected" data-sku-col="14:1" aria-pressed="true" title="Red">Red</button><button class="sku-item--text" data-sku-col="14:2" aria-pressed="false" title="Blue">Blue</button></div></div>
  <div class="sku-item--property" data-property-id="5"><div class="sku-item--title">Size:20*20cm</div><div class="sku-item--skus"><button class="sku-item--text sku-item--selected" data-sku-col="5:20" aria-pressed="true" title="20*20cm">20*20cm</button><button class="sku-item--text" data-sku-col="5:21" aria-pressed="false" title="15X15cm">15X15cm</button></div></div>
  <script>window.clicks=[];window.priceEvents=[];for(const button of document.querySelectorAll('[data-sku-col]'))button.onclick=()=>{if(button.getAttribute('aria-pressed')==='true')return;window.clicks.push(button.dataset.skuCol);const group=button.closest('.sku-item--property');for(const sibling of group.querySelectorAll('[data-sku-col]')){sibling.setAttribute('aria-pressed','false');sibling.classList.remove('sku-item--selected');}button.setAttribute('aria-pressed','true');button.classList.add('sku-item--selected');group.querySelector('.sku-item--title').textContent=(group.dataset.propertyId==='14'?'Color:':'Size:')+button.title;const color=document.querySelector('[data-property-id="14"] [aria-pressed="true"]').title;const size=document.querySelector('[data-property-id="5"] [aria-pressed="true"]').title;const combination=color+'-'+size;const amount={'Red-20*20cm':'$8.15','Blue-20*20cm':'$7.00','Blue-15X15cm':'$6.40','Red-15X15cm':'$7.50'}[combination];setTimeout(()=>{document.getElementById('price').textContent=amount;window.priceEvents.push({combination,amount});},combination==='Blue-15X15cm'?${delayMs}:20);};</script></body></html>`);
  const data=product();data.properties.unshift({id:'14',name:'Color',values:[{id:'1',name:'Red'},{id:'2',name:'Blue'}]});data.variations=[{skuId:'red-large',attributes:'14:1;5:20',name:'Color: Red / Size: 20*20cm',price:{currency:'USD',value:'99.00'}},{skuId:'blue-small',attributes:'14:2;5:21',name:'Color: Blue / Size: 15X15cm',price:{currency:'USD',value:'88.00'}}];
  await captureVisiblePrices(page,data,queue,{settleMs,timeoutMs});const final=data.variations.find(v=>v.skuId==='blue-small');assert(final.displayedPrice===null||final.displayedPrice==='$6.40',`Intermediate Blue/Large price must never be assigned to Blue/Small: ${final.displayedPrice}`);const clicks=await page.evaluate(()=>window.clicks);assert(clicks.includes('14:2')&&clicks.includes('5:21'),'Both groups must be exercised');const rows=await archiveRows(data);assert(['','$6.40'].includes(rows.find(r=>r[2]==='Color: Blue / Size: 15X15cm')[3]));
 }finally{await page.close();}
});
test('duplicate hidden SKU records with identical visible options cannot both claim one display price',async()=>{
 const page=await fixture();try{const data=product();data.variations.push({skuId:'large-duplicate',attributes:'5:20',name:'Size: 20*20cm',price:{currency:'USD',value:'66.00'}});await captureVisiblePrices(page,data,queue,options);assert.equal(data.variations.find(v=>v.skuId==='large').displayedPrice,null);assert.equal(data.variations.find(v=>v.skuId==='large-duplicate').displayedPrice,null);assert.equal(data.prices.displayedUnassigned,true);const rows=await archiveRows(data);assert(rows.some(r=>r[2]===''&&r[3]==='$8.15'));assert(rows.filter(r=>r[2]==='Size: 20*20cm').every(r=>r[3]===''));assert.equal(rows.find(r=>r[2]==='Size: 15X15cm')[3],'$6.40');}finally{await page.close();}
});
test('visible-price mode never falls back to hidden catalog prices when all visible captures fail',async()=>{
 const data=product();data.prices={mode:'visible-variation',displayed:null,displayedUnassigned:false,sourceModule:{minActivityAmount:{currency:'USD',value:'77.00'}}};for(const variation of data.variations)variation.displayedPrice=null;const rows=await archiveRows(data);for(const row of rows.slice(1))assert.equal(row[3],'');
});
