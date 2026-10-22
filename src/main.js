const {app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage, Tray, Menu} = require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {Queue}=require('./queue');
const {Browser}=require('./browser');
const {readArchivePreview,EXPORT_FORMAT}=require('./archive');
const {UpdateManager,markStartupHealthy}=require('./updater');
const {installationInfo,launchUninstaller}=require('./installation');
let win, queue, browser, settings, statePath, tray, updater;
let quitting=false,uninstalling=false;
if(!app.requestSingleInstanceLock()) app.quit();
function showApp(){if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}}
app.on('second-instance',showApp);
app.on('activate',showApp);
let writes=Promise.resolve();
function persist(state) {
  const text=JSON.stringify({settings,...state});
  writes=writes.catch(()=>{}).then(async()=>{await fs.writeFile(statePath+'.tmp',text); await fs.rename(statePath+'.tmp',statePath);});
  return writes;
}
let stateTimer,traySignature;
function send() {if(stateTimer)return;stateTimer=setTimeout(()=>{stateTimer=null;if(win&&!win.isDestroyed())win.webContents.send('state',{...queue.state(),browser:{open:!!browser.context,visible:!!browser.context&&!browser.hidden}});refreshTray();},50);}
function updateState(state){if(win&&!win.isDestroyed())win.webContents.send('update-state',state);}
function thumbnail(image){const size=image.getSize();const scale=Math.min(1,480/size.width,480/size.height);return image.resize({width:Math.max(1,Math.round(size.width*scale)),height:Math.max(1,Math.round(size.height*scale)),quality:'best'}).toDataURL();}
async function repairSavedPreviews(){
  let changed=false;
  for(const record of queue.downloads.slice(0,30)){
    if(record.exportFormat===EXPORT_FORMAT||record.previewRepairVersion===1)continue;
    const bytes=await readArchivePreview(record.path).catch(()=>null);
    if(bytes){const image=nativeImage.createFromBuffer(bytes);if(!image.isEmpty()){record.preview=thumbnail(image);changed=true;}}
    record.previewRepairVersion=1;changed=true;
  }
  if(changed)await queue.publish();
}
function refreshTray(){
  if(!tray)return;
  const signature=JSON.stringify([!!queue?.waiting,!!queue?.running,!!queue?.paused]);if(signature===traySignature)return;traySignature=signature;
  tray.setToolTip(queue?.waiting?'AliExpress Archiver — needs your attention':queue?.running?'AliExpress Archiver — working':'AliExpress Product Archiver');
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'Show software',click:showApp},
    {label:'Show Chromium / Login',click:()=>browser.open(undefined,{show:true}).catch(error=>{queue.message=error.message;send(queue.state());})},
    {label:'Hide Chromium',click:()=>hideBrowser().catch(error=>{queue.message=error.message;send(queue.state());})},
    {type:'separator'},
    {label:queue?.paused?'Resume queue':'Pause queue',enabled:!!queue?.running,click:()=>queue.paused?queue.resume():queue.pause()},
    {label:'Quit',click:()=>app.quit()}
  ]));
}
async function createTray(){
  try{
    let icon=await app.getFileIcon(process.execPath,{size:'small'});
    if(icon.isEmpty())icon=nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==');
    tray=new Tray(icon);tray.on('double-click',showApp);tray.on('click',showApp);refreshTray();
  }catch(error){console.error('Tray is unavailable:',error.message);}
}
app.whenReady().then(async()=>{
  await fs.mkdir(app.getPath('userData'),{recursive:true});
  statePath=path.join(app.getPath('userData'),'state.json');
  let initial={}; try {initial=JSON.parse(await fs.readFile(statePath,'utf8'));} catch(e) {if(e.code!=='ENOENT') console.error('State could not be read:',e.message);}
  settings={output:path.join(app.getPath('downloads'),'AliExpress Archives'),skipDuplicates:true,delayMs:2000,settleMs:3000,parallelTabs:3,backgroundBrowser:true,keepRunningInBackground:true,...initial.settings};
  browser=new Browser(app.getPath('userData'), message=>{queue.message=message; send(queue.state());});
  updater=new UpdateManager({appPath:app.getAppPath(),userData:app.getPath('userData'),onProgress:updateState});
  queue=new Queue({initial,save:persist,extract:async(...args)=>{
    const result=await browser.extract(...args);
    // Resize within a box while retaining the original aspect ratio.
    if(result.preview){const img=nativeImage.createFromDataURL(result.preview);result.preview=img.isEmpty()?null:thumbnail(img);}
    return result;
  }});
  queue.on('state',send);
  win=new BrowserWindow({width:1280,height:860,minWidth:380,minHeight:500,autoHideMenuBar:true,backgroundColor:'#f6f8f9',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.on('close',event=>{if(!quitting&&settings.keepRunningInBackground&&tray){event.preventDefault();win.hide();}});
  await createTray();
  await win.loadFile(path.join(__dirname,'index.html'));
  await markStartupHealthy();
  repairSavedPreviews().catch(error=>console.error('Saved previews could not be refreshed:',error.message));
}).catch(error=>{console.error('Application startup failed:',error);app.quit();});
function handle(name, fn) {ipcMain.handle(name, async(event,...args)=>{
  if(event.sender!==win?.webContents || event.senderFrame!==win.webContents.mainFrame) throw new Error('Untrusted caller');
  return fn(...args);
});}
handle('initial',async()=>({settings,state:{...queue.state(),browser:{open:!!browser.context,visible:!!browser.context&&!browser.hidden}},update:updater.info(),installation:await installationInfo()}));
handle('uninstall',async()=>{if(queue.running)throw new Error('Finish the current run before uninstalling.');if(uninstalling)throw new Error('The uninstaller is already starting.');uninstalling=true;try{const result=await launchUninstaller({beforeLaunch:async()=>{await queue.publish();await writes;await browser.close();}});quitting=true;setTimeout(()=>app.quit(),150);return result;}catch(error){uninstalling=false;throw error;}});
handle('folder',async()=>{const result=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory']}); if(!result.canceled) {settings.output=result.filePaths[0]; await queue.publish();} return settings;});
handle('settings',async value=>{
  if(queue.running) throw new Error('Pause does not end a run. Change settings after the run finishes.');
  settings.skipDuplicates=!!value.skipDuplicates;
  settings.backgroundBrowser=value.backgroundBrowser!==false;
  settings.keepRunningInBackground=value.keepRunningInBackground!==false;
  settings.delayMs=Math.max(500,Math.min(60000,Number(value.delayMs)||2000));
  settings.settleMs=Math.max(1000,Math.min(30000,Number(value.settleMs)||3000));
  settings.parallelTabs=Math.max(1,Math.min(4,Math.floor(Number(value.parallelTabs)||3)));
  queue.message='Settings saved.';await queue.publish(); return settings;
});
handle('add',async text=>{
  if(typeof text!=='string' || text.length>1000000) throw new Error('Paste up to 1 MB of URLs.');
  const results=await queue.add(text.split(/\r?\n/),settings.skipDuplicates);queue.message=`${results.filter(result=>result.status==='pending').length} links added · ${results.filter(result=>result.status==='duplicate').length} duplicates skipped.`;send();return results;
});
handle('run',async()=>{
  if(!settings.output) throw new Error('Select an output folder.');
  if(settings.backgroundBrowser&&browser.context&&!await browser.hide())throw new Error('Chromium could not be hidden. Try Hide Chromium again before starting.');
  fs.mkdir(settings.output,{recursive:true}).then(()=>queue.run({...settings})).catch(e=>{queue.message=e.message;send(queue.state());});
});
handle('pause',()=>queue.pause()); handle('resume',()=>queue.resume());
handle('continue',()=>queue.continue()); handle('retry',()=>queue.retry());
handle('retry-failed',ids=>queue.retry(ids));
handle('copy-failed',ids=>{
  const records=queue.failureItems(ids);if(!records.length)return 0;
  clipboard.writeText(records.map(item=>item.url).join('\n'));return records.length;
});
handle('export-failed',async ids=>{
  const records=queue.failureItems(ids);if(!records.length)return false;
  const result=await dialog.showSaveDialog(win,{title:'Export failed links',defaultPath:path.join(settings.output,'failed-links.txt'),filters:[{name:'Text file',extensions:['txt']}],properties:['showOverwriteConfirmation','createDirectory']});
  if(result.canceled||!result.filePath)return false;
  if(path.extname(result.filePath).toLowerCase()!=='.txt')throw new Error('Choose a .txt file for failed links.');
  await fs.writeFile(result.filePath,records.map(item=>item.url).join('\n')+'\n','utf8');return true;
});
handle('delete-failed',async ids=>{
  const records=queue.failureItems(ids);if(!records.length)return false;
  const selected=records.map(item=>item.id);
  const {response}=await dialog.showMessageBox(win,{type:'warning',title:'Remove failed links',message:records.length===1?'Remove this failed link?':`Remove ${records.length} failed links?`,detail:'Only the selected failed-link records will be removed. Downloads, exported ZIP files, queued/running products, settings and browser login will be kept.',buttons:['Cancel','Remove failed links'],defaultId:0,cancelId:0,noLink:true});
  if(response!==1)return false;
  await queue.removeFailures(selected);return true;
});
handle('browser',async()=>{await browser.open(undefined,{show:true});queue.message='Chromium is open. Sign in or finish verification, then Continue or run your links.';send(queue.state());});
async function hideBrowser(){
  const hidden=await browser.hide();showApp();
  if(browser.context&&!hidden)throw new Error('Chromium could not be hidden. Your software is still open. Try again.');
  queue.message='Chromium is hidden. Your software stays open and processing continues.';send(queue.state());
}
handle('hide-browser',hideBrowser);
handle('hide-app',()=>{if(!tray)throw new Error('The system tray is unavailable. Minimize the software instead.');win.hide();});
handle('update-check',()=>updater.check());
handle('update-download',()=>updater.download());
handle('update-restart',async()=>{
  if(queue.running)throw new Error('Finish the current run before restarting to apply an update.');
  if(!updater.info().canRestart)throw new Error('No downloaded update is ready.');
  await writes;await browser.close();app.relaunch({exePath:process.env.PORTABLE_EXECUTABLE_FILE||process.execPath});app.quit();
});
handle('show',async target=>{const record=typeof target==='string'?queue.downloads.find(download=>download.path===target):queue.downloads[target];if(!record)throw new Error('Unknown download');await fs.access(record.path);shell.showItemInFolder(record.path);});
async function deleteRecords(archivePath = null,{downloadsOnly=false} = {}) {
  if(queue.running&&!downloadsOnly)throw new Error('Wait for the run to finish before deleting records.');
  const record=archivePath===null?null:queue.downloads.find(d=>d.path===archivePath);
  if(archivePath!==null&&!record)throw new Error('Unknown download');
  if(!record&&!(downloadsOnly?queue.downloads.length:queue.items.length+queue.downloads.length))return false;
  const {response}=await dialog.showMessageBox(win,{type:'warning',title:'Delete records',message:record?'Delete this record?':downloadsOnly?'Clear Downloads history?':'Delete all records?',detail:record?`${record.title||record.productId}\n\nThe exported ZIP file will be kept. Your settings and browser login will be kept.`:downloadsOnly?`Remove ${queue.downloads.length} download records and completed queue history.\n\nFailed Links, exported ZIP files, queued/running products, settings and browser login will be kept.`:`Remove ${queue.items.length} queue records and ${queue.downloads.length} download records from this app.\n\nExported ZIP files, settings and browser login will be kept.`,buttons:['Cancel',record?'Delete record':downloadsOnly?'Clear Downloads':'Delete all records'],defaultId:0,cancelId:0,noLink:true});
  if(response!==1)return false;
  await queue.deleteRecords(archivePath,{downloadsOnly});return true;
}
handle('delete-record',archivePath=>{if(typeof archivePath!=='string')throw new Error('Unknown download');return deleteRecords(archivePath,{downloadsOnly:true});});
handle('clear-downloads',()=>deleteRecords(null,{downloadsOnly:true}));
handle('clear-records',()=>deleteRecords());
handle('clear',()=>queue.clearFinished());
app.on('window-all-closed',()=>{if(!tray||!settings?.keepRunningInBackground)app.quit();});
app.on('before-quit',()=>{quitting=true;browser?.close().catch(()=>{});});
