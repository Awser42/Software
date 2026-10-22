const {contextBridge,ipcRenderer}=require('electron');
const names=['initial','uninstall','folder','settings','add','run','pause','resume','continue','retry','browser','hide-browser','hide-app','show','clear','delete-record','clear-records','clear-downloads','update-check','update-download','update-restart'];
contextBridge.exposeInMainWorld('desktop',{
  call:(name,arg)=>{if(!names.includes(name)) throw new Error('Unsupported action');return ipcRenderer.invoke(name,arg);},
  onState:callback=>ipcRenderer.on('state',(_event,state)=>callback(state)),
  onUpdate:callback=>ipcRenderer.on('update-state',(_event,state)=>callback(state))
});
