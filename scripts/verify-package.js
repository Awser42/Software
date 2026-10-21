const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const asar=require('@electron/asar');
(async()=>{
 const root=path.resolve(__dirname,'../dist/win-unpacked/resources');
 for(const name of await fs.readdir(path.resolve(__dirname,'../src')))assert.deepEqual(asar.extractFile(path.join(root,'app.asar'),'src/'+name),await fs.readFile(path.resolve(__dirname,'../src',name)),name);
 const manifest=JSON.parse(await fs.readFile(path.join(root,'chromium/bundle.json'),'utf8'));
 assert.equal(manifest.playwrightVersion,require('playwright/package.json').version);
 const bytes=await fs.readFile(path.join(root,'chromium',manifest.executable));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.sha256);assert.equal(bytes.subarray(0,2).toString(),'MZ');
 const localeDir=path.join(root,'chromium',path.dirname(manifest.executable),'locales');
 const locales=await fs.readdir(localeDir);assert(locales.includes('en-US.pak'));assert(locales.every(n=>/^en-US(?:_|\.)/.test(n)),'Only English interface packs should be shipped');
 console.log(`PASS: packaged runtime matches source; bundled Chromium ${manifest.browserVersion} SHA-256 matches downloaded bytes.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
