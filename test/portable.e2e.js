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

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function bounded(promise,timeout,message){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),timeout);})]);}finally{clearTimeout(timer);}}
async function until(predicate,timeout=30000){const start=Date.now();let last;while(Date.now()-start<timeout){try{const value=await predicate();if(value)return value;}catch(error){last=error;}await pause(150);}throw new Error('Portable acceptance timed out'+(last?': '+last.message:''));}
function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});}
function debugEndpoint(port){return new Promise((resolve,reject)=>{const request=http.get({hostname:'127.0.0.1',port,path:'/json/version',timeout:1500},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('error',reject);response.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(response.statusCode!==200||!value.webSocketDebuggerUrl)throw new Error('Electron debugging endpoint is not ready');resolve(value.webSocketDebuggerUrl);}catch(error){reject(error);}});});request.on('timeout',()=>request.destroy(new Error('Electron debugging endpoint timed out')));request.on('error',reject);});}
async function launchPortable(executable,data){
  const port=await freePort();
  const child=spawn(executable,[`--user-data-dir=${data}`,`--remote-debugging-port=${port}`],{windowsHide:false,stdio:['ignore','pipe','pipe']});
  let output='',spawnError=null;
  const collect=chunk=>{output=(output+chunk.toString()).slice(-6000);};child.stdout.on('data',collect);child.stderr.on('data',collect);child.on('error',error=>{spawnError=error;});
  const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  let browser;
  try{
    await until(async()=>{if(spawnError)throw spawnError;if(child.exitCode!==null)throw new Error(`Portable launcher exited before the UI opened (${child.exitCode}). ${output}`);return debugEndpoint(port);},90000);
    browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:30000});
    const page=await until(()=>browser.contexts().flatMap(context=>context.pages()).find(candidate=>candidate.url().startsWith('file:')&&/index\.html(?:$|[?#])/.test(candidate.url())),30000);
    await page.waitForSelector('.link-url',{timeout:30000});
    return {child,browser,page,exit,output:()=>output};
  }catch(error){await terminate({child,browser,exit});throw error;}
}
async function closePortable(instance){
  // The test turns close-to-tray off through the real settings IPC first.
  await instance.page.evaluate(()=>window.close()).catch(()=>{});
  const result=await bounded(instance.exit,30000,'Portable wrapper did not exit after its application closed. '+instance.output());
  await instance.browser.close().catch(()=>{});
  assert.equal(result.code,0,'Portable wrapper must exit cleanly');
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
    const initial=await instance.page.evaluate(()=>window.desktop.call('initial'));
    assert.equal(initial.update.currentVersion,pkg.version);
    const preserved={...initial.settings,keepRunningInBackground:false,backgroundBrowser:true,delayMs:1100,settleMs:1700};
    await instance.page.evaluate(value=>window.desktop.call('settings',value),preserved);
    await closePortable(instance);instance=null;
    const [major,minor,patch]=pkg.version.split('.').map(Number),futureVersion=`${major}.${minor}.${patch+1}`;
    const fixture=await buildUpdate(root,path.join(data,'update-fixture'),{version:futureVersion});
    const bytes=await fs.readFile(fixture.path),requests=[];
    assert(bytes.length<256*1024,'The portable update must contain small app code only');
    const updater=new UpdateManager({appPath:root,userData:data,runtimeVersion:pkg.devDependencies.electron,transport:async(url,options)=>{requests.push(url);if(url.endsWith('/update-manifest.json'))return Buffer.from(JSON.stringify(fixture.manifest));options.onProgress?.(bytes.length,bytes.length);return bytes;}});
    assert.equal((await updater.check()).status,'available');assert.equal((await updater.download()).status,'ready');
    assert.equal(requests.length,2);assert(!requests.some(url=>/chromium|electron/i.test(url)));
    instance=await launchPortable(executable,data);
    const updated=await instance.page.evaluate(()=>window.desktop.call('initial'));
    assert.equal(updated.update.currentVersion,futureVersion);
    for(const key of ['output','keepRunningInBackground','backgroundBrowser','delayMs','settleMs'])assert.equal(updated.settings[key],preserved[key],`Portable update preserves ${key}`);
    await until(async()=>{const pointer=JSON.parse(await fs.readFile(path.join(data,'code-updates','active.json'),'utf8'));return pointer.pending===false&&pointer.current.version===futureVersion;});
    await assert.rejects(fs.access(path.join(data,'code-updates','booting.json')),{code:'ENOENT'});
    await fs.mkdir(path.join(root,'test-results'),{recursive:true});
    await instance.page.screenshot({path:path.join(root,'test-results/portable-small-update.png')});
    await fs.writeFile(path.join(root,'test-results/portable-update.json'),JSON.stringify({baselineVersion:pkg.version,updatedVersion:futureVersion,codeUpdateBytes:bytes.length,distribution:'actual self-extracting Windows portable EXE',launches:2,healthy:true,settingsPreserved:true,transport:'controlled update fixture; no public release price/account test'},null,2)+'\n');
    await closePortable(instance);instance=null;
    console.log(`PASS: actual portable wrapper opened ${pkg.version}, exited and cleaned its extracted runtime, then reopened into verified ${futureVersion} app code (${bytes.length} bytes) using the same EXE, preserving settings and marking startup healthy.`);
  }finally{await terminate(instance);await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(error=>{console.error(error);process.exitCode=1;});
