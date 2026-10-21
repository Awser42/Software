const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {existsSync}=require('node:fs');
const yauzl=require('yauzl');
const {chromium}=require('playwright');
const {extractPage,parseDescription,captureOverview}=require('../src/extract');
const {convertToJpeg}=require('../src/jpeg');
const {makeArchive,productKey,normalizedUrl,csv}=require('../src/archive');
const {Queue}=require('../src/queue');
let browser,context,page,tmp,png,webp;
function zipContents(file){return new Promise((resolve,reject)=>{yauzl.open(file,{lazyEntries:true},(error,zip)=>{if(error)return reject(error);const entries={};zip.on('error',reject);zip.on('end',()=>resolve(entries));zip.on('entry',entry=>{if(entry.fileName.endsWith('/')){entries[entry.fileName]=Buffer.alloc(0);zip.readEntry();return;}zip.openReadStream(entry,(error,stream)=>{if(error)return reject(error);const chunks=[];stream.on('data',c=>chunks.push(c));stream.on('error',reject);stream.on('end',()=>{entries[entry.fileName]=Buffer.concat(chunks);zip.readEntry();});});});zip.readEntry();});});}
function parseCsv(bytes){const input=bytes.toString('utf8').replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\r'&&!quoted&&input[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++;}else cell+=c;}row.push(cell);rows.push(row);return rows;}
async function decode(bytes){return page.evaluate(async base64=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))]));const canvas=new OffscreenCanvas(bitmap.width,bitmap.height);const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);return {width:bitmap.width,height:bitmap.height,red:[...ctx.getImageData(2,2,1,1).data],transparent:[...ctx.getImageData(10,2,1,1).data]};},bytes.toString('base64'));}
const encode=(bytes,mime)=>convertToJpeg(page,bytes,mime);
const fixture={data:{titleModule:{subject:'Cotton Shirt / Summer'},imageModule:{imagePathList:['https://ae01.alicdn.com/kf/sample.jpg_640x640q90.jpg']},skuModule:{productSKUPropertyList:[{skuPropertyId:14,skuPropertyName:'Color',skuPropertyValues:[{propertyValueId:10,propertyValueDisplayName:'Blue',skuPropertyImagePath:'https://ae01.alicdn.com/kf/blue.png'}]},{skuPropertyId:5,skuPropertyName:'Size',skuPropertyValues:[{propertyValueId:20,propertyValueDisplayName:'Large'}]}],skuPriceList:[{skuId:'sku-1',skuAttr:'14:10;5:20',skuVal:{skuActivityAmount:{currency:'USD',value:'12.34'},skuAmount:{currency:'USD',value:'18.99'},availQuantity:8}}]},priceModule:{minActivityAmount:{currency:'USD',value:'12.34'}},specsModule:{props:[{attrName:'Material',attrValue:'Cotton'}]}}};
before(async()=>{
 tmp=await fs.mkdtemp(path.join(os.tmpdir(),'archiver-tests-'));
 browser=await chromium.launch({headless:true,...(process.env.TEST_CHROMIUM?{executablePath:process.env.TEST_CHROMIUM}:existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
 context=await browser.newContext();page=await context.newPage();
 await page.route('https://www.aliexpress.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><body><h1>Cotton Shirt / Summer</h1><div class="price--current">US $12.34</div><div id="product-description"><p>Real cotton description</p><img src="https://ae01.alicdn.com/kf/detail.png"><script>window.bad=1</script></div></body></html>'}));
 await page.goto('https://www.aliexpress.com/item/123456.html');await page.evaluate(data=>{window.runParams=data;},fixture);
 const images=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=16;canvas.height=8;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,8,8);return {png:canvas.toDataURL('image/png').split(',')[1],webp:canvas.toDataURL('image/webp',1).split(',')[1]};});png=Buffer.from(images.png,'base64');webp=Buffer.from(images.webp,'base64');assert.equal(webp.toString('ascii',0,4),'RIFF');
});
after(async()=>{await browser?.close();await fs.rm(tmp,{recursive:true,force:true});});
test('extracts observed prices, SKU names and original image URLs',async()=>{
 const p=await extractPage(page);assert.equal(p.title,'Cotton Shirt / Summer');assert.equal(p.images[0],'https://ae01.alicdn.com/kf/sample.jpg');assert.equal(p.descriptionUrl,null);
 assert.equal(p.properties[1].values[0].image,null);assert.equal(p.variations[0].name,'Color: Blue / Size: Large');assert.equal(p.variations[0].price.value,'12.34');assert.equal(p.prices.displayed,'US $12.34');assert.equal(p.sizes[0].name,'Size');assert.equal(p.colors[0].name,'Color');
});
test('extractor preserves an observed numeric zero SKU price',async()=>{
 const p=await context.newPage();await p.setContent('<h1>Observed zero-price product</h1>');await p.evaluate(()=>{window.runParams={skuModule:{skuPriceList:[{skuId:'zero-price',skuVal:{price:0}}]}};});const data=await extractPage(p);assert.equal(data.variations.length,1);assert.equal(data.variations[0].price,0);await p.close();
});
test('native AI overview is expanded and preferred over lower seller description',async()=>{
 const p=await context.newPage();await p.setContent('<h1>Dragonfly Embroidery Starter Kit</h1><div class="price-default--current">$8.15</div><div class="seo-sellpoints--wrap"><h3>AI overview of item</h3><p>Disclaimer: This content is generated by AI and does not represent the merchant\'s opinion.</p><ul><li>Perfect for beginners and hobbyists.</li><li>Available in two convenient sizes: 15X15cm or 20X20cm.</li></ul><button onclick="this.previousElementSibling.insertAdjacentHTML(\'beforeend\',\'<li>High-quality cotton material.</li>\');this.remove()">View more</button></div><div id="product-description"><p>Lower seller description should not replace the overview.</p></div>');
 const overview=await captureOverview(p);assert(overview);const data=await extractPage(p,[],overview);assert.equal(data.descriptionSource,'ai-overview');assert.match(data.descriptionText,/AI overview of item/);assert.match(data.descriptionText,/Disclaimer:/);assert.match(data.descriptionText,/15X15cm or 20X20cm/);assert.match(data.descriptionText,/High-quality cotton material/);assert(!data.descriptionText.includes('Lower seller'));assert.equal(data.prices.displayed,'$8.15');await p.close();
});
test('missing, empty and hidden AI overview fall back to observed seller text',async()=>{
 for(const heading of ['', '<section><h3>AI overview of item</h3><p>Disclaimer: This content is generated by AI.</p></section>', '<section hidden><h3>AI overview of item</h3><ul><li>Hidden content must never be exported.</li></ul></section>']){
  const p=await context.newPage();await p.setContent(`<h1>Product</h1>${heading}<div id="product-description"><p>Observed seller fallback.</p></div>`);const data=await extractPage(p);assert.equal(data.descriptionText.trim(),'Observed seller fallback.');assert.notEqual(data.descriptionSource,'ai-overview');await p.close();
 }
});
test('an unrelated overview heading cannot capture the entire product page',async()=>{
 const p=await context.newPage();await p.setContent('<h1>Product</h1><h3>AI overview of item</h3><div>Unrelated heading without actual overview content</div><div id="product-description"><p>Seller details only.</p></div><aside><ul><li>Recommended unrelated product</li></ul></aside>');assert.equal(await captureOverview(p),null);const data=await extractPage(p);assert.equal(data.descriptionText,'Seller details only.');await p.close();
});
test('missing data remains empty, without fictional price or SKU',async()=>{
 const blank=await context.newPage();await blank.setContent('<h1>Observed name</h1>');const p=await extractPage(blank);assert.equal(p.title,'Observed name');assert.equal(p.prices.displayed,null);assert.equal(p.prices.structuredOffers,null);assert.deepEqual(p.variations,[]);assert.deepEqual(p.images,[]);assert.equal(p.descriptionUrl,null);await blank.close();
});
test('description sanitizer removes executable and non-description text',async()=>{
 const p=await parseDescription(page,'<p onclick="alert(1)">Description</p><script>bad()</script><style>.noise{color:red}</style><noscript>tracking fallback</noscript><template>hidden template</template><iframe src="https://evil.test"></iframe><img src="https://ae01.alicdn.com/kf/detail.png">');
 assert(!/onclick|<script|<iframe|<style|<noscript|<template/i.test(p.html));assert.deepEqual(p.images,['https://ae01.alicdn.com/kf/detail.png']);assert.equal(p.text,'Description');
});
test('Chromium converts actual PNG and WebP bytes to full-size JPEG with white transparency',async()=>{
 for(const [bytes,mime] of [[png,'image/png'],[webp,'image/webp'],[webp,'image/jpeg']]){
  const jpeg=await encode(bytes,mime);assert.equal(jpeg.readUInt16BE(0),0xffd8);const decoded=await decode(jpeg);assert.equal(decoded.width,16);assert.equal(decoded.height,8);assert(decoded.red[0]>220&&decoded.red[1]<35&&decoded.red[2]<35);assert(decoded.transparent.slice(0,3).every(c=>c>230));assert.equal(decoded.transparent[3],255);
 }
 await assert.rejects(()=>encode(Buffer.from('not an image'),'image/webp'));
});
test('archive contains only four-column product.csv and actual JPEG Images; never overwrites',async()=>{
 const p=await extractPage(page);p.productId='123456';const clean=await parseDescription(page,p.descriptionHtml);p.descriptionHtml=clean.html;p.descriptionText=clean.text;
 const request={get:async url=>({ok:()=>true,headers:()=>({'content-type':url.endsWith('.jpg')?'image/jpeg':'image/png'}),body:async()=>url.endsWith('.jpg')?webp:png})};
 const result=await makeArchive(p,tmp,request,async()=>{},encode);assert.equal(result.images,3);assert.equal(result.exportFormat,'csv-jpeg-v1');assert(result.preview.startsWith('data:image/jpeg;'));const contents=await zipContents(result.path);const files=Object.keys(contents).filter(n=>!n.endsWith('/'));
 assert.equal(files.length,4);assert(files.includes('product.csv'));assert(files.filter(n=>n!=='product.csv').every(n=>/^Images\/.+\.jpg$/.test(n)));assert(files.some(n=>/Blue/i.test(n)),'Variation image filename must identify the observed variation');
 for(const file of files.filter(n=>n!=='product.csv')){assert.equal(contents[file].readUInt16BE(0),0xffd8);const decoded=await decode(contents[file]);assert.equal(decoded.width,16);assert.equal(decoded.height,8);}
 const rows=parseCsv(contents['product.csv']);assert.deepEqual(rows[0],['Title','Description','Variation','Price']);assert.equal(rows.length,2);assert.deepEqual(rows[1].slice(0,3),['Cotton Shirt / Summer','Real cotton description','Color: Blue / Size: Large']);assert.match(rows[1][3],/USD/);assert.match(rows[1][3],/12\.34/);
 const result2=await makeArchive(p,tmp,request,async()=>{},encode);assert.notEqual(result.path,result2.path);assert(result2.path.endsWith('-2.zip'));
});
test('CSV leaves a missing SKU price blank rather than copying the displayed product price',async()=>{
 const p=await extractPage(page);p.images=[];p.descriptionImages=[];p.properties=[];p.variations.push({skuId:'sku-missing',name:'Color: Red / Size: Small',price:null});
 const result=await makeArchive(p,tmp,{get:async()=>{throw new Error('Unexpected image request');}},async()=>{},encode);const contents=await zipContents(result.path);const rows=parseCsv(contents['product.csv']);assert.equal(rows.length,3);assert.equal(rows.find(r=>r[2]==='Color: Red / Size: Small')[3],'');assert.match(rows.find(r=>r[2]==='Color: Blue / Size: Large')[3],/12\.34/);
});
test('observed zero price is retained and a shared variation image downloads only once',async()=>{
 const p=await extractPage(page);p.images=['https://ae01.alicdn.com/kf/blue.png'];p.descriptionImages=['https://ae01.alicdn.com/kf/blue.png'];p.properties=[{name:'Color',values:[{name:'Blue',image:'https://ae01.alicdn.com/kf/blue.png'}]}];p.variations=[{skuId:'zero',name:'Color: Blue',price:{currency:'USD',value:0}}];
 let requested=0;const result=await makeArchive(p,tmp,{get:async()=>{requested++;return {ok:()=>true,headers:()=>({'content-type':'image/png'}),body:async()=>png};}},async()=>{},encode);assert.equal(requested,1);assert.equal(result.images,1);const contents=await zipContents(result.path);const names=Object.keys(contents).filter(n=>!n.endsWith('/'));assert(names.some(n=>/^Images\/.*Blue.*\.jpg$/i.test(n)));const rows=parseCsv(contents['product.csv']);assert.equal(rows.length,2);assert.match(rows[1][3],/USD/);assert.match(rows[1][3],/0/);
});
test('option lists without observed SKU combinations do not invent combinations or prices',async()=>{
 const p=await extractPage(page);p.images=[];p.descriptionImages=[];p.variations=[];p.properties=[{name:'Color',values:[{name:'Red'},{name:'Blue'}]},{name:'Size',values:[{name:'S'},{name:'M'}]}];
 const result=await makeArchive(p,tmp,{get:async()=>{throw new Error('Unexpected image request');}},async()=>{},encode);const rows=parseCsv((await zipContents(result.path))['product.csv']).slice(1);assert(rows.length);for(const row of rows){assert(!(row[2].includes('Color:')&&row[2].includes('Size:')),'No unobserved Cartesian combination');if(row[2])assert.equal(row[3],'');}assert(rows.some(r=>r[3].includes('12.34')),'Observed product-level display price should be retained');
});
test('download failures remain visible in app metadata while CSV still exports',async()=>{
 const p=await extractPage(page);const r=await makeArchive(p,tmp,{get:async()=>{throw new Error('HTTP 403');}},async()=>{},encode);assert.equal(r.images,0);assert.equal(r.warnings.length,3);const contents=await zipContents(r.path);assert(contents['product.csv']);assert(!contents['product.json']);
});
test('accepts current AliExpress media CDN and blocks unrelated image hosts',async()=>{
 const p=await extractPage(page);p.images=['https://ae-pic-a1.aliexpress-media.com/kf/test.png','https://unrelated.test/test.png'];p.descriptionImages=[];p.properties=[];
 let requested=0;const result=await makeArchive(p,tmp,{get:async()=>{requested++;return {ok:()=>true,headers:()=>({'content-type':'image/png'}),body:async()=>png};}},async()=>{},encode);
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
   if(item.productId==='1')await q.manual('Login in Chromium');return {productId:item.productId,title:'Observed',path:path.join(tmp,'existing.zip'),warnings:[],exportFormat:'csv-jpeg-v1'};
 }});
 await fs.writeFile(path.join(tmp,'existing.zip'),'zip');
 const added=await q.add(['https://www.aliexpress.com/item/1.html','https://www.aliexpress.us/item/1.html','https://www.aliexpress.com/item/2.html']);assert.equal(added[1].status,'duplicate');
 await q.pause();const run=q.run({});await new Promise(r=>setTimeout(r,150));assert.equal(q.items[0].status,'pending');await q.resume();
 while(!q.waiting)await new Promise(r=>setTimeout(r,10));q.continue();await run;assert.equal(q.items[0].status,'done');assert.equal(q.items[1].status,'failed');
 await q.retry();await q.run({});assert.equal(q.items[1].status,'done');assert.equal(q.items[1].attempts,2);assert.equal(saved.downloads.length,2);
 const duplicates=await q.add(['https://www.aliexpress.com/item/1.html']);assert.equal(duplicates[0].status,'duplicate');
 const restored=new Queue({extract:async()=>{},initial:{items:[{status:'running'}]}});assert.equal(restored.items[0].status,'pending');
});
test('legacy exports never prevent re-export to the requested CSV and JPEG format',async()=>{
 const oldFile=path.join(tmp,'legacy.zip');await fs.writeFile(oldFile,'legacy');const q=new Queue({extract:async()=>{},initial:{downloads:[{productId:'55',path:oldFile,title:'Earlier archive'}]}});const added=await q.add(['https://www.aliexpress.com/item/55.html']);assert.equal(added[0].status,'pending');
});
