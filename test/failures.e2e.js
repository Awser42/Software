const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const pkg=require('../package.json');
const audit={status:'running',version:pkg.version,nativeWindows:process.platform==='win32'};
async function until(check){for(let n=0;n<200;n++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Failed Links state did not settle');}
(async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'archiver-failures-')),output=path.join(data,'exports'),report=path.join(data,'failed-links.txt');let instance;
  try{
    await fs.mkdir(output);await fs.writeFile(path.join(data,'state.json'),JSON.stringify({settings:{output,delayMs:0,keepRunningInBackground:false}}));
    async function launch(){instance=await electron.launch({args:[path.resolve('test/failures-harness.js')],env:{...process.env,E2E_DATA:data}});const page=await instance.firstWindow();await page.waitForSelector('.link-url');return page;}
    let page=await launch();
    const current=()=>page.evaluate(()=>window.desktop.call('initial'));
    await page.evaluate(async()=>{await window.desktop.call('add',['1','2','3'].map(id=>`https://www.aliexpress.com/item/${id}.html`).join('\n'));await window.desktop.call('run');});
    await until(async()=>{const {state}=await current();return !state.running&&state.items.every(item=>item.status==='done'||item.status==='failed');});
    assert.equal((await current()).state.downloads.length,1);await until(async()=>await page.locator('#failedCount').textContent()==='2');
    await page.locator('[data-tab="progress"]').click();assert.equal(await page.locator('#items [data-state="failed"]').count(),0);
    await page.locator('[data-tab="failed"]').click();assert.equal(await page.locator('.failure-row').count(),2);assert.match(await page.locator('#failedList').textContent(),/fixture navigation failed/);
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/failed-links-desktop.png'});
    await instance.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(390,844));await page.screenshot({path:'test-results/failed-links-small.png'});
    await instance.close();instance=null;page=await launch();await page.locator('[data-tab="failed"]').click();assert.equal(await page.locator('.failure-row').count(),2);audit.restartPersistence=true;
    await page.locator('#failedSearch').fill('Product 1 unavailable');assert.equal(await page.locator('.failure-row').count(),1);
    const firstId=await page.locator('.failure-row').getAttribute('data-failure-id');
    await page.getByRole('button',{name:'Copy link',exact:true}).click();assert.equal(await instance.evaluate(({clipboard})=>clipboard.readText()),'https://www.aliexpress.com/item/1.html');
    await page.locator('#failedSearch').fill('no-such-link');assert.match(await page.locator('#failedList').textContent(),/No matching/);await page.locator('#failedSearch').fill('');
    await page.locator('#copyFailures').click();assert.equal(await instance.evaluate(({clipboard})=>clipboard.readText()),'https://www.aliexpress.com/item/1.html\nhttps://www.aliexpress.com/item/2.html');
    await instance.evaluate(({dialog},report)=>{global.failureDialogs=[];global.failureResponse=0;global.saveCanceled=true;dialog.showMessageBox=async(_win,options)=>{global.failureDialogs.push(options);return {response:global.failureResponse};};dialog.showSaveDialog=async()=>({canceled:global.saveCanceled,filePath:report});},report);
    assert.equal(await page.evaluate(()=>window.desktop.call('export-failed')),false);await assert.rejects(fs.access(report));
    await instance.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},path.join(output,'fixture-3.zip'));
    await assert.rejects(page.evaluate(()=>window.desktop.call('export-failed')),/Choose a .txt file/);assert.equal(await fs.readFile(path.join(output,'fixture-3.zip'),'utf8'),'synthetic archive sentinel');
    await instance.evaluate(({dialog},report)=>{dialog.showSaveDialog=async()=>({canceled:global.saveCanceled,filePath:report});},report);
    await instance.evaluate(()=>{global.saveCanceled=false;});await page.locator('#exportFailures').click();await until(async()=>await fs.readFile(report,'utf8').catch(()=>null)==='https://www.aliexpress.com/item/1.html\nhttps://www.aliexpress.com/item/2.html\n');audit.copyExport=true;
    await page.locator('#clearFailures').click();await until(()=>instance.evaluate(()=>global.failureDialogs.length===1));assert.equal(await page.locator('.failure-row').count(),2);
    const options=await instance.evaluate(()=>global.failureDialogs[0]);assert.equal(options.defaultId,0);assert.equal(options.cancelId,0);
    await page.locator('#failedSearch').fill('Product 1 unavailable');
    await instance.evaluate(()=>{global.failureFixture.successful.add('1');global.failureFixture.blocked=true;});await page.getByRole('button',{name:'Retry link',exact:true}).click();
    await until(async()=>{const {state}=await current(),item=state.items.find(item=>item.id===firstId);return state.running&&item.status==='running'&&item.attempts===2;});
    await page.locator('[data-tab="failed"]').click();await page.locator('#failedSearch').fill('');await until(async()=>await page.locator('.failure-row').count()===1&&await page.locator('#retryFailures').isDisabled());
    await assert.rejects(page.evaluate(()=>window.desktop.call('retry-failed')),/Wait for the run/);
    await until(()=>instance.evaluate(()=>typeof global.failureFixture.release==='function'));await instance.evaluate(()=>{global.failureFixture.blocked=false;global.failureFixture.release();});await until(async()=>!(await current()).state.running);
    assert.deepEqual(await instance.evaluate(()=>global.failureFixture.seen),['1']);assert.equal((await current()).state.items.find(item=>item.productId==='1').status,'done');audit.isolatedRetry=true;
    await page.locator('#retryFailures').click();await until(async()=>{const {state}=await current();return !state.running&&state.items.find(item=>item.productId==='2').attempts===2;});
    await page.locator('[data-tab="failed"]').click();await until(async()=>/Attempt 2/.test(await page.locator('#failedList').textContent()));assert.equal(await page.locator('.failure-row').count(),1);audit.failedRetryReturned=true;
    await instance.evaluate(()=>{global.failureResponse=1;});await page.locator('[data-tab="downloads"]').click();await page.locator('#clearRecords').click();await until(async()=>(await current()).state.downloads.length===0);
    assert.equal((await current()).state.items.filter(item=>item.status==='failed').length,1);assert.equal(await fs.readFile(path.join(output,'fixture-3.zip'),'utf8'),'synthetic archive sentinel');assert.equal(await fs.readFile(path.join(output,'fixture-1.zip'),'utf8'),'synthetic archive sentinel');audit.downloadsClearPreservesFailuresAndExports=true;
    await page.locator('[data-tab="progress"]').click();await page.locator('#clear').click();assert.equal((await current()).state.items.length,1);
    await page.locator('[data-tab="failed"]').click();await page.getByRole('button',{name:'Remove failed link',exact:true}).click();await until(async()=>(await current()).state.items.length===0);await until(async()=>await page.locator('.failure-row').count()===0);
    await assert.rejects(page.evaluate(id=>window.desktop.call('copy-failed',[id]),firstId),/no longer/);audit.confirmedRemoval=true;
    await instance.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.join(output,'fixture-3.zip'));
    await page.locator('[data-tab="bulk"]').click();await page.locator('#chooseFolder').click();await page.evaluate(async()=>{await window.desktop.call('add','https://www.aliexpress.com/item/3.html');await window.desktop.call('run');});
    await until(async()=>await page.locator('#error').isVisible());assert.match(await page.locator('#error').textContent(),/EEXIST|already exists/i);assert.equal((await current()).state.running,false);assert.equal((await current()).state.items[0].status,'pending');
    await instance.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});},output);await page.locator('#chooseFolder').click();await page.locator('#run').click();await until(async()=>{const {state}=await current();return !state.running&&state.items[0].status==='done';});await until(async()=>!await page.locator('#error').isVisible());audit.outputFailureRecovery=true;audit.status='passed';
    console.log('PASS: real desktop Failed Links automatically separates errors, persists across restart, copies/exports URLs, retries only selected links, handles another failure and confirms deletion without removing ZIPs.');
  }catch(error){audit.error={message:error.message,stack:error.stack};throw error;}
  finally{if(instance)await instance.close();await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/failed-links.json',JSON.stringify(audit,null,2)+'\n');await fs.rm(data,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
