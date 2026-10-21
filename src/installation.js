const fs=require('node:fs/promises');
const path=require('node:path');
const subprocess=require('node:child_process');
function uninstallerPath(executable=process.execPath){return path.join(path.dirname(executable),'Uninstall AliExpress Product Archiver.exe');}
async function installationInfo({executable=process.execPath,platform=process.platform,portable=process.env.PORTABLE_EXECUTABLE_FILE}={}){
 const windows=platform==='win32';
 const installed=windows&&!portable&&await fs.access(uninstallerPath(executable)).then(()=>true,()=>false);
 return {windows,installed:!!installed};
}
async function launchUninstaller({executable=process.execPath,platform=process.platform,portable=process.env.PORTABLE_EXECUTABLE_FILE,beforeLaunch=async()=>{}}={}){
 if(!(await installationInfo({executable,platform,portable})).installed)throw new Error('This is a portable copy. Choose Quit, then delete its EXE. Install the Setup version for the Windows uninstaller.');
 await beforeLaunch();
 const target=uninstallerPath(executable);
 await new Promise((resolve,reject)=>{
  // Fixed sibling executable and fixed arguments: no shell or user-supplied
  // command. The native uninstaller retains its normal confirmation window.
  const child=subprocess.spawn(target,['/currentuser'],{detached:true,stdio:'ignore',windowsHide:false});
  child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});
 });
 return {started:true};
}
module.exports={installationInfo,launchUninstaller,uninstallerPath};
