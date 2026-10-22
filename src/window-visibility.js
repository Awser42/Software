const {spawn}=require('node:child_process');
const {windowWorkerScript}=require('./window-worker');
const controllers=new Map();
let processStarts=0,requests=0;
function validate(processId,action){
  if(!Number.isSafeInteger(processId)||processId<=0||processId===process.pid)throw new Error('Invalid Chromium process identity.');
  if(!['hide','show','inspect'].includes(action))throw new Error('Invalid Chromium window action.');
}
class WindowController{
  constructor(processId,{spawnProcess=spawn,timeoutMs=15000,idleTimeoutMs=60000}={}){
    validate(processId,'inspect');this.processId=processId;this.spawnProcess=spawnProcess;this.timeoutMs=timeoutMs;this.idleTimeoutMs=idleTimeoutMs;this.serial=Promise.resolve();this.sequence=0;this.closed=false;this.pending=new Map();this.buffer='';this.stderr='';
  }
  start(){
    if(this.starting)return this.starting;
    this.starting=new Promise((resolve,reject)=>{
      this.ready={resolve,reject};
      this.startTimer=setTimeout(()=>this.fail(new Error('Chromium window helper startup timed out.')),this.timeoutMs);
      try{
        const script=Buffer.from(windowWorkerScript(this.processId),'utf16le').toString('base64');
        this.child=this.spawnProcess('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});processStarts++;
        this.child.stdout.setEncoding('utf8');this.child.stderr.setEncoding('utf8');
        this.child.stdout.on('data',text=>this.read(text));this.child.stderr.on('data',text=>{this.stderr=(this.stderr+text).slice(-2000);});
        this.child.on('error',error=>this.fail(error));this.child.stdin.on('error',error=>this.fail(error));
        this.child.on('exit',()=>this.fail(new Error('Chromium window helper stopped.'+(this.stderr?' '+this.stderr.trim():''))));
      }catch(error){this.fail(error);}
    });return this.starting;
  }
  read(text){
    this.buffer+=text;if(this.buffer.length>65536){this.fail(new Error('Invalid window helper response.'));return;}
    while(this.buffer.includes('\n')){
      const end=this.buffer.indexOf('\n'),line=this.buffer.slice(0,end).trim().replace(/^\uFEFF/,'');this.buffer=this.buffer.slice(end+1);if(!line)continue;
      let message;try{message=JSON.parse(line);}catch{this.fail(new Error('Invalid window helper response.'));return;}
      if(message.ready&&this.ready){clearTimeout(this.startTimer);this.ready.resolve();this.ready=null;continue;}
      const pending=this.pending.get(message.id);if(!pending)continue;
      this.pending.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(new Error(message.error)):pending.resolve(message.state);
    }
  }
  request(action){
    validate(this.processId,action);
    const task=this.serial.catch(()=>{}).then(async()=>{
      clearTimeout(this.idleTimer);if(this.closed)throw new Error('Chromium window helper is closed.');await this.start();
      const id=++this.sequence;requests++;
      const state=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>this.fail(new Error('Chromium window helper response timed out.')),this.timeoutMs);
        this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,action})+'\n');
      });
      if(!state||!Number.isInteger(state.windows)||state.windows<1||typeof state.hidden!=='boolean')throw new Error('Chromium window state could not be verified.');
      if(action==='hide'&&!state.hidden)throw new Error('Chromium is still visible.');
      if(action==='show'&&state.visible<1)throw new Error('Chromium could not be restored.');
      this.idleTimer=setTimeout(()=>this.close(),this.idleTimeoutMs);this.idleTimer.unref?.();return state;
    });this.serial=task;return task;
  }
  fail(error){
    clearTimeout(this.startTimer);clearTimeout(this.idleTimer);this.ready?.reject(error);this.ready=null;
    for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}this.pending.clear();
    if(!this.closed){this.closed=true;this.child?.kill();}
  }
  close(){this.fail(new Error('Chromium window helper is closed.'));}
}
async function chromiumWindowVisibility(processId,action){
  validate(processId,action);let controller=controllers.get(processId);
  if(!controller||controller.closed){controller=new WindowController(processId);controllers.set(processId,controller);}
  try{return await controller.request(action);}catch(error){if(controllers.get(processId)===controller)controllers.delete(processId);controller.close();throw error;}
}
chromiumWindowVisibility.close=processId=>{const controller=controllers.get(processId);controllers.delete(processId);controller?.close();};
chromiumWindowVisibility.stats=()=>({processStarts,requests,activeControllers:[...controllers.values()].filter(controller=>!controller.closed).length});
module.exports={chromiumWindowVisibility,WindowController};
