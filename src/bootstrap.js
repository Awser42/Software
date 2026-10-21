// This loader belongs to the full Electron package. Code-only updates never
// replace it or download Electron/Chromium/dependencies again.
const path=require('node:path');
const fs=require('node:fs');
const Module=require('node:module');
const vm=require('node:vm');
const {selectStartup,rollbackPointer,RUNTIME_KEY}=require('./updater');
function loadCode(directory,appPath,entry='src/main.js') {
  const baseRequire=Module.createRequire(path.join(appPath,'package.json')),cache=new Map();
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'update-manifest.json'),'utf8'));
  const approved=new Set(manifest.files.map(file=>path.resolve(directory,...file.path.split('/'))));
  function resolveLocal(request,parent){const candidate=path.resolve(path.dirname(parent),request);if(!candidate.startsWith(path.resolve(directory)+path.sep))throw new Error('Update import escaped its code directory.');for(const filename of [candidate,candidate+'.js',candidate+'.json',path.join(candidate,'index.js')])if(approved.has(filename)&&fs.existsSync(filename)&&fs.statSync(filename).isFile())return filename;throw new Error('Missing approved update module: '+request);}
  function load(filename){if(cache.has(filename))return cache.get(filename).exports;const extension=path.extname(filename);if(extension==='.json')return JSON.parse(fs.readFileSync(filename,'utf8'));if(extension!=='.js')throw new Error('Unsupported update module.');const instance=new Module(filename,module);instance.filename=filename;instance.paths=[];const scopedRequire=request=>request.startsWith('.')?load(resolveLocal(request,filename)):baseRequire(request);scopedRequire.resolve=request=>request.startsWith('.')?resolveLocal(request,filename):baseRequire.resolve(request);scopedRequire.cache=Object.create(null);scopedRequire.main=require.main;instance.require=scopedRequire;cache.set(filename,instance);try{const source=fs.readFileSync(filename,'utf8').replace(/^#![^\n]*(?:\n|$)/,'');const compiled=vm.compileFunction(source,['exports','require','module','__filename','__dirname'],{filename});compiled(instance.exports,scopedRequire,instance,filename,path.dirname(filename));instance.loaded=true;return instance.exports;}catch(error){cache.delete(filename);throw error;}}
  const main=path.join(directory,...entry.split('/'));if(!approved.has(main))throw new Error('Update entry is not approved.');return load(main);
}
async function boot(){const {app,dialog}=require('electron');if(!app.requestSingleInstanceLock()){app.quit();return;}const appPath=app.getAppPath();const startup=await selectStartup({appPath,userData:app.getPath('userData'),runtimeVersion:process.versions.electron});globalThis[RUNTIME_KEY]={...startup,appPath};if(!startup.directory){require('./main');return;}try{loadCode(startup.directory,appPath,startup.manifest.entry);}catch(error){await rollbackPointer(startup.paths,startup.pointer,`The downloaded app code could not start: ${error.message}`);dialog.showErrorBox('App update restored','The small update could not start. The previous app code will reopen; your archives and login have been kept.');app.relaunch({exePath:process.env.PORTABLE_EXECUTABLE_FILE||process.execPath});app.exit(0);}}
if(require.main===module)boot().catch(error=>{const {app,dialog}=require('electron');dialog.showErrorBox('Product Archiver could not start',String(error.message||error));app.exit(1);});
module.exports={boot,loadCode};
