// Native Windows acceptance of the actual NSIS installer and uninstaller.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const pkg=require('../package.json');
const audit={version:pkg.version,status:'running',stages:[]};
function stage(name){audit.stages.push({name,at:new Date().toISOString()});console.log('INSTALLER_STAGE '+name);}
function run(executable,args,options={}){return new Promise((resolve,reject)=>{const child=spawn(executable,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],...options});let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('Process timed out: '+executable+'\n'+output));},180000);for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{const text=bytes.toString();output=(output+text).slice(-16000);process.stdout.write(text);});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve(output):reject(new Error(executable+' exited '+code+'\n'+output));});});}
async function exists(file){return fs.access(file).then(()=>true,()=>false);}
async function until(predicate,timeout=60000){const start=Date.now();while(Date.now()-start<timeout){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,300));}throw new Error('Installer state did not settle');}
async function registration(){const text=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$items=@(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'AliExpress Product Archiver*' } | Select-Object DisplayName,DisplayVersion,InstallLocation,UninstallString); ConvertTo-Json -InputObject $items -Compress"]);return JSON.parse(text.trim()||'[]');}
(async()=>{
 if(process.platform!=='win32')throw new Error('Actual installer acceptance requires Windows.');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'archiver-nsis-'));
 const installDirectory=path.join(directory,'installed'),exportDirectory=path.join(directory,'user-exports');
 const setup=path.resolve(`dist/AliExpress-Product-Archiver-${pkg.version}-Setup.exe`);
 const executable=path.join(installDirectory,'AliExpress Product Archiver.exe'),uninstaller=path.join(installDirectory,'Uninstall AliExpress Product Archiver.exe');
 let installed=false;
 try{
  stage('install actual Setup EXE per user');await run(setup,['/S',`/D=${installDirectory}`]);installed=true;await until(()=>exists(executable));assert(await exists(uninstaller));
  stage('verify Windows uninstall registration');const records=await registration();const record=records.find(item=>String(item.UninstallString||'').toLowerCase().includes(uninstaller.toLowerCase()));assert(record,'Installed app must appear in HKCU uninstall registration');assert.match(record.DisplayName,/^AliExpress Product Archiver(?: \d+\.\d+\.\d+)?$/);assert.equal(record.DisplayVersion,pkg.version);assert(record.UninstallString.includes('Uninstall AliExpress Product Archiver.exe'));audit.registration=record;
  stage('verify installed source and bundled browser bytes');await run(process.execPath,['scripts/verify-package.js',path.join(installDirectory,'resources')]);audit.sourceVerified=true;
  stage('run installed app export browser and code-update acceptance');await run(process.execPath,['test/packaged.e2e.js'],{env:{...process.env,INSTALLED_APP_EXE:executable}});
  await fs.mkdir(exportDirectory,{recursive:true});const exportFile=path.join(exportDirectory,'keep-my-export.txt');await fs.writeFile(exportFile,'User exports must survive uninstall.');
  stage('uninstall through actual registered uninstaller');await run(uninstaller,['/S']);await until(async()=>!(await exists(executable))&&!(await exists(uninstaller)));await until(async()=>!(await exists(installDirectory)));installed=false;
  stage('verify unregister and preserve user exports');const remaining=await registration();assert(!remaining.some(item=>String(item.UninstallString||'').toLowerCase().includes(uninstaller.toLowerCase())));assert.equal(await fs.readFile(exportFile,'utf8'),'User exports must survive uninstall.');audit.status='passed';audit.registered=true;audit.installedAppTest=true;audit.uninstalled=true;audit.exportsPreserved=true;
  console.log('PASS: actual Windows Setup installed and registered the app, the installed EXE exported Excel/JPEG and applied a small update, and uninstall removed its files and registration while keeping separate user exports.');
 }catch(error){audit.status='failed';audit.error={message:error.message,stack:error.stack};throw error;}
 finally{await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/installer.json',JSON.stringify(audit,null,2)+'\n');if(installed&&await exists(uninstaller))await run(uninstaller,['/S']).catch(()=>{});await fs.rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:300}).catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
