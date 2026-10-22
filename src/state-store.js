const fs=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
function parseState(text){
  let state;try{state=JSON.parse(text);}catch{throw Object.assign(new Error('Saved history is not valid JSON.'),{code:'STATE_INVALID'});}
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  if(!object(state)||state.settings!==undefined&&!object(state.settings)||['items','downloads'].some(key=>state[key]!==undefined&&(!Array.isArray(state[key])||state[key].some(item=>!object(item)))))throw Object.assign(new Error('Saved history has an invalid structure.'),{code:'STATE_INVALID'});
  return state;
}
async function replaceFile(file,text){
  const temporary=file+'.'+randomUUID()+'.tmp';let handle;
  try{
    handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(text,'utf8');await handle.sync();await handle.close();handle=null;
    for(let attempt=0;;attempt++)try{await fs.rename(temporary,file);break;}catch(error){if(!['EACCES','EPERM','EBUSY','EEXIST'].includes(error.code)||attempt>=4)throw error;await new Promise(resolve=>setTimeout(resolve,50*(attempt+1)));}
  }finally{if(handle)await handle.close().catch(()=>{});await fs.rm(temporary,{force:true}).catch(()=>{});}
}
class StateStore {
  constructor(file){this.file=file;this.backup=file+'.backup';this.pending=Promise.resolve();this.warning='';}
  async load(){
    let failed;
    try{const text=await fs.readFile(this.file,'utf8'),state=parseState(text);try{await replaceFile(this.backup,text);}catch(error){console.error('History backup could not be refreshed:',error.message);}return state;}catch(error){if(!['ENOENT','STATE_INVALID'].includes(error.code))throw error;failed=error;}
    let text;
    try{text=await fs.readFile(this.backup,'utf8');parseState(text);}catch(error){if(failed.code==='ENOENT'&&error.code==='ENOENT')return {};throw new Error(`Saved history could not be recovered. Original files have been kept at ${this.file}. Restore a valid backup before reopening the software.`,{cause:failed});}
    if(failed.code!=='ENOENT')await fs.copyFile(this.file,this.file+'.corrupt-'+randomUUID()+'.json',require('node:fs').constants.COPYFILE_EXCL);
    await replaceFile(this.file,text);this.warning='Saved history was recovered from a local backup. Exported ZIP files were not changed.';
    return parseState(text);
  }
  save(state){
    const text=JSON.stringify(state);parseState(text);
    this.pending=this.pending.catch(()=>{}).then(async()=>{
      await replaceFile(this.file,text);
      // The backup mirrors the latest successful state, including deletions.
      // A backup failure must not report an already-committed primary as lost.
      try{await replaceFile(this.backup,text);}catch(error){console.error('History backup could not be refreshed:',error.message);}
    });
    return this.pending;
  }
}
module.exports={StateStore,parseState};
