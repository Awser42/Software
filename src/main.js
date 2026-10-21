const {app, BrowserWindow, ipcMain, dialog, shell, nativeImage} = require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {Queue}=require('./queue');
const {Browser}=require('./browser');
let win, queue, browser, settings, statePath;
if(!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
let writes=Promise.resolve();
function persist(state) {
  const text=JSON.stringify({settings,...state});
  writes=writes.catch(()=>{}).then(async()=>{await fs.writeFile(statePath+'.tmp',text); await fs.rename(statePath+'.tmp',statePath);});
  return writes;
}
function send(state) {if(win && !win.isDestroyed()) win.webContents.send('state',state);}
app.whenReady().then(async()=>{
  await fs.mkdir(app.getPath('userData'),{recursive:true});
  statePath=path.join(app.getPath('userData'),'state.json');
  let initial={}; try {initial=JSON.parse(await fs.readFile(statePath,'utf8'));} catch(e) {if(e.code!=='ENOENT') console.error('State could not be read:',e.message);}
  settings={output:path.join(app.getPath('downloads'),'AliExpress Archives'),skipDuplicates:true,delayMs:2000,settleMs:3000,...initial.settings};
  browser=new Browser(app.getPath('userData'), message=>{queue.message=message; send(queue.state());});
  queue=new Queue({initial,save:persist,extract:async(...args)=>{
    const result=await browser.extract(...args);
    if(result.preview){const img=nativeImage.createFromDataURL(result.preview);result.preview=img.isEmpty()?null:img.resize({width:360,height:240,quality:'good'}).toDataURL();}
    return result;
  }});
  queue.on('state',send);
  win=new BrowserWindow({width:1200,height:850,minWidth:900,minHeight:650,backgroundColor:'#0d1422',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  await win.loadFile(path.join(__dirname,'index.html'));
});
function handle(name, fn) {ipcMain.handle(name, async(event,...args)=>{
  if(event.sender!==win?.webContents || event.senderFrame!==win.webContents.mainFrame) throw new Error('Untrusted caller');
  return fn(...args);
});}
handle('initial',()=>({settings,state:queue.state()}));
handle('folder',async()=>{const result=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory']}); if(!result.canceled) {settings.output=result.filePaths[0]; await queue.publish();} return settings;});
handle('settings',async value=>{
  if(queue.running) throw new Error('Pause does not end a run. Change settings after the run finishes.');
  settings.skipDuplicates=!!value.skipDuplicates;
  settings.delayMs=Math.max(500,Math.min(60000,Number(value.delayMs)||2000));
  settings.settleMs=Math.max(1000,Math.min(30000,Number(value.settleMs)||3000));
  await queue.publish(); return settings;
});
handle('add',async text=>{
  if(typeof text!=='string' || text.length>1000000) throw new Error('Paste up to 1 MB of URLs.');
  return queue.add(text.split(/\r?\n/),settings.skipDuplicates);
});
handle('run',async()=>{if(!settings.output) throw new Error('Select an output folder.'); fs.mkdir(settings.output,{recursive:true}).then(()=>queue.run({...settings})).catch(e=>{queue.message=e.message;send(queue.state());});});
handle('pause',()=>queue.pause()); handle('resume',()=>queue.resume());
handle('continue',()=>queue.continue()); handle('retry',()=>queue.retry());
handle('browser',async()=>{await browser.open();queue.message='Chromium is open. Sign in there, then run your links.';send(queue.state());});
handle('show',async index=>{const record=queue.downloads[index]; if(!record) throw new Error('Unknown download'); await fs.access(record.path);shell.showItemInFolder(record.path);});
handle('clear',async()=>{if(queue.running) throw new Error('Wait for the run to finish.'); queue.items=queue.items.filter(i=>!['done','failed'].includes(i.status));await queue.publish();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{browser?.close().catch(()=>{});});
