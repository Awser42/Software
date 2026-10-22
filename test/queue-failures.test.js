const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Queue}=require('../src/queue');
const failed=(id,productId=id)=>({id,productId,url:`https://www.aliexpress.com/item/${productId}.html`,status:'failed',attempts:1,error:'Navigation failed'});
const result=item=>({productId:item.productId,title:item.productId,path:`${item.productId}.zip`,warnings:[]});

test('failed products automatically persist separately while other workers finish',async()=>{
  let saved;const queue=new Queue({save:async state=>{saved=structuredClone(state);},extract:async item=>{if(item.productId==='2')throw new Error('Product unavailable');return result(item);}});
  await queue.add(['1','2','3'].map(id=>`https://www.aliexpress.com/item/${id}.html`));await queue.run({parallelTabs:3});
  assert.equal(queue.downloads.length,2);assert.equal(queue.failureItems().length,1);assert.equal(queue.failureItems()[0].error,'Product unavailable');assert(Number.isFinite(Date.parse(queue.failureItems()[0].failedAt)));
  const restored=new Queue({initial:saved});assert.deepEqual(restored.failureItems(),queue.failureItems());
  await restored.clearFinished();assert.equal(restored.items.length,1);assert.equal(restored.failureItems().length,1);
});

test('selected retry keeps other failures intact and a successful retry leaves Failed Links',async()=>{
  const seen=[];const queue=new Queue({initial:{items:[failed('1'),failed('2')]},extract:async item=>{seen.push(item.id);return result(item);}});
  assert.deepEqual(await queue.retry(['1']),['1']);assert.equal(queue.items[0].error,null);assert.deepEqual(queue.failureItems().map(item=>item.id),['2']);
  await queue.run({parallelTabs:3});assert.deepEqual(seen,['1']);assert.equal(queue.items[0].attempts,2);assert.equal(queue.items[0].status,'done');assert.equal(queue.failureItems()[0].error,'Navigation failed');
});

test('a failed retry returns to Failed Links with an updated reason and attempt count',async()=>{
  const queue=new Queue({initial:{items:[failed('1')]},extract:async()=>{throw new Error('Still unavailable');}});
  await queue.retry();await queue.run({});assert.equal(queue.failureItems()[0].error,'Still unavailable');assert.equal(queue.failureItems()[0].attempts,2);
});

test('Downloads clearing and record deletion preserve failed links including the same product',async()=>{
  const queue=new Queue({initial:{items:[failed('failure','1'),{id:'saved',productId:'1',status:'done'},{id:'next',status:'pending'}],downloads:[{productId:'1',path:'saved.zip'}]}});
  await queue.deleteRecords('saved.zip',{downloadsOnly:true});assert.deepEqual(queue.items.map(item=>item.id),['failure','next']);
  queue.downloads=[{productId:'1',path:'other.zip'}];await queue.deleteRecords(null,{downloadsOnly:true});assert.deepEqual(queue.items.map(item=>item.id),['failure','next']);assert.equal(queue.failureItems().length,1);
});

test('failure removal preserves active entries and downloads during a run',async()=>{
  const active={id:'active',status:'running'},pending={id:'next',status:'pending'};
  const queue=new Queue({initial:{items:[failed('1'),failed('2'),active,pending],downloads:[{path:'saved.zip'}]}});queue.items[2].status='running';queue.running=true;
  assert.equal(await queue.removeFailures(['1']),1);assert.deepEqual(queue.items.map(item=>item.id),['2','active','next']);assert.deepEqual(queue.downloads,[{path:'saved.zip'}]);
  await assert.rejects(queue.removeFailures(['active']),/no longer/);await assert.rejects(queue.retry(['2']),/Wait for the run/);
});

test('failure selections reject unknown or malformed IDs and never delete a retried product',async()=>{
  const queue=new Queue({initial:{items:[failed('1'),failed('2')]}});
  for(const value of ['1',[1],['unknown']])assert.throws(()=>queue.failureItems(value),/Invalid|no longer/);
  assert.equal(queue.failureItems(['1','1']).length,1);await queue.retry(['1']);
  await assert.rejects(queue.removeFailures(['1']),/no longer/);assert.equal(queue.items[0].status,'pending');
  await assert.rejects(queue.retry(['2','unknown']),/no longer/);assert.equal(queue.failureItems().length,1);
});

test('failed retry/removal persistence restores the original records',async()=>{
  const initial={items:[failed('1'),failed('2')]},queue=new Queue({initial,save:async()=>{throw new Error('Disk full');}});
  await assert.rejects(queue.retry(['1']),/Disk full/);assert.deepEqual(queue.items,initial.items);
  await assert.rejects(queue.removeFailures(),/Disk full/);assert.deepEqual(queue.items,initial.items);
});

test('retry refuses an already queued copy of the same product',async()=>{
  const queue=new Queue({initial:{items:[failed('1'),{id:'duplicate',productId:'1',status:'pending'}]}});
  await assert.rejects(queue.retry(),/already queued/);assert.equal(queue.failureItems().length,1);
});
