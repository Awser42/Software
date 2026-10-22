const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {Queue}=require('../src/queue');

test('delete all records persists an empty history and keeps exported and unrelated files',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'archiver-records-'));
  try {
    const file=path.join(directory,'saved.zip');await fs.writeFile(file,'existing export');
    await fs.writeFile(path.join(directory,'other.txt'),'unrelated');
    let saved;
    const queue=new Queue({extract:async()=>{},save:async value=>{saved=JSON.parse(JSON.stringify(value));},initial:{items:[{productId:'1',status:'done'},{productId:'2',status:'failed'},{productId:'3',status:'pending'}],downloads:[{productId:'1',path:file}]}});
    queue.paused=true;await queue.deleteRecords();
    assert.deepEqual(saved,{items:[],downloads:[]});assert.equal(queue.paused,false);
    assert.equal(await fs.readFile(file,'utf8'),'existing export');
    assert.equal(await fs.readFile(path.join(directory,'other.txt'),'utf8'),'unrelated');
    const restored=new Queue({extract:async()=>{},initial:saved});
    assert.equal((await restored.add(['https://www.aliexpress.com/item/1.html']))[0].status,'pending');
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});

test('delete one archive record preserves other captures and pending queue entries',async()=>{
  const queue=new Queue({extract:async()=>{},initial:{downloads:[{productId:'1',path:'first.zip'},{productId:'1',path:'second.zip'},{productId:'2',path:'other.zip'}],items:[{productId:'1',status:'done'},{productId:'1',status:'pending'},{productId:'2',status:'done'}]}});
  await queue.deleteRecords('first.zip');assert.equal(queue.downloads.length,2);assert.equal(queue.items.length,3);
  await queue.deleteRecords('second.zip');assert.deepEqual(queue.downloads.map(d=>d.path),['other.zip']);
  assert.deepEqual(queue.items,[{productId:'1',status:'pending'},{productId:'2',status:'done'}]);
  await assert.rejects(queue.deleteRecords('missing.zip'),/Unknown download/);
});

test('record deletion is refused during a run, including a paused run',async()=>{
  const queue=new Queue({extract:async()=>{},initial:{downloads:[{path:'saved.zip'}],items:[{status:'pending'}]}});
  queue.running=true;queue.paused=true;
  await assert.rejects(queue.deleteRecords(),/Wait for the run to finish/);
  await assert.rejects(queue.deleteRecords('saved.zip'),/Wait for the run to finish/);
  assert.equal(queue.downloads.length,1);assert.equal(queue.items.length,1);
});

test('failed persistence restores the records instead of reporting a successful deletion',async()=>{
  const initial={downloads:[{productId:'1',path:'saved.zip'}],items:[{productId:'1',status:'done'}]};
  const queue=new Queue({extract:async()=>{},initial,save:async()=>{throw new Error('Disk full');}});
  await assert.rejects(queue.deleteRecords('saved.zip'),/Disk full/);
  assert.deepEqual(queue.downloads,initial.downloads);assert.deepEqual(queue.items,initial.items);
  await assert.rejects(queue.deleteRecords(),/Disk full/);
  assert.deepEqual(queue.downloads,initial.downloads);assert.deepEqual(queue.items,initial.items);
});
