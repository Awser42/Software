const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const pkg=require('../package.json');
const audit={status:'running',version:pkg.version,stages:[]};
function stage(name){audit.stages.push(name);console.log('LITE_STAGE '+name);}
function run(executable,args){return new Promise((resolve,reject)=>{const child=spawn(executable,args,{windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>{child.kill();reject(new Error('Lite installer timed out.'));},120000);child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Lite installer exited '+code));});});}
async function until(check){const started=Date.now();while(Date.now()-started<60000){if(await check())return;await new Promise(resolve=>setTimeout(resolve,200));}throw new Error('Lite installation did not settle.');}
const exists=file=>fs.access(file).then(()=>true,()=>false);
(async()=>{
  assert.equal(process.platform,'win32','Lite acceptance requires native Windows.');
  const setup=path.resolve(`dist-lite/AliExpress-Product-Archiver-${pkg.version}-Lite-Setup.exe`),bytes=await fs.readFile(setup);
  assert(bytes.length<246723464*.65,'Lite Setup must be substantially smaller than the 1.4.3 full installer.');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'archiver-lite-')),directory=path.join(root,'installed'),profile=path.join(root,'profile');
  const executable=path.join(directory,'AliExpress Product Archiver.exe'),uninstaller=path.join(directory,'Uninstall AliExpress Product Archiver.exe');let instance;
  try{
    stage('install the real smaller Setup');await run(setup,['/S',`/D=${directory}`]);await until(()=>exists(executable));
    assert(!await exists(path.join(directory,'resources','chromium')),'Lite must not ship a second Chromium runtime.');
    const cacheSource=path.dirname(path.dirname(process.env.TEST_CHROMIUM));
    stage('seed the pinned first-download cache from the already verified runtime');
    await fs.mkdir(path.join(profile,'browsers'),{recursive:true});await fs.cp(cacheSource,path.join(profile,'browsers',path.basename(cacheSource)),{recursive:true});
    stage('launch installed Lite software and use the persistent external browser cache');
    instance=await electron.launch({executablePath:executable,args:[`--user-data-dir=${profile}`]});const page=await instance.firstWindow();await page.waitForSelector('.link-url');
    const initial=await page.evaluate(()=>window.desktop.call('initial'));assert.equal(initial.update.currentVersion,pkg.version);assert.equal(initial.installation.installed,true);
    const result=await instance.evaluate(async({app})=>{
      const {Browser}=process.mainModule.require(app.getAppPath()+'/src/browser.js'),messages=[];const browser=new Browser(app.getPath('userData'),message=>messages.push(message));
      try{await browser.open('about:blank',{show:false});return {bundled:browser.browserExecutablePath,cache:process.mainModule.require('playwright').chromium.executablePath(),hidden:(await browser.visibility()).hidden,messages};}
      finally{await browser.close();}
    });
    assert.equal(result.bundled,null);assert(result.cache.startsWith(path.join(profile,'browsers')));assert(result.hidden);assert(!result.messages.some(message=>message.startsWith('Downloading')));
    await page.screenshot({path:'test-results/lite-windows.png'});await instance.close();instance=null;
    stage('uninstall Lite and keep its separate browser cache');await run(uninstaller,['/S','/currentuser']);await until(async()=>!await exists(executable));assert(await exists(result.cache));
    Object.assign(audit,{status:'passed',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),fullInstallerBytes:246723464,smallerPercent:Math.round((1-bytes.length/246723464)*100),noBundledChromium:true,externalCache:true,installedLaunch:true,uninstalled:true,note:'The pinned browser cache was seeded from the checksum-verified release to avoid claiming a live first-download test.'});
  }catch(error){audit.error={message:error.message,stack:error.stack};throw error;}
  finally{if(instance)await instance.close().catch(()=>{});if(await exists(uninstaller))await run(uninstaller,['/S','/currentuser']).catch(()=>{});await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/lite.json',JSON.stringify(audit,null,2)+'\n');await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:300}).catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
