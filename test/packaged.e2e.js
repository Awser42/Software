const {workbookTable,archiveTable}=require('./workbook');
// Native Windows acceptance check. Never report this as passed on Linux.
const {_electron:electron}=require('playwright');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const assert=require('node:assert/strict');
const yauzl=require('yauzl');
const {columns}=require('./fixtures');
const {buildUpdate}=require('../scripts/build-update');
async function until(predicate,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Packaged update did not reach its expected state');}
let stage='setup',diagnosticApp,diagnosticDirectory,failureRecorded=false;const stages=[],processOutput=[];
function markStage(value){stage=value;stages.push({stage:value,at:new Date().toISOString()});console.log('PACKAGED_STAGE '+value);}
function captureProcess(app){diagnosticApp=app;const process=app.process();for(const stream of [process.stdout,process.stderr])stream?.on('data',bytes=>{processOutput.push(bytes.toString());if(processOutput.length>80)processOutput.shift();});}
async function bounded(promise,milliseconds=2000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Diagnostic collection timed out')),milliseconds);})]);}finally{clearTimeout(timer);}}
async function recordFailure(error){if(failureRecorded)return;failureRecorded=true;await fs.mkdir('test-results',{recursive:true});const record={stage,stages,error:{name:error.name,message:error.message,stack:error.stack},processOutput:processOutput.join('').slice(-20000)};try{const windows=diagnosticApp?.windows()||[];if(windows[0]){record.windowUrl=windows[0].url();record.windowText=await bounded(windows[0].locator('body').innerText({timeout:1500}));await bounded(windows[0].screenshot({path:'test-results/packaged-failure.png',timeout:1500}));}}catch(e){record.windowDiagnostic=e.message;}if(diagnosticDirectory)for(const name of ['state.json','code-updates/active.json','code-updates/booting.json']){try{record[name]=JSON.parse(await fs.readFile(path.join(diagnosticDirectory,name),'utf8'));}catch(e){if(e.code!=='ENOENT')record[name]=e.message;}}await fs.writeFile('test-results/packaged-failure.json',JSON.stringify(record,null,2)+'\n');if(process.env.GITHUB_STEP_SUMMARY){const safe=value=>String(value).replace(/[<>`]/g,'').slice(0,12000);await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`\n### Packaged Windows test failure\n\nStage: **${safe(stage)}**.\n\n~~~text\n${safe(error.stack||error.message)}\n~~~\n`);}}

function zipContents(file) {
 return new Promise((resolve,reject)=>{
  yauzl.open(file,{lazyEntries:true},(error,zip)=>{
   if(error)return reject(error);
   const entries={};
   zip.on('error',reject);zip.on('end',()=>resolve(entries));
   zip.on('entry',entry=>{
    if(entry.fileName.endsWith('/')){entries[entry.fileName]=Buffer.alloc(0);zip.readEntry();return;}
    zip.openReadStream(entry,(error,stream)=>{
     if(error)return reject(error);
     const chunks=[];stream.on('data',chunk=>chunks.push(chunk));stream.on('error',reject);
     stream.on('end',()=>{entries[entry.fileName]=Buffer.concat(chunks);zip.readEntry();});
    });
   });
   zip.readEntry();
  });
 });
}
(async()=>{
 if(process.platform!=='win32')throw new Error('This packaged EXE test requires Windows.');
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'packaged-app-'));diagnosticDirectory=data;
 const executablePath=process.env.INSTALLED_APP_EXE||path.resolve('dist/win-unpacked/AliExpress Product Archiver.exe'),args=[`--user-data-dir=${data}`];
 markStage('launch baseline packaged EXE');let app=await electron.launch({executablePath,args});captureProcess(app);
 try {
  markStage('wait for baseline application window');const page=await app.firstWindow();await page.waitForSelector('.link-url');if(process.env.INSTALLED_APP_EXE){const initial=await page.evaluate(()=>window.desktop.call('initial'));assert.equal(initial.installation.installed,true);assert.equal(initial.installation.windows,true);await page.locator('[data-tab="settings"]').click();assert.equal(await page.locator('#manageInstallation').textContent(),'Uninstall software');assert.equal(await page.locator('#manageInstallation').isEnabled(),true);await page.locator('[data-tab="bulk"]').click();}markStage('exercise bundled Chromium and production archive');
  const result=await app.evaluate(async({app})=>{
   const {Browser}=process.mainModule.require(app.getAppPath()+'/src/browser.js');
   const {convertToJpeg}=process.mainModule.require(app.getAppPath()+'/src/jpeg.js');
   const {makeArchive}=process.mainModule.require(app.getAppPath()+'/src/archive.js');
   const {captureVisiblePrices}=process.mainModule.require(app.getAppPath()+'/src/prices.js');
   const browser=new Browser(app.getPath('userData')+'/acceptance');
   try{
    const page=await browser.open('about:blank',{show:false});
    const startupUrl=page.url();
    const states=[];async function recordWindow(){const state=await browser.visibility();states.push({hidden:browser.hidden,nativeHidden:state.hidden});}
    await recordWindow('minimized');await browser.show();await recordWindow('normal');await browser.hide();await recordWindow('minimized');
    const encoded=await page.evaluate(async()=>{
     const canvas=new OffscreenCanvas(320,192);const context=canvas.getContext('2d');
     context.fillStyle='#136ad7';context.fillRect(0,0,320,192);
     const blob=await canvas.convertToBlob({type:'image/webp',quality:1});
     return new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);
      reader.onerror=()=>reject(new Error('Fixture image generation failed'));reader.readAsDataURL(blob);
     });
    });
    const webp=Buffer.from(encoded,'base64');
    // Deliberately use a .jpg URL and JPEG MIME with actual WebP bytes: the
    // production codec must decode and convert, never just rename the file.
    const imageUrl='https://ae01.alicdn.com/kf/packaged-fixture.jpg';
    const fixture={
     productId:'991234567890',sourceUrl:'https://www.aliexpress.com/item/991234567890.html',
     title:'Packaged fixture, embroidery "kit"',
     descriptionText:'AI overview of item\nDisclaimer: local acceptance fixture.\nObserved fixture description.',
     sellerDescriptionText:'Full independent seller details.\nContents: cotton cloth and threads.',
     features:['Cotton material','Embroidery pattern'],specifications:[{name:'Material',value:'Cotton'},{name:'Origin',value:'Mainland China'}],
     capturedAt:new Date().toISOString(),warnings:[],images:[imageUrl],descriptionImages:[imageUrl],
     properties:[{id:'5',name:'Size',values:[{id:'20',name:'20*20cm',image:imageUrl}]},{id:'14',name:'Color',values:[{id:'1',name:'Blue',image:imageUrl}]}],
     variations:[{skuId:'fixture-size20',attributes:'14:1;5:20',name:'Color: Blue / Size: 20*20cm',price:{currency:'USD',value:'99.00'}}],prices:{}
    };
    await page.route(fixture.sourceUrl,route=>route.fulfill({contentType:'text/html',body:'<h1>Packaged fixture</h1><div class="price-default--current">$8.15</div><div class="sku-item--property" data-property-id="14"><div class="sku-item--title">Color:Blue</div><div class="sku-item--skus"><button type="button" data-sku-col="14:1" aria-pressed="true" title="Blue">Blue</button></div></div><div class="sku-item--property" data-property-id="5"><div class="sku-item--title">Size:20*20cm</div><div class="sku-item--skus"><button type="button" data-sku-col="5:20" aria-pressed="true" title="20*20cm">20*20cm</button></div></div>'}));
    await page.goto(fixture.sourceUrl,{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('.price-default--current').waitFor({state:'visible',timeout:30000});
    await captureVisiblePrices(page,fixture,{checkpoint:async()=>{}},{settleMs:100,timeoutMs:1000});
    const request={get:async url=>({ok:()=>true,url:()=>url,headers:()=>({'content-type':'image/jpeg'}),body:async()=>webp})};
    const archive=await makeArchive(fixture,app.getPath('userData')+'/acceptance-output',request,async()=>{},(bytes,mime)=>convertToJpeg(page,bytes,mime));
    return {url:startupUrl,exe:browser.browserExecutablePath,resources:process.resourcesPath,archive,states,
     sourceSignature:webp.toString('ascii',0,4)+'/'+webp.toString('ascii',8,12),
     expected:{title:fixture.title,description:fixture.descriptionText,seller:fixture.sellerDescriptionText,features:fixture.features.join('\n'),specs:fixture.specifications.map(spec=>spec.name+': '+spec.value).join('\n')}};
   }finally{await browser.close();}
  });
  markStage('validate packaged archive and Chromium window states');assert.equal(result.url,'about:blank');assert.deepEqual(result.states,[{hidden:true,nativeHidden:true},{hidden:false,nativeHidden:false},{hidden:true,nativeHidden:true}]);assert(result.exe.startsWith(path.join(result.resources,'chromium')));
  assert.equal(result.sourceSignature,'RIFF/WEBP');assert.equal(result.archive.exportFormat,'product-xlsx-jpeg-v8');
  assert.equal(result.archive.priceMode,'visible-variation-v1');
  assert.equal(result.archive.images,1);assert.deepEqual(result.archive.warnings,[]);
  const entries=await zipContents(result.archive.path);
  const files=Object.keys(entries).filter(name=>!name.endsWith('/')).sort();
  assert.equal(files.length,2);const imageFile=files.find(name=>name.startsWith('Images/'));assert.match(imageFile,/variation-.*Size-20_20cm.*-cost-\$8\.15-/);assert(files.includes('product.xlsx'));
  assert(Object.keys(entries).every(name=>name==='product.xlsx'||name==='Images/'||/^Images\/[^/]+\.jpg$/.test(name)));
  const rows=await workbookTable(entries['product.xlsx']);
  assert.deepEqual(rows,[columns,[result.expected.title,'Color: Blue / Size: 20*20cm','$8.15','20*20cm','Blue',result.expected.description,result.expected.seller,result.expected.features,result.expected.specs,imageFile]]);
  const jpeg=entries[files[0]];assert.equal(jpeg.readUInt16BE(0),0xffd8);
  const decoded=await app.evaluate(({nativeImage},base64)=>{
   const image=nativeImage.createFromBuffer(Buffer.from(base64,'base64'));
   return {empty:image.isEmpty(),...image.getSize()};
  },jpeg.toString('base64'));
  assert.deepEqual(decoded,{empty:false,width:320,height:192});
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/packaged-windows.png'});
  console.log('PASS: native Windows packaged EXE launches bundled Chromium and exports the visible $8.15 variation price (not catalog $99.00) with all observed Excel fields plus decoded 320x192 JPEG from actual WebP bytes.');
  markStage('build future-version code-only fixture');const baseline=require('../package.json').version;const [major,minor,patch]=baseline.split('.').map(Number);const futureVersion=`${major}.${minor}.${patch+1}`;const preserved=await page.evaluate(async()=>{const initial=await window.desktop.call('initial');await window.desktop.call('settings',{...initial.settings,settleMs:1400,delayMs:900});return {output:initial.settings.output,settleMs:1400,delayMs:900};});const fixture=await buildUpdate(path.resolve('.'),path.join(data,'update-fixture'),{version:futureVersion});const zipBytes=await fs.readFile(fixture.path);assert(zipBytes.length<256*1024,'Code updates must remain small and omit the browser/runtime');
  markStage('stage future code using packaged UpdateManager');const staged=await app.evaluate(async({app},payload)=>{const {UpdateManager}=process.mainModule.require(app.getAppPath()+'/src/updater.js');const requested=[];const updater=new UpdateManager({appPath:app.getAppPath(),userData:app.getPath('userData'),runtimeVersion:process.versions.electron,transport:async(url,options)=>{requested.push(url);if(url.endsWith('/update-manifest.json'))return Buffer.from(JSON.stringify(payload.manifest));const bytes=Buffer.from(payload.zipBase64,'base64');options.onProgress?.(bytes.length,bytes.length);return bytes;}});const available=await updater.check();const installed=await updater.download();return {available,installed,requested,userData:app.getPath('userData')};},{manifest:fixture.manifest,zipBase64:zipBytes.toString('base64')});assert.equal(staged.available.status,'available');assert.equal(staged.installed.status,'ready');assert.equal(staged.requested.length,2);assert(staged.requested[1].endsWith('/'+fixture.manifest.asset));assert(!staged.requested.some(url=>/chromium|electron/i.test(url)));
  markStage('restart packaged EXE with staged update');await app.close();app=await electron.launch({executablePath,args});captureProcess(app);markStage('wait for updated application window');const updatedPage=await app.firstWindow();await updatedPage.waitForSelector('.link-url');const initial=await updatedPage.evaluate(()=>window.desktop.call('initial'));assert.equal(initial.update.currentVersion,futureVersion);assert.equal(initial.state.downloads.length,0);for(const [key,value]of Object.entries(preserved))assert.equal(initial.settings[key],value,`Preserved setting ${key}`);
  markStage('verify updated version and healthy startup pointer');const startup=await app.evaluate(({app})=>{const startup=globalThis[Symbol.for('aliexpress.archiver.bootstrap')];return {version:startup.version,directory:startup.directory,baseAppPath:app.getAppPath(),electron:process.versions.electron};});assert.equal(startup.version,futureVersion);assert(startup.directory.includes('code-updates'));assert.equal(startup.electron,require('../package.json').devDependencies.electron);await until(async()=>{try{return JSON.parse(await fs.readFile(path.join(staged.userData,'code-updates','active.json'),'utf8')).pending===false;}catch{return false;}});await assert.rejects(fs.access(path.join(staged.userData,'code-updates','booting.json')),{code:'ENOENT'});await updatedPage.screenshot({path:'test-results/packaged-small-update.png'});console.log(`PASS: actual packaged EXE verified and installed a ${zipBytes.length}-byte app-code update, restarted into version ${futureVersion}, loaded the real UI/production modules using the existing Electron/Playwright dependencies, and marked startup healthy without downloading Chromium.`);
  markStage('complete');await fs.writeFile('test-results/packaged-stages.json',JSON.stringify(stages,null,2)+'\n');
 }catch(error){await recordFailure(error);throw error;}finally{await app.close().catch(()=>{});await fs.rm(data,{recursive:true,force:true});}
})().catch(async e=>{await recordFailure(e).catch(error=>console.error('Diagnostic collection failed:',error));console.error(e);process.exitCode=1;});
