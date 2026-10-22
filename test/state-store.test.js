const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {StateStore,parseState}=require('../src/state-store');
async function fixture(run){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'state-store-'));try{await run(new StateStore(path.join(directory,'state.json')),directory);}finally{await fs.rm(directory,{recursive:true,force:true});}}
test('state parsing accepts legacy records but rejects malformed containers before use',()=>{
  assert.deepEqual(parseState('{"items":[{"status":"failed"}],"settings":{}}'),{items:[{status:'failed'}],settings:{}});
  for(const text of ['{','null','[]','{"items":{}}','{"downloads":[null]}','{"settings":"wrong"}'])assert.throws(()=>parseState(text),{code:'STATE_INVALID'});
});
test('new profiles start empty and successful saves mirror the latest state including deletion',()=>fixture(async store=>{
  assert.deepEqual(await store.load(),{});await store.save({items:[{id:'one'}],downloads:[{path:'kept.zip'}],settings:{output:'exports'}});
  assert.deepEqual(JSON.parse(await fs.readFile(store.backup,'utf8')),await store.load());
  await store.save({items:[],downloads:[],settings:{output:'exports'}});assert.deepEqual(JSON.parse(await fs.readFile(store.backup,'utf8')),await store.load());assert.deepEqual((await store.load()).items,[]);
}));
test('corrupt primary history is preserved byte-for-byte and restored from its valid backup',()=>fixture(async(store,directory)=>{
  const saved={items:[{id:'failed',status:'failed'}],downloads:[{path:'untouched.zip'}]};await store.save(saved);await fs.writeFile(store.file,'{"items":');
  assert.deepEqual(await store.load(),saved);assert.match(store.warning,/recovered/);const corrupt=(await fs.readdir(directory)).filter(name=>name.includes('.corrupt-'));assert.equal(corrupt.length,1);assert.equal(await fs.readFile(path.join(directory,corrupt[0]),'utf8'),'{"items":');assert.deepEqual(JSON.parse(await fs.readFile(store.file,'utf8')),saved);
}));
test('a missing primary is recovered from the backup instead of silently losing history',()=>fixture(async store=>{await store.save({items:[{id:'retained'}]});await fs.rm(store.file);assert.deepEqual(await store.load(),{items:[{id:'retained'}]});assert.match(store.warning,/recovered/);}));
test('unrecoverable corruption never becomes an empty writable history',()=>fixture(async store=>{
  await fs.writeFile(store.file,'broken primary');await fs.writeFile(store.backup,'broken backup');await assert.rejects(store.load(),/could not be recovered/);assert.equal(await fs.readFile(store.file,'utf8'),'broken primary');assert.equal(await fs.readFile(store.backup,'utf8'),'broken backup');
}));
test('serialized saves snapshot their input before asynchronous writes and leave no temporary files',()=>fixture(async(store,directory)=>{
  const state={items:[{id:'first'}]};const first=store.save(state);state.items[0].id='changed after save';const second=store.save({items:[{id:'last'}]});await first;await second;assert.deepEqual(await store.load(),{items:[{id:'last'}]});assert.deepEqual(JSON.parse(await fs.readFile(store.backup,'utf8')),{items:[{id:'last'}]});assert.deepEqual((await fs.readdir(directory)).sort(),['state.json','state.json.backup']);
}));
test('a failed replacement preserves the original target and cleans its temporary file',()=>fixture(async(store,directory)=>{
  await fs.mkdir(store.file);await assert.rejects(store.save({items:[]}));assert.equal((await fs.stat(store.file)).isDirectory(),true);assert.deepEqual(await fs.readdir(directory),['state.json']);await fs.rm(store.file,{recursive:true});await store.save({items:[]});assert.deepEqual(await store.load(),{items:[]});
}));
