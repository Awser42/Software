const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {existsSync}=require('node:fs');
const yauzl=require('yauzl');
const {chromium}=require('playwright');
const {extractPage,parseDescription}=require('../src/extract');
const {makeArchive,productKey,normalizedUrl,csv}=require('../src/archive');
const {Queue}=require('../src/queue');
let browser,context,page,tmp;
function zipContents(file){return new Promise((resolve,reject)=>{yauzl.open(file,{lazyEntries:true},(error,zip)=>{if(error)return reject(error);const entries={};zip.on('error',reject);zip.on('end',()=>resolve(entries));zip.on('entry',entry=>{if(entry.fileName.endsWith('/')){entries[entry.fileName]=Buffer.alloc(0);zip.readEntry();return;}zip.openReadStream(entry,(error,stream)=>{if(error)return reject(error);const chunks=[];stream.on('data',c=>chunks.push(c));stream.on('error',reject);stream.on('end',()=>{entries[entry.fileName]=Buffer.concat(chunks);zip.readEntry();});});});zip.readEntry();});});}
const fixture={data:{titleModule:{subject:'Cotton Shirt / Summer'},imageModule:{imagePathList:['https://ae01.alicdn.com/kf/sample.jpg_640x640q90.jpg']},skuModule:{productSKUPropertyList:[{skuPropertyId:14,skuPropertyName:'Color',skuPropertyValues:[{propertyValueId:10,propertyValueDisplayName:'Blue',skuPropertyImagePath:'https://ae01.alicdn.com/kf/blue.png'}]},{skuPropertyId:5,skuPropertyName:'Size',skuPropertyValues:[{propertyValueId:20,propertyValueDisplayName:'Large'}]}],skuPriceList:[{skuId:'sku-1',skuAttr:'14:10;5:20',skuVal:{skuActivityAmount:{currency:'USD',value:'12.34'},skuAmount:{currency:'USD',value:'18.99'},availQuantity:8}}]},priceModule:{minActivityAmount:{currency:'USD',value:'12.34'}},specsModule:{props:[{attrName:'Material',attrValue:'Cotton'}]}}};
before(async()=>{
 tmp=await fs.mkdtemp(path.join(os.tmpdir(),'archiver-tests-'));
 browser=await chromium.launch({headless:true,...(process.env.TEST_CHROMIUM?{executablePath:process.env.TEST_CHROMIUM}:existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
 context=await browser.newContext();page=await context.newPage();
 await page.route('https://www.aliexpress.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><body><h1>Cotton Shirt / Summer</h1><div class="price--current">US $12.34</div><div id="product-description"><p>Real cotton description</p><img src="https://ae01.alicdn.com/kf/detail.png"><script>window.bad=1</script></div></body></html>'}));
 await page.goto('https://www.aliexpress.com/item/123456.html');await page.evaluate(data=>{window.runParams=data;},fixture);
});
after(async()=>{await browser?.close();await fs.rm(tmp,{recursive:true,force:true});});
test('extracts observed prices, SKU names, original image URLs and specifications',async()=>{
 const p=await extractPage(page);assert.equal(p.title,'Cotton Shirt / Summer');assert.equal(p.images[0],'https://ae01.alicdn.com/kf/sample.jpg');assert.equal(p.descriptionUrl,null);
 assert.equal(p.properties[1].values[0].image,null);assert.equal(p.variations[0].name,'Color: Blue / Size: Large');assert.equal(p.variations[0].price.value,'12.34');assert.equal(p.prices.displayed,'US $12.34');assert.equal(p.sizes[0].name,'Size');assert.equal(p.colors[0].name,'Color');assert.equal(p.specifications[0].value,'Cotton');
});
test('missing data remains empty, without fictional price or SKU',async()=>{
 const blank=await context.newPage();await blank.setContent('<h1>Observed name</h1>');const p=await extractPage(blank);assert.equal(p.title,'Observed name');assert.equal(p.prices.displayed,null);assert.equal(p.prices.structuredOffers,null);assert.deepEqual(p.variations,[]);assert.deepEqual(p.images,[]);assert.equal(p.descriptionUrl,null);await blank.close();
});
test('description sanitizer removes executable content',async()=>{
 const p=await parseDescription(page,'<p onclick="alert(1)">Description</p><script>bad()</script><iframe src="https://evil.test"></iframe><img src="https://ae01.alicdn.com/kf/detail.png">');
 assert(!/onclick|<script|<iframe/i.test(p.html));assert.deepEqual(p.images,['https://ae01.alicdn.com/kf/detail.png']);assert.equal(p.text,'Description');
});
test('complete archive contains images, readable details, HTML, CSV and full JSON; never overwrites',async()=>{
 const p=await extractPage(page);p.productId='123456';const clean=await parseDescription(page,p.descriptionHtml);p.descriptionHtml=clean.html;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=','base64');
 const request={get:async url=>({ok:()=>true,headers:()=>({'content-type':url.endsWith('.jpg')?'image/jpeg':'image/png'}),body:async()=>png})};
 const result=await makeArchive(p,tmp,request);assert.equal(result.images,3);assert(result.preview.startsWith('data:image/'));const contents=await zipContents(result.path);
 for(const file of ['product.json','description.html','product-details.txt','variations.csv','specifications.csv','options.csv','images/001.jpg','description-images/001.png','variation-images/001.png'])assert(contents[file],file);
 const json=JSON.parse(contents['product.json'].toString());assert.equal(json.assets.length,3);assert.equal(json.variations[0].price.value,'12.34');
 const html=contents['description.html'].toString();assert(html.includes('description-images/001.png'));assert(!html.includes('<script>'));
 const result2=await makeArchive(p,tmp,request);assert.notEqual(result.path,result2.path);assert(result2.path.endsWith('-2.zip'));
});
test('download failures are recorded rather than hidden',async()=>{
 const p=await extractPage(page);const r=await makeArchive(p,tmp,{get:async()=>{throw new Error('HTTP 403');}});assert.equal(r.images,0);assert.equal(r.warnings.length,3);
});
test('accepts current AliExpress media CDN and blocks unrelated image hosts',async()=>{
 const p=await extractPage(page);p.images=['https://ae-pic-a1.aliexpress-media.com/kf/test.png','https://unrelated.test/test.png'];p.descriptionImages=[];p.properties=[];
 let requested=0;const result=await makeArchive(p,tmp,{get:async()=>{requested++;return {ok:()=>true,headers:()=>({'content-type':'image/png'}),body:async()=>Buffer.from('fixture')};}});
 assert.equal(requested,1);assert.equal(result.images,1);assert.equal(result.warnings.length,1);assert.equal(p.assets[1].status,'failed');
});
test('URL validation, tracking removal and spreadsheet formula escaping',()=>{
 assert.equal(productKey('https://www.aliexpress.us/item/3256810248416998.html?tracking=x'),'3256810248416998');assert.equal(normalizedUrl('https://www.aliexpress.us/item/123.html?aff=x#details'),'https://www.aliexpress.us/item/123.html');
 for(const url of ['https://evil.test/item/123.html','https://aliexpress.com.evil.test/item/123.html','file:///item/123.html','https://www.aliexpress.com/']) assert.throws(()=>productKey(url));
 assert(csv([{name:'=SUM(1,2)'}],['name']).includes("'=SUM"));
});
test('queue handles pause/resume, manual verification, retry, duplicates, and persistence',async()=>{
 let attempts=0,saved;const q=new Queue({save:async s=>{saved=JSON.parse(JSON.stringify(s));},extract:async(item,settings,q)=>{
   await q.checkpoint();if(item.productId==='2'&&attempts++===0)throw new Error('Temporary failure');
   if(item.productId==='1')await q.manual('Login in Chromium');return {productId:item.productId,title:'Observed',path:path.join(tmp,'existing.zip'),warnings:[]};
 }});
 await fs.writeFile(path.join(tmp,'existing.zip'),'zip');
 const added=await q.add(['https://www.aliexpress.com/item/1.html','https://www.aliexpress.us/item/1.html','https://www.aliexpress.com/item/2.html']);assert.equal(added[1].status,'duplicate');
 await q.pause();const run=q.run({});await new Promise(r=>setTimeout(r,150));assert.equal(q.items[0].status,'pending');await q.resume();
 while(!q.waiting)await new Promise(r=>setTimeout(r,10));q.continue();await run;assert.equal(q.items[0].status,'done');assert.equal(q.items[1].status,'failed');
 await q.retry();await q.run({});assert.equal(q.items[1].status,'done');assert.equal(q.items[1].attempts,2);assert.equal(saved.downloads.length,2);
 const duplicates=await q.add(['https://www.aliexpress.com/item/1.html']);assert.equal(duplicates[0].status,'duplicate');
 const restored=new Queue({extract:async()=>{},initial:{items:[{status:'running'}]}});assert.equal(restored.items[0].status,'pending');
});
