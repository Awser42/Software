// Windows acceptance for the actual self-extracting portable distribution.
// Public release transport is replaced only while staging the local update.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const net=require('node:net');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {buildUpdate}=require('../scripts/build-update');
const {UpdateManager}=require('../src/updater');
const pkg=require('../package.json');
const evidenceDirectory=path.resolve(__dirname,'../test-results');
let failureLogged=false;
const audit={startedAt:new Date().toISOString(),baselineVersion:pkg.version,distribution:'actual self-extracting Windows portable EXE',status:'running',stage:'setup',stages:[],launches:[]};
function stage(name,details={}){audit.stage=name;audit.stages.push({at:new Date().toISOString(),name,...details});console.log('PORTABLE_STAGE '+JSON.stringify({name,...details}));}
async function captureFailure(browser){
  await fs.mkdir(evidenceDirectory,{recursive:true});
  const file=path.join(evidenceDirectory,'portable-failure.png');
  if(browser){try{const pages=browser.contexts().flatMap(context=>context.pages());audit.failurePages=pages.map(page=>page.url());const page=pages.find(candidate=>candidate.url().startsWith('file:'))||pages[0];if(page){await page.screenshot({path:file,timeout:5000});audit.screenshot='portable-failure.png';return;}}catch(error){audit.screenshotError=error.message;}}
  if(process.platform==='win32')try{await bounded(new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $bounds=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bitmap=New-Object System.Drawing.Bitmap $bounds.Width,$bounds.Height; $graphics=[System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($bounds.X,$bounds.Y,0,0,$bounds.Size); $bitmap.Save($env:PORTABLE_FAILURE_SCREENSHOT,[System.Drawing.Imaging.ImageFormat]::Png); $graphics.Dispose(); $bitmap.Dispose()"],{windowsHide:true,stdio:'ignore',env:{...process.env,PORTABLE_FAILURE_SCREENSHOT:file}});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Desktop screenshot exited '+code)));}),10000,'Desktop screenshot timed out');await fs.access(file);audit.screenshot='portable-failure.png';}catch(error){audit.screenshotError=error.message;}
}
async function writeAudit(error){await fs.mkdir(evidenceDirectory,{recursive:true});if(error){audit.status='failed';audit.error={name:error.name,message:error.message,stack:error.stack};if(!failureLogged){failureLogged=true;console.error('PORTABLE_FAILURE '+JSON.stringify({stage:audit.stage,error:audit.error,launch:audit.launches.at(-1),failurePages:audit.failurePages,screenshot:audit.screenshot,screenshotError:audit.screenshotError}).slice(0,24000));}}audit.finishedAt=new Date().toISOString();await fs.writeFile(path.join(evidenceDirectory,'portable-update.json'),JSON.stringify(audit,null,2)+'\n');if(process.env.GITHUB_STEP_SUMMARY){const safe=value=>String(value).replace(/[<>`|\r\n]/g,' ');await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`\n### Portable EXE acceptance\n\nStatus: **${safe(audit.status)}**. Last stage: **${safe(audit.stage)}**.\n\n${safe(error?.message||'Actual portable EXE and verified small app update completed.')}\n\nEvidence: portable-update.json${audit.screenshot?', '+safe(audit.screenshot):''}.\n`);}}

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function bounded(promise,timeout,message){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),timeout);})]);}finally{clearTimeout(timer);}}
async function until(predicate,timeout=30000){const start=Date.now();let last;while(Date.now()-start<timeout){try{const value=await predicate();if(value)return value;}catch(error){last=error;}await pause(150);}throw new Error('Portable acceptance timed out'+(last?': '+last.message:''));}
function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});}
function debugEndpoint(port){return new Promise((resolve,reject)=>{const request=http.get({hostname:'127.0.0.1',port,path:'/json/version',timeout:1500},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('error',reject);response.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(response.statusCode!==200||!value.webSocketDebuggerUrl)throw new Error('Electron debugging endpoint is not ready');resolve(value.webSocketDebuggerUrl);}catch(error){reject(error);}});});request.on('timeout',()=>request.destroy(new Error('Electron debugging endpoint timed out')));request.on('error',reject);});}
async function targetSnapshot(browser,port){const result={};try{result.httpTargets=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(3000)})).json();}catch(error){result.httpError=error.message;}if(browser){let session;try{result.pages=browser.contexts().map(context=>context.pages().map(page=>page.url()));session=await browser.newBrowserCDPSession();result.cdpTargets=(await session.send('Target.getTargets')).targetInfos;}catch(error){result.cdpError=error.message;}finally{await session?.detach().catch(()=>{});}}return result;}
const isAppUrl=url=>typeof url==='string'&&url.startsWith('file:')&&new URL(url).pathname.endsWith('/index.html');
async function inspectMainFailure(port){
  let socket;
  try{return await bounded((async()=>{
    const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1200)})).json();
    const endpoint=targets.find(target=>target.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
    if(!endpoint)throw new Error('Node inspector exposed no debugging target');
    return new Promise((resolve,reject)=>{
      socket=new WebSocket(endpoint);
      socket.addEventListener('error',()=>reject(new Error('Node inspector WebSocket failed')),{once:true});
      socket.addEventListener('close',()=>reject(new Error('Node inspector closed before the diagnostic response')),{once:true});
      socket.addEventListener('message',event=>{try{const response=JSON.parse(String(event.data));if(response.id!==1)return;if(response.error)throw new Error(response.error.message);if(response.result.exceptionDetails)throw new Error(response.result.exceptionDetails.text);resolve(response.result.result.value);}catch(error){reject(error);}});
      socket.addEventListener('open',()=>socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{returnByValue:true,expression:`(()=>{const {app,BrowserWindow}=process.mainModule.require('electron');const startup=globalThis[Symbol.for('aliexpress.archiver.bootstrap')];return {appPath:app.getAppPath(),ready:app.isReady(),userData:app.getPath('userData'),mainModule:process.mainModule.filename,executable:process.execPath,portableFile:process.env.PORTABLE_EXECUTABLE_FILE||null,bootstrap:startup?{version:startup.version,directory:startup.directory,rollbackReason:startup.rollbackReason}:null,windows:BrowserWindow.getAllWindows().map(win=>({id:win.id,visible:win.isVisible(),destroyed:win.isDestroyed(),url:win.webContents.isDestroyed()?null:win.webContents.getURL(),loading:win.webContents.isDestroyed()?null:win.webContents.isLoading()}))};})()`}})),{once:true});
    });
  })(),3000,'Read-only Node inspector diagnostic timed out');}catch(error){return {error:error.message};}finally{socket?.close();}
}
async function launchPortable(executable,data){
  const port=await freePort();
  let inspectorPort=await freePort();while(inspectorPort===port)inspectorPort=await freePort();
  const launch={number:audit.launches.length+1,port,inspectorPort,startedAt:new Date().toISOString()};audit.launches.push(launch);stage('launch-'+launch.number+'-spawn',{port,inspectorPort});
  const childEnvironment={...process.env};delete childEnvironment.PW_CHROMIUM_ATTACH_TO_OTHER;
  const child=spawn(executable,[`--user-data-dir=${data}`,`--remote-debugging-port=${port}`,`--inspect=127.0.0.1:${inspectorPort}`],{env:childEnvironment,windowsHide:false,stdio:['ignore','pipe','pipe']});
  launch.pid=child.pid;
  let output='',spawnError=null;
  const collect=chunk=>{output=(output+chunk.toString()).slice(-6000);};child.stdout.on('data',collect);child.stderr.on('data',collect);child.on('error',error=>{spawnError=error;});
  const exit=new Promise(resolve=>child.once('exit',(code,signal)=>{launch.exit={code,signal,at:new Date().toISOString()};resolve({code,signal});}));
  let browser;
  try{
    await until(async()=>{if(spawnError)throw spawnError;if(child.exitCode!==null)throw new Error(`Portable launcher exited before the UI opened (${child.exitCode}). ${output}`);return debugEndpoint(port);},90000);
    launch.targetsBeforeConnect=await targetSnapshot(null,port);
    stage('launch-'+launch.number+'-debug-ready',{targets:launch.targetsBeforeConnect.httpTargets});
    // The debugging socket can be available before Electron has navigated its
    // initial blank target. Attach after the actual app target exists, so CDP
    // maps the final renderer to its context on both baseline and update boots.
    stage('launch-'+launch.number+'-waiting-native-app-target');
    await until(async()=>{launch.targetsReady=await targetSnapshot(null,port);return launch.targetsReady.httpTargets?.some(target=>isAppUrl(target.url));},30000);
    stage('launch-'+launch.number+'-native-app-target-ready',{targets:launch.targetsReady.httpTargets});
    // Electron can expose native window targets as "other" on Windows. This
    // affects only this test's CDP attachment, never the application process.
    process.env.PW_CHROMIUM_ATTACH_TO_OTHER='1';
    let page;launch.connections=[];
    for(let attempt=1;attempt<=3&&!page;attempt++){
      browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:30000});
      const connected=await targetSnapshot(browser,port);launch.connections.push({attempt,...connected});launch.targetsAfterConnect=connected;
      launch.pages=browser.contexts().flatMap(context=>context.pages()).map(candidate=>candidate.url());stage('launch-'+launch.number+'-cdp-connected',{attempt,pages:launch.pages});
      try{page=await until(()=>browser.contexts().flatMap(context=>context.pages()).find(candidate=>isAppUrl(candidate.url())),5000);}catch(error){
        launch.connections.at(-1).afterWait=await targetSnapshot(browser,port);
        if(attempt===3)throw error;
        // Closing a connectOverCDP connection detaches only this test client;
        // the independently launched portable process and its UI stay intact.
        await browser.close();browser=null;await pause(250);
      }
    }
    page.on('pageerror',error=>{(launch.pageErrors||=[]).push(error.message);});
    stage('launch-'+launch.number+'-waiting-for-link-cells',{url:page.url()});
    await page.waitForSelector('.link-url',{timeout:30000});
    stage('launch-'+launch.number+'-ui-ready');
    return {child,browser,page,exit,output:()=>output,launch};
  }catch(error){launch.output=output;launch.spawnError=spawnError?.message;launch.targetsAtFailure=await targetSnapshot(browser,port);launch.mainAtFailure=await inspectMainFailure(inspectorPort);await captureFailure(browser);await writeAudit(error);await terminate({child,browser,exit});throw error;}
}
async function closePortable(instance){
  stage('launch-'+instance.launch.number+'-closing');
  // The test turns close-to-tray off through the real settings IPC first.
  await instance.page.evaluate(()=>window.close()).catch(()=>{});
  const result=await bounded(instance.exit,30000,'Portable wrapper did not exit after its application closed. '+instance.output());
  await instance.browser.close().catch(()=>{});
  assert.equal(result.code,0,'Portable wrapper must exit cleanly');
  instance.launch.output=instance.output();stage('launch-'+instance.launch.number+'-closed');
}
async function terminate(instance){
  if(!instance)return;
  await instance.browser?.close().catch(()=>{});
  if(instance.child?.exitCode===null&&instance.child.pid){await new Promise(resolve=>{const killer=spawn('taskkill',['/PID',String(instance.child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});killer.once('error',resolve);killer.once('exit',resolve);});await bounded(instance.exit,5000,'Portable process cleanup timed out').catch(()=>{});}
}
(async()=>{
  if(process.platform!=='win32')throw new Error('Portable EXE acceptance requires Windows.');
  const root=path.resolve(__dirname,'..'),executable=path.join(root,'dist',`AliExpress-Product-Archiver-${pkg.version}-win-x64.exe`);
  await fs.access(executable);
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'portable-acceptance-'));
  let instance;
  try{
    instance=await launchPortable(executable,data);
    stage('baseline-initial-ipc');
    const initial=await instance.page.evaluate(()=>window.desktop.call('initial'));
    audit.baselineObservedVersion=initial.update.currentVersion;
    assert.equal(initial.update.currentVersion,pkg.version);
    const preserved={...initial.settings,keepRunningInBackground:false,backgroundBrowser:true,delayMs:1100,settleMs:1700};
    await instance.page.evaluate(value=>window.desktop.call('settings',value),preserved);
    stage('baseline-settings-saved');
    await closePortable(instance);instance=null;
    const [major,minor,patch]=pkg.version.split('.').map(Number),futureVersion=`${major}.${minor}.${patch+1}`;
    stage('build-future-code-update',{futureVersion});audit.updatedVersion=futureVersion;
    const fixture=await buildUpdate(root,path.join(data,'update-fixture'),{version:futureVersion});
    const bytes=await fs.readFile(fixture.path),requests=[];
    audit.codeUpdateBytes=bytes.length;
    assert(bytes.length<256*1024,'The portable update must contain small app code only');
    const updater=new UpdateManager({appPath:root,userData:data,runtimeVersion:pkg.devDependencies.electron,transport:async(url,options)=>{requests.push(url);if(url.endsWith('/update-manifest.json'))return Buffer.from(JSON.stringify(fixture.manifest));options.onProgress?.(bytes.length,bytes.length);return bytes;}});
    stage('stage-future-code-update');assert.equal((await updater.check()).status,'available');assert.equal((await updater.download()).status,'ready');
    assert.equal(requests.length,2);assert(!requests.some(url=>/chromium|electron/i.test(url)));
    instance=await launchPortable(executable,data);
    stage('updated-initial-ipc');
    const updated=await instance.page.evaluate(()=>window.desktop.call('initial'));
    audit.updatedObservedVersion=updated.update.currentVersion;
    assert.equal(updated.update.currentVersion,futureVersion);
    for(const key of ['output','keepRunningInBackground','backgroundBrowser','delayMs','settleMs'])assert.equal(updated.settings[key],preserved[key],`Portable update preserves ${key}`);
    stage('verify-updated-startup-healthy');await until(async()=>{const pointer=JSON.parse(await fs.readFile(path.join(data,'code-updates','active.json'),'utf8'));audit.updatePointer=pointer;return pointer.pending===false&&pointer.current.version===futureVersion;});
    await assert.rejects(fs.access(path.join(data,'code-updates','booting.json')),{code:'ENOENT'});
    await fs.mkdir(path.join(root,'test-results'),{recursive:true});
    await instance.page.screenshot({path:path.join(root,'test-results/portable-small-update.png')});
    await closePortable(instance);instance=null;
    audit.status='passed';audit.healthy=true;audit.settingsPreserved=true;audit.transport='controlled update fixture; no public release price/account test';stage('complete');await writeAudit();
    console.log(`PASS: actual portable wrapper opened ${pkg.version}, exited and cleaned its extracted runtime, then reopened into verified ${futureVersion} app code (${bytes.length} bytes) using the same EXE, preserving settings and marking startup healthy.`);
  }catch(error){if(instance){instance.launch.output=instance.output();await captureFailure(instance.browser);}await writeAudit(error);throw error;}finally{await terminate(instance);await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(async error=>{await writeAudit(error).catch(()=>{});console.error(error);process.exitCode=1;});
