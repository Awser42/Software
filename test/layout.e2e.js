const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {existsSync}=require('node:fs');
const pkg=require('../package.json');
const audit={status:'running',version:pkg.version,viewports:[]};
const settings={output:'C:\\Users\\Owner\\Downloads\\AliExpress Archives',skipDuplicates:true,delayMs:2000,settleMs:3000,parallelTabs:3,backgroundBrowser:true,keepRunningInBackground:true};
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
(async()=>{
  const server=http.createServer(async(req,res)=>{try{const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';if(!['index.html','style.css','icons.svg','renderer.js','link-grid.js'].includes(file)){res.writeHead(404);res.end();return;}const body=await fs.readFile(path.resolve('src',file));res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'text/html'});res.end(body);}catch{res.writeHead(500);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,...(process.env.TEST_CHROMIUM?{executablePath:process.env.TEST_CHROMIUM}:existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
  try{
    const page=await browser.newPage();const failures=[];page.on('pageerror',error=>failures.push(error.message));
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.addInitScript(({settings,version})=>{window.previewCalls=[];const items=[{id:'failed-1',productId:'1',url:'https://www.aliexpress.com/item/1.html?long=fixture-for-responsive-url-wrapping-without-overflow',status:'failed',attempts:2,error:'Product navigation failed: the seller page is unavailable. Retry when the connection is restored.',failedAt:'2026-10-22T12:00:00Z'},{id:'failed-2',productId:'2',url:'https://www.aliexpress.com/item/2.html',status:'failed',attempts:1,error:'Network error'}];window.desktop={call:async(name,value)=>{window.previewCalls.push([name,value]);if(name==='initial')return {settings,state:{items,downloads:[],running:false,paused:false},update:{currentVersion:version},installation:{installed:false}};if(name==='settings')return {...settings,...value};},onState:callback=>{window.previewState=callback;},onUpdate:()=>{}};},{settings,version:pkg.version});
    await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.getElementById('folderLabel').textContent.length>0);await fs.mkdir('test-results',{recursive:true});
    for(const [width,height] of [[1440,1000],[1024,820],[768,900],[520,840],[390,844],[360,780]]){
      await page.setViewportSize({width,height});
      for(const name of ['bulk','progress','downloads','failed','settings']){
        await page.locator(`[data-tab="${name}"]`).click();await settle(page);
        const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth>innerWidth+1,main:document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth+1,buttons:[...document.querySelectorAll('button')].filter(button=>button.getClientRects().length&&button.scrollWidth>button.clientWidth+2).map(button=>button.id||button.textContent)}));
        assert.equal(overflow.page,false,`${width}px ${name} page overflow`);assert.equal(overflow.main,false,`${width}px ${name} main overflow`);assert.deepEqual(overflow.buttons,[],`${width}px ${name} button overflow`);
        if(name==='failed'){assert.equal(await page.locator('.failure-row').count(),2);await page.screenshot({path:`test-results/failed-layout-${width}.png`});}
      }
      await page.locator('[data-tab="bulk"]').click();await settle(page);await page.screenshot({path:`test-results/redesign-${width}.png`});audit.viewports.push({width,height,panels:5,overflow:false});
    }
    await page.setViewportSize({width:1440,height:1000});
    const stats=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d');ctx.fillStyle='#d5e8dc';ctx.fillRect(0,0,320,240);const preview=canvas.toDataURL('image/jpeg');
      const downloads=Array.from({length:2000},(_,index)=>({path:`C:/exports/product-${index}.zip`,productId:String(index),title:`Product ${String(index).padStart(4,'0')}`,images:12,rowCount:2,capturedAt:new Date(1700000000000+index*1000).toISOString(),exportFormat:'product-xlsx-jpeg-v9',preview,warnings:[],detailsPreview:[{variation:'Size: S',size:'S',price:'$6.40'},{variation:'Size: L',size:'L',price:'$8.15'}]}));
      const state={items:[],downloads,running:false,paused:false};window.previewFixture=state;window.previewState(state);
      return {records:downloads.length};
    });
    await page.locator('[data-tab="downloads"]').click();await settle(page);assert.equal(await page.locator('.download-card').count(),24);
    await page.locator('#downloadList .data-preview').first().evaluate(node=>{node.open=true;});
    const benchmark=await page.evaluate(async()=>{
      const first=document.querySelector('.download-card'),image=first.querySelector('img');let mutations=0;
      const observer=new MutationObserver(records=>{mutations+=records.filter(record=>record.type==='childList').length;});observer.observe(document.getElementById('downloadList'),{subtree:true,childList:true});
      const started=performance.now();for(let n=0;n<500;n++)window.previewState({...window.previewFixture,message:'Processing '+n});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));observer.disconnect();
      return {messages:500,milliseconds:performance.now()-started,mutations,nodeReused:first===document.querySelector('.download-card'),imageReused:image===document.querySelector('.download-card img'),previewOpen:first.querySelector('.data-preview').open};
    });
    audit.benchmark=benchmark;assert.equal(benchmark.mutations,0);assert(benchmark.nodeReused&&benchmark.imageReused&&benchmark.previewOpen,JSON.stringify(benchmark));assert(benchmark.milliseconds<2000,'Progress notifications must not block the UI');
    await page.locator('#downloadSearch').fill('Product 0123');await settle(page);assert.equal(await page.locator('.download-card').count(),1);assert.match(await page.locator('.download-card h3').textContent(),/0123/);
    await page.locator('#downloadSearch').fill('no-such-product');assert.match(await page.locator('#downloadList').textContent(),/No matching/);
    await page.locator('#downloadSearch').fill('');await page.locator('#downloadSort').selectOption('title');await settle(page);assert.equal(await page.locator('.download-card h3').first().textContent(),'Product 0000');
    await page.locator('.download-card button').last().click();assert.equal(await page.evaluate(()=>window.previewCalls.find(([name])=>name==='show')[1]),'C:/exports/product-23.zip');
    await page.locator('#listView').click();assert(await page.locator('#downloadList').evaluate(node=>node.classList.contains('list-mode')));await page.screenshot({path:'test-results/redesign-downloads-list.png'});
    await page.locator('#gridView').click();await page.locator('#moreDownloads').click();assert.equal(await page.locator('.download-card').count(),48);
    await page.locator('#hideBrowser').hover();await page.locator('#tooltip').waitFor({state:'visible'});assert.match(await page.locator('#tooltip').textContent(),/Hide Chromium/);
    assert.deepEqual(failures,[]);Object.assign(audit,{status:'passed',history:stats,benchmark,search:true,sort:true,viewModes:true,pagination:true,stableArchiveTarget:true,reducedMotion:true});
    console.log('PASS: all five panels fit 360-1440px, search/sort/view/pagination work, and 500 progress messages reuse the same cards, photos and open previews across 2,000 records.');
  }catch(error){audit.error={message:error.message,stack:error.stack};throw error;}
  finally{await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/layout-performance.json',JSON.stringify(audit,null,2)+'\n');await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
