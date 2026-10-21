// Real Electron, Chromium, extraction, prices and ZIP code; only remote content is local.
const {app}=require('electron');
const path=require('node:path');
app.setPath('userData',process.env.E2E_DATA);
app.on('ready',()=>app.setPath('userData',process.env.E2E_DATA));
const {Browser}=require('../src/browser');
const {chromium}=require('playwright');
const Module=require('node:module');
const {productHtml,endpointHtml,frameHtml}=require('./fixtures');
class FixtureBrowser extends Browser {
 constructor(dataDir,notify){super(dataDir,notify,{resourcesPath:process.env.E2E_BUNDLED?path.resolve('dist/win-unpacked/resources'):process.resourcesPath});}
 async ensureInstalled(){if(process.env.E2E_BUNDLED)return super.ensureInstalled();this.browserExecutablePath=process.env.TEST_CHROMIUM||(require('node:fs').existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath());}
 async open(){
  if(this.context)return this.page;
  await super.open('about:blank');
  const context=this.context;
  const image=Buffer.from(await this.page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=20;canvas.height=12;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,20,12);return canvas.toDataURL('image/webp',1).split(',')[1];}),'base64');
  let verify=true;global.fixtureRequests=[];global.fixtureFrames=[];
  await context.route('https://www.aliexpress.com/**',async route=>{
   const url=route.request().url();
   if(url.includes('/item/2.html'))return route.abort('failed');
   const frame=url.match(/\/description\/frame-(\d+)\.html/);
   if(frame){global.fixtureFrames.push(url);return route.fulfill({contentType:'text/html',body:frameHtml(frame[1])});}
   const endpoint=url.match(/\/description\/endpoint-(\d+)\.html/);
   if(endpoint)return route.fulfill({contentType:'text/html',body:endpointHtml(endpoint[1])});
   if(url.includes('/verified')){verify=false;return route.fulfill({contentType:'text/html',body:'<h1>Account session ready</h1>'});}
   const id=url.match(/\/item\/(\d+)\.html/)?.[1]||'1';
   await route.fulfill({contentType:'text/html',body:verify?'<h1>Security verification</h1><button id="verify">Complete the fixture login</button>':productHtml(id)});
  });
  await context.route('https://ae01.alicdn.com/**',route=>route.fulfill({contentType:'image/webp',body:image}));
  const request={get:async url=>{
   global.fixtureRequests.push(url);const endpoint=url.match(/\/description\/endpoint-(\d+)\.html/);const body=endpoint?Buffer.from(endpointHtml(endpoint[1])):image;
   return {ok:()=>true,status:()=>200,url:()=>url,headers:()=>({'content-type':endpoint?'text/html':'image/webp'}),body:async()=>body,text:async()=>body.toString('utf8')};
  }};
  this.context=new Proxy(context,{get(target,key){if(key==='request')return request;const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  global.fixturePage=this.page;return this.page;
 }
}
const originalLoad=Module._load;
Module._load=function(name,parent,...rest){if(name==='./browser'&&parent.filename.endsWith(path.join('src','main.js')))return {Browser:FixtureBrowser};return originalLoad.call(this,name,parent,...rest);};
require('../src/main');
