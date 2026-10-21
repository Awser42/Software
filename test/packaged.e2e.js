// Native Windows acceptance check. Never report this as passed on Linux.
const {_electron:electron}=require('playwright');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const assert=require('node:assert/strict');
(async()=>{
 if(process.platform!=='win32')throw new Error('This packaged EXE test requires Windows.');
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'packaged-app-'));
 const app=await electron.launch({executablePath:path.resolve('dist/win-unpacked/AliExpress Product Archiver.exe'),args:[`--user-data-dir=${data}`]});
 try {
  const page=await app.firstWindow();await page.waitForSelector('#urls');
  const result=await app.evaluate(async({app})=>{
   const {Browser}=process.mainModule.require(app.getAppPath()+'/src/browser.js');
   const browser=new Browser(app.getPath('userData')+'/acceptance');
   try{const page=await browser.open('about:blank');return {url:page.url(),exe:browser.browserExecutablePath,resources:process.resourcesPath};}finally{await browser.close();}
  });
  assert.equal(result.url,'about:blank');assert(result.exe.startsWith(path.join(result.resources,'chromium')));
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/packaged-windows.png'});
  console.log('PASS: native Windows packaged EXE launches included Chromium without browser installation.');
 }finally{await app.close();await fs.rm(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
