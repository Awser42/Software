const fs=require('node:fs/promises');
const path=require('node:path');
async function bundledChromium(resourcesPath,platform=process.platform){
 if(platform!=='win32')return null;
 const roots=[resourcesPath&&path.join(resourcesPath,'chromium'),path.resolve(__dirname,'../build-resources/chromium')].filter(Boolean);
 for(const root of roots){
  let manifest;
  try {manifest=JSON.parse(await fs.readFile(path.join(root,'bundle.json'),'utf8'));}
  catch(e){if(e.code==='ENOENT')continue;throw new Error(`Invalid bundled Chromium manifest: ${e.message}`);}
  if(manifest.playwrightVersion!==require('playwright/package.json').version)throw new Error('Bundled Chromium version does not match Playwright. Rebuild the Windows release.');
  const exe=path.resolve(root,manifest.executable);
  if(!exe.startsWith(path.resolve(root)+path.sep)||!exe.endsWith('chrome.exe'))throw new Error('Invalid bundled Chromium executable path');
  await fs.access(exe);return exe;
 }
 return null;
}
module.exports={bundledChromium};
