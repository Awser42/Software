const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
async function bundle(){
 const root=path.resolve(__dirname,'../build-resources/chromium');
 await fs.mkdir(root,{recursive:true});
 const cli=path.join(path.dirname(require.resolve('playwright/package.json')),'cli.js');
 const result=spawnSync(process.execPath,[cli,'install','chromium','--no-shell'],{stdio:'inherit',env:{...process.env,PLAYWRIGHT_HOST_PLATFORM_OVERRIDE:'win64',PLAYWRIGHT_BROWSERS_PATH:root}});
 if(result.error)throw result.error;if(result.status!==0)throw new Error(`Chromium download failed (${result.status})`);
 const candidates=(await fs.readdir(root)).filter(name=>/^chromium-\d+$/.test(name)).sort();
 const registry=JSON.parse(await fs.readFile(path.join(path.dirname(require.resolve('playwright-core/package.json')),'browsers.json'),'utf8'));
 const pinned=registry.browsers.find(b=>b.name==='chromium');
 const folder=`chromium-${pinned.revision}`;
 if(!candidates.includes(folder))throw new Error('Matching Chromium revision not found');
 const executable=`${folder}/chrome-win64/chrome.exe`;
 const bytes=await fs.readFile(path.join(root,executable));
 if(bytes[0]!==0x4d||bytes[1]!==0x5a)throw new Error('Downloaded Chromium is not a Windows executable');
 const manifest={playwrightVersion:require('playwright/package.json').version,browserVersion:pinned.browserVersion,executable,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),interfaceLanguage:'en-US'};
 await fs.writeFile(path.join(root,'bundle.json'),JSON.stringify(manifest,null,2));
 // Keep the original verified download intact; trim only a separate release copy.
 const compact=path.resolve(__dirname,'../build-resources/chromium-compact');
 await fs.rm(compact,{recursive:true,force:true});await fs.mkdir(compact,{recursive:true});
 await fs.cp(path.join(root,folder),path.join(compact,folder),{recursive:true,filter:source=>{
  const parts=path.relative(root,source).split(path.sep),name=parts.at(-1);
  return !(parts.includes('locales')&&name.endsWith('.pak')&&!/^en-US(?:_|\.)/.test(name));
 }});
 await fs.access(path.join(compact,folder,'chrome-win64/locales/en-US.pak'));
 await fs.writeFile(path.join(compact,'bundle.json'),JSON.stringify(manifest,null,2));
 console.log(`Compact Windows Chromium ${pinned.browserVersion} at ${compact}; original download retained.`);
}
bundle().catch(e=>{console.error(e);process.exitCode=1;});
