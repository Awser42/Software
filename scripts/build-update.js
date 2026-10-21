// Produce a code-only update, compatible with the installed Electron and
// Playwright versions. Chromium and node_modules never enter this archive.
const fs=require('node:fs/promises');
const nodefs=require('node:fs');
const path=require('node:path');
const archiver=require('archiver');
const {codePath,hash,MAX_ZIP_BYTES,MAX_FILE_BYTES,MAX_FILES}=require('../src/update-zip');
const {validateManifest,runtimeFor}=require('../src/updater');
async function buildUpdate(root=path.resolve(__dirname,'..'),output=path.join(root,'dist'),{version}={}){
  const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));version ||= pkg.version;const runtime=runtimeFor(root,pkg.devDependencies.electron);await fs.mkdir(output,{recursive:true});
  const files=[];
  async function walk(directory){for(const item of await fs.readdir(path.join(root,directory),{withFileTypes:true})){const relative=directory+'/'+item.name;if(item.isSymbolicLink())throw new Error('Source links cannot enter a code update.');if(item.isDirectory())await walk(relative);else if(relative!=='src/bootstrap.js'){if(!codePath(relative))throw new Error('Unsupported code update source: '+relative);const bytes=await fs.readFile(path.join(root,relative));if(bytes.length>MAX_FILE_BYTES)throw new Error('Code file exceeds update limit.');files.push({path:relative,bytes:bytes.length,sha256:hash(bytes)});}}}
  await walk('src');files.sort((a,b)=>a.path.localeCompare(b.path));if(files.length>MAX_FILES)throw new Error('Too many code update files.');
  const asset=`AliExpress-Product-Archiver-${version}-Code-update.zip`,destination=path.join(output,asset),temporary=destination+'.partial';await fs.rm(temporary,{force:true});
  try{await new Promise((resolve,reject)=>{const target=nodefs.createWriteStream(temporary,{flags:'wx'});const zip=archiver('zip',{zlib:{level:9}});target.on('close',resolve);target.on('error',reject);zip.on('error',reject);zip.on('warning',reject);zip.pipe(target);for(const file of files)zip.file(path.join(root,file.path),{name:file.path,mode:0o644,date:new Date('2000-01-01T00:00:00Z')});zip.finalize().catch(reject);});const bytes=await fs.readFile(temporary);if(bytes.length>MAX_ZIP_BYTES)throw new Error('Code update exceeds its download limit.');const manifest={schema:1,version,runtime:{electron:runtime.electron,playwright:runtime.playwright,codeLine:runtime.codeLine},entry:'src/main.js',asset,bytes:bytes.length,sha256:hash(bytes),files};validateManifest(manifest,runtime);await fs.rename(temporary,destination);await fs.writeFile(path.join(output,'update-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(`Code-only update: ${asset} (${bytes.length} bytes); Chromium and Electron excluded.`);return {manifest,path:destination};}finally{await fs.rm(temporary,{force:true});}
}
if(require.main===module)buildUpdate().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={buildUpdate};
