const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough,Writable}=require('node:stream');
const {WindowController}=require('../src/window-visibility');
function fixture({ready=true,malformed=false}={}){
  const actions=[];let starts=0,kills=0;
  const spawnProcess=()=>{
    starts++;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();let hidden=true;
    child.stdin=new Writable({write(chunk,encoding,done){const request=JSON.parse(chunk.toString());actions.push(request.action);if(request.action==='hide')hidden=true;if(request.action==='show')hidden=false;child.stdout.write(malformed?'invalid JSON\n':JSON.stringify({id:request.id,state:{windows:1,visible:hidden?0:1,minimized:0,hidden}})+'\n');done();}});
    child.kill=()=>{kills++;queueMicrotask(()=>child.emit('exit',0));};if(ready)queueMicrotask(()=>child.stdout.write('{"ready":true}\n'));return child;
  };return {spawnProcess,actions,starts:()=>starts,kills:()=>kills};
}
test('many concurrent visibility requests reuse one worker and preserve command order',async()=>{
  const f=fixture(),controller=new WindowController(9002,{spawnProcess:f.spawnProcess});
  const states=await Promise.all(['hide','inspect','show','hide','inspect'].map(action=>controller.request(action)));
  assert.equal(f.starts(),1);assert.deepEqual(f.actions,['hide','inspect','show','hide','inspect']);assert.deepEqual(states.map(s=>s.hidden),[true,true,false,true,true]);
  controller.close();assert.equal(f.kills(),1);
});
test('worker startup timeout closes the process instead of leaving a queued request hanging',async()=>{
  const f=fixture({ready:false}),controller=new WindowController(9002,{spawnProcess:f.spawnProcess,timeoutMs:20});
  await assert.rejects(controller.request('hide'),/startup timed out/);assert.equal(f.kills(),1);assert.equal(controller.closed,true);
});
test('malformed worker output rejects the command and shuts down the worker',async()=>{
  const f=fixture({malformed:true}),controller=new WindowController(9002,{spawnProcess:f.spawnProcess});
  await assert.rejects(controller.request('hide'),/Invalid window helper response/);assert.equal(f.kills(),1);
});
test('visibility worker rejects software process IDs and invalid commands before spawning',()=>{
  assert.throws(()=>new WindowController(process.pid),/identity/);const f=fixture(),controller=new WindowController(9002,{spawnProcess:f.spawnProcess});
  assert.throws(()=>controller.request('run-code'),/action/);assert.equal(f.starts(),0);
});
test('an idle visibility helper exits to release memory without changing the browser session',async()=>{
  const f=fixture(),controller=new WindowController(9002,{spawnProcess:f.spawnProcess,idleTimeoutMs:20});
  await controller.request('hide');await new Promise(resolve=>setTimeout(resolve,35));assert.equal(f.kills(),1);assert.equal(controller.closed,true);
});
