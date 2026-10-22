const {workbookTable,archiveTable}=require('./workbook');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {existsSync}=require('node:fs');
const yauzl=require('yauzl');
const {chromium}=require('playwright');
const {extractPage,parseDescription,captureOverview,captureProductDetails}=require('../src/extract');
const {convertToJpeg}=require('../src/jpeg');
const {makeArchive,productKey,normalizedUrl,EXPORT_FORMAT}=require('../src/archive');
const {columns,points,disclaimer,productTitle,productHtml,frameHtml,imageUrls,sellerDom}=require('./fixtures');
const {Queue}=require('../src/queue');
let browser,context,page,tmp,png,webp;
const imageCache=new Map();
async function productImage(url,mime='image/png'){const key=url+mime;if(!imageCache.has(key)){const data=await page.evaluate(({url,mime})=>{let hash=2166136261;for(const character of url)hash=Math.imul(hash^character.charCodeAt(0),16777619)>>>0;const canvas=new OffscreenCanvas(320,192);const context=canvas.getContext('2d');context.fillStyle='#'+(hash&0xffffff).toString(16).padStart(6,'0');context.fillRect(0,0,320,192);context.fillStyle='#fff';context.fillRect(10+(hash%50),20,32,64);return canvas.convertToBlob({type:mime,quality:1}).then(blob=>new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);}));},{url,mime});imageCache.set(key,Buffer.from(data,'base64'));}return imageCache.get(key);}
const rowObjects=rows=>rows.slice(1).map(row=>Object.fromEntries(rows[0].map((name,index)=>[name,row[index]])));
function zipContents(file){return new Promise((resolve,reject)=>{yauzl.open(file,{lazyEntries:true},(error,zip)=>{if(error)return reject(error);const entries={};zip.on('error',reject);zip.on('end',()=>resolve(entries));zip.on('entry',entry=>{if(entry.fileName.endsWith('/')){entries[entry.fileName]=Buffer.alloc(0);zip.readEntry();return;}zip.openReadStream(entry,(error,stream)=>{if(error)return reject(error);const chunks=[];stream.on('data',c=>chunks.push(c));stream.on('error',reject);stream.on('end',()=>{entries[entry.fileName]=Buffer.concat(chunks);zip.readEntry();});});});zip.readEntry();});});}
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
test('modern AliExpress h1 wins over stale recommendations and the complete seven-point div overview is retained',async()=>{
 const p=await context.newPage();const id='777';await p.route('https://www.aliexpress.com/**',route=>{const frame=route.request().url().match(/frame-(\d+)\.html/);return route.fulfill({contentType:'text/html',body:frame?frameHtml(frame[1]):productHtml(id)});});await p.route('https://ae01.alicdn.com/**',route=>route.fulfill({contentType:'image/png',body:png}));await p.goto(`https://www.aliexpress.com/item/${id}.html`);
 const overview=await captureOverview(p);assert(overview);const data=await extractPage(p,[],overview);assert.equal(data.title,productTitle(id));assert.equal(data.titleSource,'dom');assert.equal(data.descriptionSource,'ai-overview');assert(data.descriptionText.includes(disclaimer));for(const [heading,text] of points){assert(data.descriptionText.includes(heading),heading);assert(data.descriptionText.includes(text),heading);assert(data.features.some(feature=>feature.includes(heading)),heading);}assert(data.sellerDescriptionText.includes(sellerDom(id)));assert(data.descriptionImages.includes(imageUrls(id).dom));assert(data.specifications.some(spec=>spec.name==='Material'&&spec.value==='Cotton'));assert.equal(data.properties.find(prop=>prop.name==='Size').values.length,2);assert(!data.title.includes('STALE'));await p.close();
});
test('missing, empty and hidden AI overview fall back to observed seller text',async()=>{
 for(const heading of ['', '<section><h3>AI overview of item</h3><p>Disclaimer: This content is generated by AI.</p></section>', '<section hidden><h3>AI overview of item</h3><ul><li>Hidden content must never be exported.</li></ul></section>']){
  const p=await context.newPage();await p.setContent(`<h1>Product</h1>${heading}<div id="product-description"><p>Observed seller fallback.</p></div>`);const data=await extractPage(p);assert.equal(data.descriptionText.trim(),'Observed seller fallback.');assert.notEqual(data.descriptionSource,'ai-overview');await p.close();
 }
});
test('an unrelated overview heading cannot capture the entire product page',async()=>{
 const p=await context.newPage();await p.setContent('<h1>Product</h1><h3>AI overview of item</h3><div>Unrelated heading without actual overview content</div><div id="product-description"><p>Seller details only.</p></div><aside><ul><li>Recommended unrelated product</li></ul></aside>');assert.equal(await captureOverview(p),null);const data=await extractPage(p);assert.equal(data.descriptionText,'Seller details only.');await p.close();
});
test('product-preview title and image-view--preview gallery remain valid while product reviews are excluded',async()=>{
 const p=await context.newPage();await p.route('https://ae01.alicdn.com/**',route=>route.fulfill({contentType:'image/png',body:png}));await p.setContent('<section class="product-preview"><h1>Actual preview product title</h1><div class="image-view--preview"><img src="https://ae01.alicdn.com/kf/actual-preview.jpg"></div></section><section class="product-reviews"><h1>Review title is not the product title</h1><div class="image-view--preview"><img src="https://ae01.alicdn.com/kf/review-image.jpg"></div></section>');const data=await extractPage(p);assert.equal(data.title,'Actual preview product title');assert(data.images.includes('https://ae01.alicdn.com/kf/actual-preview.jpg'));assert(!data.images.includes('https://ae01.alicdn.com/kf/review-image.jpg'));await p.close();
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
test('archive contains styled Excel only and original-size JPEG Images; never overwrites',async()=>{
 const p=await extractPage(page);p.productId='123456';const clean=await parseDescription(page,p.descriptionHtml);p.descriptionHtml=clean.html;p.descriptionText=clean.text;
 const request={get:async url=>({ok:()=>true,headers:()=>({'content-type':url.endsWith('.jpg')?'image/jpeg':'image/png'}),body:async()=>productImage(url,url.endsWith('.jpg')?'image/webp':'image/png')})};
 const result=await makeArchive(p,tmp,request,async()=>{},encode);assert.equal(result.images,3);assert.equal(result.exportFormat,EXPORT_FORMAT);assert(result.preview.startsWith('data:image/jpeg;'));const contents=await zipContents(result.path);const files=Object.keys(contents).filter(n=>!n.endsWith('/'));
 assert.equal(files.length,4);assert(!files.includes('product.csv')); assert(files.includes('product.xlsx'));assert(files.filter(n=>!['product.csv','product.xlsx'].includes(n)).every(n=>/^Images\/.+\.jpg$/.test(n)));assert(files.some(n=>/Blue/i.test(n)),'Variation image filename must identify the observed variation');
 for(const file of files.filter(n=>n.startsWith('Images/'))){assert.equal(contents[file].readUInt16BE(0),0xffd8);const decoded=await decode(contents[file]);assert.equal(decoded.width,320);assert.equal(decoded.height,192);}
 const rows=await workbookTable(contents['product.xlsx']);assert.deepEqual(rows[0],columns);assert.equal(rows.length,2);const [row]=rowObjects(rows);assert.equal(row.Title,'Cotton Shirt / Summer');assert.equal(row.Description,'Real cotton description');assert.equal(row['Seller Description'],'Real cotton description');assert.equal(row.Variation,'Color: Blue / Size: Large');assert.equal(row.Size,'Large');assert.equal(row.Color,'Blue');assert(row.Specifications.includes('Material: Cotton'));assert.equal(row.Images.split('\n').length,3);for(const file of row.Images.split('\n'))assert(contents[file]);assert.match(row.Price,/USD/);assert.match(row.Price,/12\.34/);
 const result2=await makeArchive(p,tmp,request,async()=>{},encode);assert.notEqual(result.path,result2.path);assert(result2.path.endsWith('-2.zip'));
});
test('each Excel variation links its own image before common gallery and description images',async()=>{
 const p=await extractPage(page);p.images=['https://ae01.alicdn.com/kf/common.jpg'];p.descriptionImages=['https://ae01.alicdn.com/kf/common-description.png'];p.properties=[{id:'14',name:'Color',values:[{id:'1',name:'Red',image:'https://ae01.alicdn.com/kf/red.png'},{id:'2',name:'Blue',image:'https://ae01.alicdn.com/kf/blue.png'}]},{id:'5',name:'Size',values:[{id:'20',name:'20*20cm'},{id:'21',name:'15X15cm'}]}];p.variations=[{attributes:'14:1;5:20',name:'Color: Red / Size: 20*20cm',displayedPrice:'$8.15'},{attributes:'14:2;5:21',name:'Color: Blue / Size: 15X15cm',displayedPrice:'$6.40'}];p.prices={mode:'visible-variation',displayed:'$8.15',displayedUnassigned:false};p.features=['Observed cotton feature'];p.sellerDescriptionText='Independent seller text.';
 const result=await makeArchive(p,tmp,{get:async url=>({ok:()=>true,headers:()=>({'content-type':'image/png'}),body:async()=>productImage(url)})},async()=>{},encode);assert.equal(result.images,6);const contents=await zipContents(result.path);const table=await workbookTable(contents['product.xlsx']);assert.deepEqual(table[0],columns);for(const row of rowObjects(table)){const images=row.Images.split('\n');assert.equal(images.length,3);assert(images[0].includes('variation-Color-'+row.Color));assert(!images.some(file=>file.includes(row.Color==='Red'?'variation-Color-Blue':'variation-Color-Red')));for(const file of images){assert(file.includes(`-cost-${row.Price}-`));assert(contents[file]);}assert.equal(row['Seller Description'],'Independent seller text.');assert.equal(row.Features,'Observed cotton feature');}assert.equal(rowObjects(table)[0].Size,'20*20cm');assert.equal(rowObjects(table)[1].Size,'15X15cm');
});
test('Excel leaves a missing SKU price blank rather than copying the displayed product price',async()=>{
 const p=await extractPage(page);p.images=[];p.descriptionImages=[];p.properties=[];p.variations.push({skuId:'sku-missing',name:'Color: Red / Size: Small',price:null});
 const result=await makeArchive(p,tmp,{get:async()=>{throw new Error('Unexpected image request');}},async()=>{},encode);const contents=await zipContents(result.path);const rows=await workbookTable(contents['product.xlsx']);assert.equal(rows.length,3);assert.equal(rowObjects(rows).find(r=>r.Variation==='Color: Red / Size: Small').Price,'');assert.match(rowObjects(rows).find(r=>r.Variation==='Color: Blue / Size: Large').Price,/12\.34/);
});
test('observed zero price is retained and a shared variation image downloads only once',async()=>{
 const p=await extractPage(page);p.images=['https://ae01.alicdn.com/kf/blue.png'];p.descriptionImages=['https://ae01.alicdn.com/kf/blue.png'];p.properties=[{name:'Color',values:[{name:'Blue',image:'https://ae01.alicdn.com/kf/blue.png'}]}];p.variations=[{skuId:'zero',name:'Color: Blue',price:{currency:'USD',value:0}}];
 let requested=0;const result=await makeArchive(p,tmp,{get:async()=>{requested++;return {ok:()=>true,headers:()=>({'content-type':'image/png'}),body:async()=>productImage('https://ae01.alicdn.com/kf/shared.png')};}},async()=>{},encode);assert.equal(requested,1);assert.equal(result.images,1);const contents=await zipContents(result.path);const names=Object.keys(contents).filter(n=>!n.endsWith('/'));assert(names.some(n=>/^Images\/.*Blue.*\.jpg$/i.test(n)));const rows=await workbookTable(contents['product.xlsx']);assert.equal(rows.length,2);assert.match(rowObjects(rows)[0].Price,/USD/);assert.match(rowObjects(rows)[0].Price,/0/);
});
test('shared variation photos get separate size and confirmed-price filenames without downloading again',async()=>{
 const url='https://ae01.alicdn.com/kf/shared-size.png';
 const p=await extractPage(page);p.images=[url];p.descriptionImages=[url];p.properties=[{id:'14',name:'Color',values:[{id:'1',name:'Blue',image:url}]}];
 p.variations=[['20*20cm','$8.15'],['15X15cm','$6.40'],['Small',null],['Free','$0.00']].map(([size,displayedPrice])=>({name:`Color: Blue / Size: ${size}`,observedOptions:[{name:'Color',value:size==='Small'?'Blue '.repeat(40):'Blue',propertyId:'14',id:'1'},{name:'Size',value:size}],observedImageUrls:[url],displayedPrice,price:{currency:'USD',value:'999.99'}}));
 p.prices={mode:'visible-variation',displayed:'$8.15',displayedUnassigned:false};
 let requests=0;const result=await makeArchive(p,tmp,{get:async()=>{requests++;return {ok:()=>true,headers:()=>({'content-type':'image/png'}),body:async()=>productImage(url)};}},async()=>{},encode);
 assert.equal(requests,1);assert.equal(result.images,4);
 const contents=await zipContents(result.path),rows=rowObjects(await workbookTable(contents['product.xlsx']));
 assert.equal(rows.length,4);const names=[];
 for(const row of rows){const files=row.Images.split('\n');assert.equal(files.length,1);const file=files[0];names.push(file);assert(contents[file]);assert(file.includes(`Size-${row.Size.replace('*','_')}`));assert(!file.includes('999.99'));if(row.Price)assert(file.includes(`-cost-${row.Price}-`));else assert(!file.includes('-cost-'));}
 assert.equal(new Set(names).size,4);assert.equal(Object.keys(contents).filter(name=>name.endsWith('.jpg')).length,4);
 for(const name of names)assert.deepEqual(contents[name],contents[names[0]]);
});
test('size-only variations use the shared main photo with each size price and safe filenames',async()=>{
 const url='https://ae01.alicdn.com/kf/size-only.png',p=await extractPage(page);p.images=[url];p.descriptionImages=[];p.properties=[];
 p.variations=[{name:'Size: S',observedOptions:[{name:'Size',value:'S / small'}],displayedPrice:'US $2.50'},{name:'Size: L',observedOptions:[{name:'Size',value:'L:large'}],displayedPrice:'US $4.75'}];p.prices={mode:'visible-variation',displayedUnassigned:false};
 const result=await makeArchive(p,tmp,{get:async()=>({ok:()=>true,headers:()=>({'content-type':'image/png'}),body:async()=>productImage(url)})},async()=>{},encode);
 const contents=await zipContents(result.path),rows=rowObjects(await workbookTable(contents['product.xlsx']));assert.equal(result.images,2);
 for(const row of rows){assert(row.Images.includes(`-cost-${row.Price.replace('US ','')}-`));assert(/^Images\/[^<>:"/\\|?*\x00-\x1f]+\.jpg$/.test(row.Images));assert(contents[row.Images]);}
});
test('option lists without observed SKU combinations do not invent combinations or prices',async()=>{
 const p=await extractPage(page);p.images=[];p.descriptionImages=[];p.variations=[];p.properties=[{name:'Color',values:[{name:'Red'},{name:'Blue'}]},{name:'Size',values:[{name:'S'},{name:'M'}]}];
 const result=await makeArchive(p,tmp,{get:async()=>{throw new Error('Unexpected image request');}},async()=>{},encode);const rows=rowObjects(await archiveTable(result.path));assert(rows.length);for(const row of rows){assert(!(row.Variation.includes('Color:')&&row.Variation.includes('Size:')),'No unobserved Cartesian combination');if(row.Variation)assert.equal(row.Price,'');}assert(rows.some(r=>r.Price.includes('12.34')),'Observed product-level display price should be retained');
});
test('download failures remain visible in app metadata while Excel still exports',async()=>{
 const p=await extractPage(page);const r=await makeArchive(p,tmp,{get:async()=>{throw new Error('HTTP 403');}},async()=>{},encode);assert.equal(r.images,0);assert.equal(r.warnings.length,3);const contents=await zipContents(r.path);assert(!contents['product.csv']);assert(contents['product.xlsx']);assert(!contents['product.json']);
});
test('accepts current AliExpress media CDN and blocks unrelated image hosts',async()=>{
 const p=await extractPage(page);p.images=['https://ae-pic-a1.aliexpress-media.com/kf/test.png','https://unrelated.test/test.png'];p.descriptionImages=[];p.properties=[];
 let requested=0;const result=await makeArchive(p,tmp,{get:async()=>{requested++;return {ok:()=>true,headers:()=>({'content-type':'image/png'}),body:async()=>productImage('https://ae01.alicdn.com/kf/shared.png')};}},async()=>{},encode);
 assert.equal(requested,1);assert.equal(result.images,1);assert.equal(result.warnings.length,1);assert.equal(p.assets[1].status,'failed');
});
test('URL validation, tracking removal and strict host checks',()=>{
 assert.equal(productKey('https://www.aliexpress.us/item/3256810248416998.html?tracking=x'),'3256810248416998');assert.equal(normalizedUrl('https://www.aliexpress.us/item/123.html?aff=x#details'),'https://www.aliexpress.us/item/123.html');
 for(const url of ['https://evil.test/item/123.html','https://aliexpress.com.evil.test/item/123.html','file:///item/123.html','https://www.aliexpress.com/']) assert.throws(()=>productKey(url));

});
test('queue handles pause/resume, manual verification, retry, duplicates, and persistence',async()=>{
 let attempts=0,saved;const q=new Queue({save:async s=>{saved=JSON.parse(JSON.stringify(s));},extract:async(item,settings,q)=>{
   await q.checkpoint();if(item.productId==='2'&&attempts++===0)throw new Error('Temporary failure');
   if(item.productId==='1')await q.manual('Login in Chromium');return {productId:item.productId,title:'Observed',path:path.join(tmp,'existing.zip'),warnings:[],exportFormat:EXPORT_FORMAT,priceMode:'visible-variation-v1'};
 }});
 await fs.writeFile(path.join(tmp,'existing.zip'),'zip');
 const added=await q.add(['https://www.aliexpress.com/item/1.html','https://www.aliexpress.us/item/1.html','https://www.aliexpress.com/item/2.html']);assert.equal(added[1].status,'duplicate');
 await q.pause();const run=q.run({});await new Promise(r=>setTimeout(r,150));assert.equal(q.items[0].status,'pending');await q.resume();
 while(!q.waiting)await new Promise(r=>setTimeout(r,10));q.continue();await run;assert.equal(q.items[0].status,'done');assert.equal(q.items[1].status,'failed');
 await q.retry();await q.run({});assert.equal(q.items[1].status,'done');assert.equal(q.items[1].attempts,2);assert.equal(saved.downloads.length,2);
 const duplicates=await q.add(['https://www.aliexpress.com/item/1.html']);assert.equal(duplicates[0].status,'duplicate');
 const restored=new Queue({extract:async()=>{},initial:{items:[{status:'running'}]}});assert.equal(restored.items[0].status,'pending');
});
test('earlier CSV and JPEG exports without visible-variation pricing can be re-exported',async()=>{
 const oldFile=path.join(tmp,'old-csv-jpeg.zip');await fs.writeFile(oldFile,'old csv jpeg');const q=new Queue({extract:async()=>{},initial:{downloads:[{productId:'56',path:oldFile,title:'Earlier CSV and JPEG archive',exportFormat:'csv-jpeg-v1'}]}});const added=await q.add(['https://www.aliexpress.com/item/56.html']);assert.equal(added[0].status,'pending');
});
test('old four-column CSV with correct visible prices can be re-exported with the newly requested fields',async()=>{
 const oldFile=path.join(tmp,'old-priced-csv.zip');await fs.writeFile(oldFile,'old priced csv');const q=new Queue({extract:async()=>{},initial:{downloads:[{productId:'57',path:oldFile,title:'Old four-column CSV',exportFormat:'csv-jpeg-v1',priceMode:'visible-variation-v1'}]}});const added=await q.add(['https://www.aliexpress.com/item/57.html']);assert.equal(added[0].status,'pending');
});
test('legacy exports never prevent re-export to the requested CSV and JPEG format',async()=>{
 const oldFile=path.join(tmp,'legacy.zip');await fs.writeFile(oldFile,'legacy');const q=new Queue({extract:async()=>{},initial:{downloads:[{productId:'55',path:oldFile,title:'Earlier archive'}]}});const added=await q.add(['https://www.aliexpress.com/item/55.html']);assert.equal(added[0].status,'pending');
});
test('version 1.3 exports with blank descriptions or UI icons can be captured again in the filtered Excel format',async()=>{
 const oldFile=path.join(tmp,'v13-product.zip');await fs.writeFile(oldFile,'old product csv with UI icons');const q=new Queue({extract:async()=>{},initial:{downloads:[{productId:'58',path:oldFile,title:'Old ten-column product archive',exportFormat:'product-csv-jpeg-v2',priceMode:'visible-variation-v1'}]}});const added=await q.add(['https://www.aliexpress.com/item/58.html']);assert.equal(added[0].status,'pending');
});

test('version 1.4.0 archives can be recaptured as Excel-only without deleting existing exports',async()=>{const file=path.join(tmp,'v14-product.zip');await fs.writeFile(file,'earlier Excel and CSV');const q=new Queue({extract:async()=>{},initial:{downloads:[{productId:'59',path:file,exportFormat:'product-csv-xlsx-jpeg-v3',priceMode:'visible-variation-v1'}]}});assert.equal((await q.add(['https://www.aliexpress.com/item/59.html']))[0].status,'pending');assert.equal(await fs.readFile(file,'utf8'),'earlier Excel and CSV');});

test('version 1.4.1 exports with unconfirmed prices can be recaptured in the corrected variation format',async()=>{const file=path.join(tmp,'v141-product.zip');await fs.writeFile(file,'earlier workbook');const q=new Queue({extract:async()=>{},initial:{downloads:[{productId:'60',path:file,exportFormat:'product-xlsx-jpeg-v4',priceMode:'visible-variation-v1'}]}});assert.equal((await q.add(['https://www.aliexpress.com/item/60.html']))[0].status,'pending');});
test('exports without size and price image filenames can be recaptured while keeping the earlier ZIP',async()=>{const file=path.join(tmp,'v5-product.zip');await fs.writeFile(file,'earlier images');const q=new Queue({extract:async()=>{},initial:{downloads:[{productId:'61',path:file,exportFormat:'product-xlsx-jpeg-v5',priceMode:'visible-variation-v1'}]}});assert.equal((await q.add(['https://www.aliexpress.com/item/61.html']))[0].status,'pending');assert.equal(await fs.readFile(file,'utf8'),'earlier images');});
