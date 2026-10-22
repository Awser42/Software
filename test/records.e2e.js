const { _electron:electron }=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {EXPORT_FORMAT}=require('../src/archive');

async function until(check){
  const started=Date.now();
  while(Date.now()-started<10000){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}
  throw new Error('Timed out waiting for record deletion');
}

(async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'archiver-record-ui-'));
  const config=path.join(data,'config'),userData=path.join(config,'aliexpress-product-archiver'),output=path.join(data,'exports');
  const first=path.join(output,'first.zip'),second=path.join(output,'second.zip');
  let instance;
  try{
    await fs.mkdir(path.join(userData,'chromium-profile'),{recursive:true});await fs.mkdir(output);
    await fs.writeFile(first,'first existing export');await fs.writeFile(second,'second existing export');
    await fs.writeFile(path.join(output,'unrelated.txt'),'unrelated file');
    await fs.writeFile(path.join(userData,'chromium-profile','login-sentinel'),'profile must survive');
    const initial={settings:{output,skipDuplicates:true,settleMs:4000},items:[{id:'first',productId:'1',url:'https://www.aliexpress.com/item/1.html',status:'done',attempts:1},{id:'second',productId:'2',url:'https://www.aliexpress.com/item/2.html',status:'done',attempts:1}],downloads:[{productId:'1',title:'Small size archive',path:first,images:1,warnings:[],capturedAt:new Date().toISOString(),exportFormat:EXPORT_FORMAT,priceMode:'visible-variation-v1'},{productId:'2',title:'Large size archive',path:second,images:1,warnings:[],capturedAt:new Date().toISOString(),exportFormat:EXPORT_FORMAT,priceMode:'visible-variation-v1'}]};
    await fs.writeFile(path.join(userData,'state.json'),JSON.stringify(initial));
    async function launch(){
      instance=await electron.launch({args:[path.resolve('.')],env:{...process.env,XDG_CONFIG_HOME:config,XDG_CACHE_HOME:path.join(data,'cache')}});
      assert.equal(await instance.evaluate(({app})=>app.getPath('userData')),userData);
      const page=await instance.firstWindow();await page.waitForSelector('.link-url');return page;
    }
    let page=await launch();await page.locator('.link-url').first().fill('https://www.aliexpress.com/item/1.html');await page.locator('#run').click();
    await page.locator('.link-status[data-state="skipped"]').waitFor();await page.locator('[data-tab="downloads"]').click();
    assert.equal(await page.locator('.download-card').count(),2);
    await assert.rejects(page.evaluate(()=>window.desktop.call('delete-record','missing.zip')),/Unknown download/);
    await instance.evaluate(({dialog})=>{global.recordDialogs=[];global.recordResponse=0;dialog.showMessageBox=async(_window,options)=>{global.recordDialogs.push(options);return {response:global.recordResponse};};});
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/records-desktop.png',fullPage:true});
    await instance.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(900,750));
    await page.screenshot({path:'test-results/records-compact.png',fullPage:true});
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('button')].filter(button=>button.getClientRects().length&&button.scrollWidth>button.clientWidth+1).map(button=>button.textContent)),[]);
    await page.getByRole('button',{name:'Delete record',exact:true}).first().click();
    await until(()=>instance.evaluate(()=>global.recordDialogs.length===1));
    assert.equal(await page.locator('.download-card').count(),2);
    const options=await instance.evaluate(()=>global.recordDialogs[0]);assert.equal(options.defaultId,0);assert.equal(options.cancelId,0);assert.match(options.detail,/ZIP file will be kept/);
    await instance.evaluate(()=>{global.recordResponse=1;});
    await page.getByRole('button',{name:'Delete record',exact:true}).first().click();
    await until(async()=>await page.locator('.download-card').count()===1);
    let saved=JSON.parse(await fs.readFile(path.join(userData,'state.json'),'utf8'));
    assert.deepEqual(saved.downloads.map(d=>d.path),[second]);assert.equal(saved.items.length,1);
    await until(async()=>await page.locator('.link-status').first().getAttribute('data-state')==='ready');
    assert.equal(await page.locator('.link-url').first().inputValue(),'https://www.aliexpress.com/item/1.html');
    assert.equal(await fs.readFile(first,'utf8'),'first existing export');
    await page.evaluate(()=>window.desktop.call('add','https://www.aliexpress.com/item/3.html'));
    await page.locator('[data-tab="bulk"]').click();await page.locator('.link-url').first().fill('https://www.aliexpress.com/item/4.html');
    await page.locator('[data-tab="downloads"]').click();await instance.evaluate(()=>{global.recordResponse=0;});
    await page.locator('#clearRecords').click();await until(()=>instance.evaluate(()=>global.recordDialogs.length===3));
    assert.equal(await page.locator('.download-card').count(),1);
    assert.equal(await page.locator('.link-url').first().inputValue(),'https://www.aliexpress.com/item/4.html');
    await instance.evaluate(()=>{global.recordResponse=1;});await page.locator('#clearRecords').click();
    await until(async()=>await page.locator('.download-card').count()===0);
    assert.equal(await page.locator('#clearRecords').isDisabled(),true);assert.equal(await page.locator('.link-url').first().inputValue(),'');
    saved=JSON.parse(await fs.readFile(path.join(userData,'state.json'),'utf8'));
    assert.deepEqual(saved.items,[]);assert.deepEqual(saved.downloads,[]);assert.equal(saved.settings.skipDuplicates,true);assert.equal(saved.settings.settleMs,4000);
    assert.equal(await fs.readFile(second,'utf8'),'second existing export');assert.equal(await fs.readFile(path.join(output,'unrelated.txt'),'utf8'),'unrelated file');
    assert.equal(await fs.readFile(path.join(userData,'chromium-profile','login-sentinel'),'utf8'),'profile must survive');
    await instance.close();instance=null;page=await launch();
    const restored=await page.evaluate(()=>window.desktop.call('initial'));assert.deepEqual(restored.state.items,[]);assert.deepEqual(restored.state.downloads,[]);assert.equal(restored.settings.output,output);
    console.log('PASS: real desktop record deletion supports Cancel, single-record and all-record confirmation, survives restart, and preserves ZIPs, unrelated files, settings and browser profile.');
  }finally{if(instance)await instance.close();await fs.rm(data,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
