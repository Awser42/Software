const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {bundledChromium}=require('../src/browser-path');
test('Windows resolves shipped Chromium without a download',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'bundle-test-'));
 try {const root=path.join(temp,'chromium');await fs.mkdir(root);await fs.writeFile(path.join(root,'chrome.exe'),'MZfixture');await fs.writeFile(path.join(root,'bundle.json'),JSON.stringify({playwrightVersion:require('playwright/package.json').version,executable:'chrome.exe'}));assert.equal(await bundledChromium(temp,'win32'),path.join(root,'chrome.exe'));assert.equal(await bundledChromium(temp,'linux'),null);}finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('rejects mismatched browser versions and paths outside the bundle',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'bundle-test-'));
 try {const root=path.join(temp,'chromium');await fs.mkdir(root);const manifest={playwrightVersion:'wrong',executable:'chrome.exe'};await fs.writeFile(path.join(root,'bundle.json'),JSON.stringify(manifest));await assert.rejects(bundledChromium(temp,'win32'),/does not match/);manifest.playwrightVersion=require('playwright/package.json').version;manifest.executable='../outside/chrome.exe';await fs.writeFile(path.join(root,'bundle.json'),JSON.stringify(manifest));await assert.rejects(bundledChromium(temp,'win32'),/Invalid bundled/);}finally{await fs.rm(temp,{recursive:true,force:true});}
});
