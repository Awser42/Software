const {contextBridge,ipcRenderer}=require('electron');
const names=['initial','folder','settings','add','run','pause','resume','continue','retry','browser','show','clear'];
contextBridge.exposeInMainWorld('desktop',{
  call:(name,arg)=>{if(!names.includes(name)) throw new Error('Unsupported action');return ipcRenderer.invoke(name,arg);},
  onState:callback=>ipcRenderer.on('state',(_event,state)=>callback(state))
});
