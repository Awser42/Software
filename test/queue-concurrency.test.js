const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Queue}=require('../src/queue');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let n=0;n<100;n++){if(check())return;await sleep(10);}throw new Error('Queue did not reach expected state');}
const result=item=>({productId:item.productId,title:item.productId,path:`${item.productId}.zip`,warnings:[]});

test('bounded parallel workers claim each product once and isolate failures',async()=>{
  const seen=[],active=new Set();let peak=0;
  const queue=new Queue({extract:async item=>{
    assert(!active.has(item.id));active.add(item.id);seen.push(item.productId);peak=Math.max(peak,active.size);
    await sleep(20);active.delete(item.id);if(item.productId==='4')throw new Error('Only product 4 failed');return result(item);
  }});
  await queue.add(Array.from({length:10},(_,i)=>`https://www.aliexpress.com/item/${i+1}.html`));
  await queue.run({parallelTabs:3});assert.equal(peak,3);assert.equal(new Set(seen).size,10);assert.equal(seen.length,10);
  assert.equal(queue.downloads.length,9);assert.equal(queue.items.find(i=>i.productId==='4').status,'failed');assert.equal(queue.running,false);
});

test('one Continue resumes multiple verification tabs and pause still holds all workers',async()=>{
  let completed=0;
  const queue=new Queue({extract:async(item,settings,q)=>{await q.manual(`Verify ${item.productId}`,item);await q.checkpoint();completed++;return result(item);}});
  await queue.add(['https://www.aliexpress.com/item/1.html','https://www.aliexpress.com/item/2.html']);
  const run=queue.run({parallelTabs:2});await until(()=>queue.manualRequests.size===2);
  assert.equal(queue.state().waitingCount,2);assert.equal(queue.state().activeTabs,2);
  await queue.pause();await queue.continue();await sleep(150);assert.equal(completed,0);
  assert.equal(queue.verificationEpoch,1);await queue.resume();await run;assert.equal(completed,2);assert.equal(queue.waiting,null);
});

test('Downloads clearing during a run keeps active/pending products and later completions',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const queue=new Queue({initial:{downloads:[{path:'old.zip',productId:'8'}],items:[{id:'old',status:'done',productId:'8'}]},extract:async item=>{await gate;return result(item);}});
  await queue.add(['https://www.aliexpress.com/item/1.html','https://www.aliexpress.com/item/2.html']);
  const run=queue.run({parallelTabs:1});await until(()=>queue.items.some(i=>i.status==='running'));
  await queue.deleteRecords(null,{downloadsOnly:true});assert.deepEqual(queue.items.map(i=>i.status),['running','pending']);assert.deepEqual(queue.downloads,[]);
  await assert.rejects(queue.deleteRecords(),/Wait for the run/);release();await run;assert.equal(queue.downloads.length,2);
});

for(const failAt of [1,2])test(`persistence failure at run checkpoint ${failAt} releases the run and leaves unstarted work retryable`,async()=>{
  let saves=0,extractions=0;
  const queue=new Queue({initial:{items:[{id:'one',productId:'1',status:'pending',attempts:0,error:null}]},save:async()=>{if(++saves===failAt)throw new Error('Disk full');},extract:async item=>{extractions++;return result(item);}});
  await assert.rejects(queue.run({}),/Disk full/);assert.equal(queue.running,false);assert.equal(queue.items[0].status,'pending');assert.equal(queue.items[0].attempts,0);assert.equal(extractions,0);
  await queue.run({});assert.equal(queue.items[0].status,'done');assert.equal(extractions,1);
});
