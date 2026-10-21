const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const subprocess=require('node:child_process');
const {EventEmitter}=require('node:events');
const {installationInfo,launchUninstaller,uninstallerPath}=require('../src/installation');
test('direct uninstall requires a real installed sibling, excludes portable copies and preserves native confirmation',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'uninstall-unit-')),executable=path.join(directory,'app.exe');
 const params={executable,platform:'win32',portable:null};const original=subprocess.spawn;
 try{
  assert.deepEqual(await installationInfo(params),{windows:true,installed:false});await assert.rejects(launchUninstaller(params),/portable/);
  await fs.writeFile(uninstallerPath(executable),'test fixture');assert.equal((await installationInfo(params)).installed,true);assert.equal((await installationInfo({...params,portable:executable})).installed,false);
  let closed=false,called;
  subprocess.spawn=(file,args,options)=>{assert(closed,'The browser/state must finish before launching uninstall');called={file,args,options};const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;};
  assert.deepEqual(await launchUninstaller({...params,beforeLaunch:async()=>{closed=true;}}),{started:true});assert.equal(called.file,uninstallerPath(executable));assert.deepEqual(called.args,['/currentuser']);assert(!called.args.includes('/S'));assert.equal(called.options.shell,undefined);
  subprocess.spawn=()=>{const child=new EventEmitter();queueMicrotask(()=>child.emit('error',new Error('fixture launch error')));return child;};await assert.rejects(launchUninstaller(params),/fixture launch error/);
 }finally{subprocess.spawn=original;await fs.rm(directory,{recursive:true,force:true});}
});
