const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
async function until(fn,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out waiting for expected state');}
(async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'archiver-ui-'));
 const executablePath=process.env.TEST_ELECTRON || require('electron');
 const instance=await electron.launch({executablePath,args:[path.resolve('test/electron-harness.js')],env:{...process.env,E2E_DATA:data,DISPLAY:process.env.DISPLAY||':99'}});
 try {
  const page=await instance.firstWindow();await page.waitForSelector('#urls');
  await page.locator('[data-tab="settings"]').click();await page.locator('#settle').fill('1');await page.locator('#delay').fill('0.5');await page.locator('#saveSettings').click();
  const out=path.join(data,'archives');
  // Exercise the actual native-folder IPC; replace only the OS picker result.
  await instance.evaluate(({dialog},out)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[out]});},out);
  await page.locator('[data-tab="bulk"]').click();await page.locator('#chooseFolder').click();await until(()=>page.locator('#folderLabel').textContent().then(t=>t===out));
  await page.locator('#urls').fill('https://www.aliexpress.com/item/1.html\nhttps://www.aliexpress.us/item/1.html\nhttps://evil.test/item/1.html');await page.locator('#run').click();
  await page.locator('#manual').waitFor({state:'visible',timeout:20000});
  assert((await page.locator('#manualText').textContent()).includes('CAPTCHA'));
  await page.locator('#pause').click();await until(()=>page.locator('#summary').textContent().then(t=>t.startsWith('Paused')));
  // Manual completion in the actual separate Chromium page.
  await instance.evaluate(async()=>{await global.fixturePage.goto('https://www.aliexpress.com/verified');await global.fixturePage.goto('https://www.aliexpress.com/item/1.html');});
  await page.locator('#continue').click();await page.locator('#resume').click();
  await until(()=>page.locator('#statDone').textContent().then(t=>t==='1'));
  await until(()=>page.locator('#summary').textContent().then(t=>t.startsWith('Idle')));
  const zips=(await fs.readdir(out)).filter(n=>n.endsWith('.zip'));assert.equal(zips.length,1);
  await page.locator('[data-tab="downloads"]').click();assert.equal(await page.locator('.download-card').count(),1);assert.equal(await page.locator('.preview img').count(),1);
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/downloads.png',fullPage:true});
  await page.locator('[data-tab="bulk"]').click();await page.locator('#urls').fill('https://www.aliexpress.com/item/1.html');await page.locator('#run').click();assert((await page.locator('#notice').textContent()).includes('1 duplicates'));
  await page.screenshot({path:'test-results/bulk-links.png',fullPage:true});
  await page.locator('#urls').fill('https://www.aliexpress.com/item/2.html');await page.locator('#run').click();
  await until(()=>page.locator('#statFailed').textContent().then(t=>t==='1'));
  await until(()=>page.locator('#summary').textContent().then(t=>t.startsWith('Idle')));
  assert((await page.locator('#items').innerText()).includes('Product navigation failed'));
  await page.locator('#retry').click();
  await until(async()=>{const current=await page.evaluate(()=>window.desktop.call('initial'));return current.state.items[1].attempts===2&&!current.state.running;});
  assert.equal((await fs.readdir(out)).filter(n=>n.endsWith('.zip')).length,1);
  const disk=JSON.parse(await fs.readFile(path.join(data,'state.json'),'utf8'));assert.equal(disk.downloads.length,1);assert.equal(disk.items[0].status,'done');assert.equal(disk.settings.output,out);
  assert.equal(disk.items[1].attempts,2);assert.equal(disk.items[1].status,'failed');
  await page.locator('[data-tab="bulk"]').click();
  await page.locator('#urls').fill(Array.from({length:10},(_,i)=>`https://www.aliexpress.com/item/${101+i}.html`).join('\n'));
  await page.locator('#run').click();
  await until(async()=>{const current=await page.evaluate(()=>window.desktop.call('initial'));return current.state.downloads.length>=2;});
  const midway=await page.evaluate(()=>window.desktop.call('initial'));
  assert(midway.state.running,'Batch must still be running when the first new ZIP becomes available');
  assert(midway.state.items.some(i=>i.status==='pending'),'Remaining products must still be queued');
  const firstNew=midway.state.downloads[0];await fs.access(firstNew.path);
  assert.equal(await page.locator('#latestExport').isVisible(),true);
  await page.screenshot({path:'test-results/bulk-in-progress.png',fullPage:true});
  await until(async()=>{const current=await page.evaluate(()=>window.desktop.call('initial'));return !current.state.running&&current.state.downloads.length===11;},90000);
  const complete=JSON.parse(await fs.readFile(path.join(data,'state.json'),'utf8'));
  assert.equal(complete.items.filter(i=>i.status==='done').length,11);
  assert.equal((await fs.readdir(out)).filter(n=>n.endsWith('.zip')).length,11);
  assert.equal(new Set(complete.downloads.map(d=>d.productId)).size,11);
  console.log('PASS: ten-product bulk batch saves each ZIP and publishes it while remaining products continue in one Chromium session.');
  console.log('PASS: Electron tabs, settings, folder picker IPC, bulk input, invalid URL, duplicate skipping, real Chromium manual gate, pause/resume, extraction, ZIP, preview, navigation failure, retry, persistence.');
 } catch(e) {
  const page=await instance.firstWindow();console.error('UI diagnostic:',await page.locator('body').innerText());throw e;
 } finally {await instance.close();await fs.rm(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
