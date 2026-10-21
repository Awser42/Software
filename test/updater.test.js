const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const archiver=require('archiver');
const {PassThrough}=require('node:stream');
const {UpdateManager,runtimeFor,validateManifest,selectStartup,markStartupHealthy,updatePaths,permittedDownload,RUNTIME_KEY}=require('../src/updater');
const {unzipCode,hash,crc32}=require('../src/update-zip');
const {loadCode}=require('../src/bootstrap');
const appPath=path.resolve(__dirname,'..');
const electronVersion=require('../package.json').devDependencies.electron;
function versions(){const runtime=runtimeFor(appPath,electronVersion);const [major,minor,patch]=runtime.baseVersion.split('.').map(Number);return {runtime,version:`${major}.${minor}.${patch+1}`};}
async function zipped(entries){const zip=archiver('zip',{zlib:{level:9}}),stream=new PassThrough(),chunks=[];stream.on('data',chunk=>chunks.push(chunk));const done=new Promise((resolve,reject)=>{stream.on('end',()=>resolve(Buffer.concat(chunks)));stream.on('error',reject);zip.on('error',reject);});zip.pipe(stream);for(const [name,bytes] of Object.entries(entries))zip.append(bytes,{name,mode:0o644});await zip.finalize();return done;}
async function fixture(){const {runtime,version}=versions();const entries={'src/main.js':Buffer.from("module.exports={helper:require('./helper'),playwright:require('playwright/package.json').version,resolved:require.resolve('playwright/package.json')};"),'src/helper.js':Buffer.from("module.exports='downloaded code';"),'src/preload.js':Buffer.from('// sandboxed preload'),'src/index.html':Buffer.from('<!doctype html><title>Updated</title>')};const bytes=await zipped(entries);const manifest={schema:1,version,runtime:{electron:runtime.electron,playwright:runtime.playwright,codeLine:runtime.codeLine},entry:'src/main.js',asset:`AliExpress-Product-Archiver-${version}-Code-update.zip`,bytes:bytes.length,sha256:hash(bytes),files:Object.entries(entries).map(([name,body])=>({path:name,bytes:body.length,sha256:hash(body)}))};return {runtime,version,bytes,manifest};}
async function temporary(run){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'archiver-update-'));try{return await run(directory);}finally{delete globalThis[RUNTIME_KEY];await fs.rm(directory,{recursive:true,force:true});}}
function manager(directory,data,mutateBytes){const calls=[];const instance=new UpdateManager({appPath,userData:directory,runtimeVersion:electronVersion,transport:async(url,options)=>{calls.push(url);if(url.endsWith('/update-manifest.json'))return Buffer.from(JSON.stringify(data.manifest));const bytes=mutateBytes?mutateBytes(data.bytes):data.bytes;options.onProgress?.(bytes.length,data.bytes.length);return bytes;}});return {instance,calls};}
test('small update downloads code once, resolves existing dependencies and becomes healthy after startup',async()=>temporary(async directory=>{
  const data=await fixture(),{instance,calls}=manager(directory,data);assert.equal((await instance.check()).status,'available');assert.equal((await instance.download()).status,'ready');assert.equal(calls.length,2);assert.ok(calls[1].endsWith('/'+data.manifest.asset));assert.ok(calls.every(url=>!url.includes('chromium')&&!url.includes('electron')));
  const startup=await selectStartup({appPath,userData:directory,runtimeVersion:electronVersion});assert.equal(startup.version,data.version);assert.ok(startup.directory);const loaded=loadCode(startup.directory,appPath);assert.equal(loaded.helper,'downloaded code');assert.equal(loaded.playwright,require('playwright/package.json').version);assert.equal(loaded.resolved,require.resolve('playwright/package.json'));
  globalThis[RUNTIME_KEY]=startup;await markStartupHealthy();const next=await selectStartup({appPath,userData:directory,runtimeVersion:electronVersion});assert.equal(next.version,data.version);assert.equal(next.pointer.pending,false);await assert.rejects(fs.access(updatePaths(directory).booting),{code:'ENOENT'});
}));
test('corrupt download is rejected without selecting any code for the next launch',async()=>temporary(async directory=>{
  const data=await fixture(),{instance}=manager(directory,data,bytes=>{const changed=Buffer.from(bytes);changed[40]^=1;return changed;});await instance.check();await assert.rejects(instance.download(),/SHA-256/);assert.equal(instance.info().status,'error');await assert.rejects(fs.access(updatePaths(directory).active),{code:'ENOENT'});assert.equal((await selectStartup({appPath,userData:directory,runtimeVersion:electronVersion})).version,data.runtime.baseVersion);
}));
test('different Chromium/runtime requirements reject the manifest before downloading app code',async()=>temporary(async directory=>{
  const data=await fixture();data.manifest.runtime.playwright='different';const {instance,calls}=manager(directory,data);await assert.rejects(instance.check(),/different browser or desktop runtime/);assert.equal(instance.info().status,'incompatible');assert.equal(calls.length,1);
}));
test('an update that did not finish starting rolls back on the next launch',async()=>temporary(async directory=>{
  const data=await fixture(),{instance}=manager(directory,data);await instance.check();await instance.download();const first=await selectStartup({appPath,userData:directory,runtimeVersion:electronVersion});assert.equal(first.version,data.version);const recovered=await selectStartup({appPath,userData:directory,runtimeVersion:electronVersion});assert.equal(recovered.version,data.runtime.baseVersion);assert.equal(recovered.directory,null);assert.match(recovered.rollbackReason,/did not finish starting/);
}));
test('installed code tampering is detected before any module executes',async()=>temporary(async directory=>{
  const data=await fixture(),{instance}=manager(directory,data);await instance.check();await instance.download();const pointer=JSON.parse(await fs.readFile(updatePaths(directory).active,'utf8'));await fs.writeFile(path.join(updatePaths(directory).root,pointer.current.directory,'src/main.js'),'throw new Error("tampered")');const startup=await selectStartup({appPath,userData:directory,runtimeVersion:electronVersion});assert.equal(startup.directory,null);assert.match(startup.rollbackReason,/integrity/);
}));
test('update manifests reject duplicate paths, traversal and oversized files',async()=>{
  const data=await fixture();for(const invalid of ['../outside.js','src/../../outside.js','src\\main.js','src/bootstrap.js','node_modules/anything.js','src/.hidden.js']){const manifest=structuredClone(data.manifest);manifest.files[0].path=invalid;assert.throws(()=>validateManifest(manifest,data.runtime),/Unapproved/);}
  const duplicate=structuredClone(data.manifest);duplicate.files.push(duplicate.files[0]);assert.throws(()=>validateManifest(duplicate,data.runtime),/Unapproved/);const oversized=structuredClone(data.manifest);oversized.files[0].bytes=2*1024*1024;assert.throws(()=>validateManifest(oversized,data.runtime),/Unapproved/);
});
test('ZIP reader refuses symlinks and files that differ from their individual hashes',async()=>{
  const data=await fixture();assert.equal(unzipCode(data.bytes,data.manifest.files).size,data.manifest.files.length);const symlink=Buffer.from(data.bytes);const directory=symlink.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));symlink.writeUInt32LE((0xa1ff*65536)>>>0,directory+38);assert.throws(()=>unzipCode(symlink,data.manifest.files),/Unapproved/);const wrong=structuredClone(data.manifest.files);wrong[0].sha256='0'.repeat(64);assert.throws(()=>unzipCode(data.bytes,wrong),/integrity/);
});
test('ZIP reader independently rejects a traversal entry even without manifest validation',()=>{
  const name=Buffer.from('src/../outside.js'),body=Buffer.from('x'),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);local.writeUInt32LE(0x04034b50);local.writeUInt32LE(crc32(body),14);local.writeUInt32LE(body.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(name.length,26);central.writeUInt32LE(0x02014b50);central.writeUInt32LE(crc32(body),16);central.writeUInt32LE(body.length,20);central.writeUInt32LE(body.length,24);central.writeUInt16LE(name.length,28);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(local.length+name.length+body.length,16);const bytes=Buffer.concat([local,name,body,central,name,end]);assert.throws(()=>unzipCode(bytes,[{path:name.toString(),bytes:body.length,sha256:hash(body)}]),/Unapproved/);
});
test('download redirects are confined to the fixed GitHub repository and release asset hosts',()=>{
  for(const url of ['http://github.com/Awser42/Software/releases/latest','https://github.com/other/repo/releases/latest','https://github.com.evil.example/Awser42/Software/releases/latest','file:///tmp/update.zip','https://user:pass@github.com/Awser42/Software/releases/latest'])assert.equal(permittedDownload(new URL(url)),false,url);
  assert.equal(permittedDownload(new URL('https://github.com/Awser42/Software/releases/latest/download/update-manifest.json')),true);assert.equal(permittedDownload(new URL('https://release-assets.githubusercontent.com/github-production-release-asset/file')),true);
});
