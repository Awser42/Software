// Apply the real small update to the previously released EXE, not a rebuilt runtime.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {archiveTable,unzip,sheetRows}=require('./workbook');
const {productHtml,endpointHtml,frameHtml}=require('./fixtures');
const {hoopHtml,hoops,designs,prices:hoopPrices}=require('./hoop-fixtures');
const audit={status:'running',stages:[]};
function stage(name){audit.stages.push(name);console.log('CODE_UPDATE_STAGE '+name);}
(async()=>{
  if(process.platform!=='win32')throw new Error('This acceptance check requires native Windows.');
  const executablePath=process.env.CODE_UPDATE_BASE_EXE;
  assert(executablePath,'Supply the released 1.4.3 EXE.');
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'archiver-code-update-'));
  const args=[`--user-data-dir=${data}`];let instance;
  try{
    stage('launch released 1.4.3 EXE');instance=await electron.launch({executablePath,args});
    let page=await instance.firstWindow();await page.waitForSelector('.link-url');
    const initial=await page.evaluate(()=>window.desktop.call('initial'));assert.equal(initial.update.currentVersion,'1.4.3');
    const manifest=JSON.parse(await fs.readFile('dist/update-manifest.json','utf8'));
    const bytes=await fs.readFile(path.join('dist',manifest.asset));assert(bytes.length<256*1024);
    stage('apply new code through the existing EXE updater');
    const updated=await instance.evaluate(async({app},payload)=>{
      const {UpdateManager}=process.mainModule.require(app.getAppPath()+'/src/updater.js');
      const requests=[];const manager=new UpdateManager({appPath:app.getAppPath(),userData:app.getPath('userData'),runtimeVersion:process.versions.electron,transport:async url=>{requests.push(url);return url.endsWith('update-manifest.json')?Buffer.from(JSON.stringify(payload.manifest)):Buffer.from(payload.bytes,'base64');}});
      await manager.check();await manager.download();return {state:manager.info(),requests};
    },{manifest,bytes:bytes.toString('base64')});
    assert.equal(updated.state.status,'ready');assert.equal(updated.requests.length,2);
    await instance.close();instance=await electron.launch({executablePath,args});page=await instance.firstWindow();await page.waitForSelector('.link-url');
    assert.equal((await page.evaluate(()=>window.desktop.call('initial'))).update.currentVersion,manifest.version);
    assert.equal(await page.locator('#runningVersion').textContent(),manifest.version);
    await page.locator('[data-tab="downloads"]').click();assert(await page.locator('#clearRecords').isVisible());
    stage('native Chromium visibility and three real product tabs with different prices');
    const fixtures=[['801','$8.15','$6.40'],['802','$12.35','$9.20'],['803','$17.85','$11.10']].map(([id,large,small])=>({id,large,small,html:productHtml(id,{large,small}),endpoint:endpointHtml(id),frame:frameHtml(id)}));
    fixtures.push({id:'804',hoops:true,html:hoopHtml('804'),endpoint:'',frame:''});
    const result=await instance.evaluate(async({app,BrowserWindow},fixtures)=>{
      const startup=globalThis[Symbol.for('aliexpress.archiver.bootstrap')];
      const {loadCode}=process.mainModule.require(app.getAppPath()+'/src/bootstrap.js');
      const {Browser}=loadCode(startup.directory,app.getAppPath(),'src/browser.js');
      const {Queue}=loadCode(startup.directory,app.getAppPath(),'src/queue.js');
      const browser=new Browser(app.getPath('userData')+'/acceptance');
      try{
        const control=await browser.open('about:blank',{show:false});const states=[await browser.visibility()];
        await browser.show();states.push(await browser.visibility());await browser.hide();states.push(await browser.visibility());
        const softwareVisible=BrowserWindow.getAllWindows().some(window=>window.isVisible());
        const image=await control.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=192;const ctx=canvas.getContext('2d');ctx.fillStyle='#137c53';ctx.fillRect(0,0,320,192);return canvas.toDataURL('image/webp').split(',')[1];});
        const imageBytes=Buffer.from(image,'base64'),context=browser.context;let peak=0;const authenticated=[];
        const pid=await browser.browserProcessId(),execFile=process.mainModule.require('node:child_process').execFile;
        const commandLine=await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`],{windowsHide:true,timeout:15000},(error,stdout)=>error?reject(error):resolve(stdout.trim())));
        const sandbox=!!commandLine&&!/(?:^|\s)"?--no-sandbox(?:[=\s"]|$)/i.test(commandLine);
        await context.addCookies([{url:'https://www.aliexpress.com/',name:'fixture-login',value:'preserved',expires:Math.floor(Date.now()/1000)+86400}]);
        context.on('page',()=>{peak=Math.max(peak,context.pages().length-1);});
        await context.route('https://www.aliexpress.com/**',route=>{
          const url=route.request().url();const fixture=fixtures.find(f=>url.includes('/item/'+f.id+'.html')||url.includes('/description/frame-'+f.id+'.html'));
          if(!fixture)return route.abort();
          if(url.includes('/item/'))authenticated.push((route.request().headers().cookie||'').includes('fixture-login=preserved'));
          return route.fulfill({contentType:'text/html',body:url.includes('/description/')?fixture.frame:fixture.html});
        });
        await context.route('https://ae01.alicdn.com/**',route=>route.fulfill({contentType:'image/webp',body:imageBytes}));
        const request={get:async url=>{const fixture=fixtures.find(f=>url.includes('/description/endpoint-'+f.id+'.html'));const body=fixture?Buffer.from(fixture.endpoint):imageBytes;return {ok:()=>true,status:()=>200,url:()=>url,headers:()=>({'content-type':fixture?'text/html':'image/webp'}),body:async()=>body,text:async()=>body.toString('utf8')};}};
        browser.context=new Proxy(context,{get(target,key){if(key==='request')return request;const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
        const queue=new Queue({extract:(...args)=>browser.extract(...args)});
        await queue.add(fixtures.map(f=>'https://www.aliexpress.com/item/'+f.id+'.html'));
        const settings={output:app.getPath('userData')+'/exports',parallelTabs:3,settleMs:100,backgroundBrowser:true};
        await queue.run(settings);
        const final=await browser.visibility();const remainingTabs=context.pages().length;const visibilityWorker=browser.windowVisibility.stats();
        await browser.close();await browser.open('about:blank',{show:false});
        const cookies=await browser.context.cookies('https://www.aliexpress.com/');
        return {states,softwareVisible,sandbox,peak,authenticated,final,remainingTabs,visibilityWorker,items:queue.items,downloads:queue.downloads,cookiePreserved:cookies.some(cookie=>cookie.name==='fixture-login'&&cookie.value==='preserved'),startupVersion:startup.version};
      }finally{await browser.close();}
    },fixtures);
    assert(result.softwareVisible);assert.deepEqual(result.states.map(state=>state.hidden),[true,false,true]);
    assert.equal(result.final.visible,0);assert.equal(result.peak,3);assert.equal(result.remainingTabs,1);assert(result.cookiePreserved);assert.equal(result.visibilityWorker.processStarts,1);assert(result.visibilityWorker.requests>10);
    assert(result.sandbox);assert.equal(result.authenticated.length,4);assert(result.authenticated.every(Boolean));assert(result.items.every(item=>item.status==='done'),JSON.stringify(result.items));
    assert.equal(result.downloads.length,4);
    for(const download of result.downloads){
      const fixture=fixtures.find(f=>f.id===download.productId),table=await archiveTable(download.path);
      const rows=table.slice(1).map(row=>Object.fromEntries(table[0].map((key,index)=>[key,row[index]])));
      assert.equal(download.exportFormat,'product-xlsx-jpeg-v9');const book=await unzip((await unzip(download.path))['product.xlsx']);assert(book['xl/worksheets/sheet3.xml']);const [imageHeaders,...imageValues]=sheetRows(book['xl/worksheets/sheet3.xml']);const imageMap=imageValues.map(values=>Object.fromEntries(imageHeaders.map((key,index)=>[key,values[index]])));
      assert.equal(rows.length,fixture.hoops?12:2);for(const row of rows){const expected=fixture.hoops?hoopPrices[designs.indexOf(row.Color)][hoops.indexOf(row.Size)]:row.Size==='20*20cm'?fixture.large:fixture.small;assert.equal(row.Price,expected);assert.equal(row.Design,row.Color);assert.equal(row['Price Status'],'confirmed-visible');assert.equal(row['Option Status'],'confirmed-selected');assert.match(row['Variant ID'],/^V[a-f0-9]{12}$/);assert.match(row['Design ID'],/^D[a-f0-9]{12}$/);for(const file of row.Images.split('\n')){assert(file.includes('-cost-'+expected+'-'));assert(file.includes(row['Variant ID']));const mapped=imageMap.find(image=>image.File===file);assert(mapped);assert.equal(mapped['Variant ID'],row['Variant ID']);assert.equal(mapped.Design,row.Design);assert.equal(mapped.Price,row.Price);assert(['matched','shared'].includes(mapped.Role));}}
    }
    stage('healthy update pointer and screenshot');
    assert.equal(JSON.parse(await fs.readFile(path.join(data,'code-updates','active.json'),'utf8')).pending,false);
    await assert.rejects(fs.access(path.join(data,'code-updates','booting.json')),{code:'ENOENT'});
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/code-update-windows.png'});
    Object.assign(audit,{status:'passed',version:manifest.version,bytes:bytes.length,sha256:manifest.sha256,baseVersion:'1.4.3',nativeWindows:true,exportFormat:'product-xlsx-jpeg-v9',variantIdentities:true,imageMapping:true,chromiumStates:result.states,peakTabs:result.peak,distinctProductPrices:true,hoopCombinations:12,distinctHoopPrices:true,browserSandbox:result.sandbox,loginPreserved:true,softwareVisible:true,visibilityWorker:result.visibilityWorker});
    console.log('PASS: existing Windows EXE applied only new code, hid Chromium without hiding the software, shared login across three concurrent product tabs and kept every size-specific cost isolated.');
  }catch(error){audit.status='failed';audit.error={message:error.message,stack:error.stack};throw error;}
  finally{await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/code-update.json',JSON.stringify(audit,null,2)+'\n');if(instance)await instance.close().catch(()=>{});await fs.rm(data,{recursive:true,force:true,maxRetries:10,retryDelay:300}).catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
