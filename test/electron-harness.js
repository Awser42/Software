// Isolated integration fixture: real Electron UI, browser extraction, queue and ZIP pipeline.
// Only external AliExpress content and image transport are replaced with known test data.
const {app}=require('electron');
const path=require('node:path');
app.setPath('userData',process.env.E2E_DATA);
app.on('ready',()=>app.setPath('userData',process.env.E2E_DATA));
const {Browser}=require('../src/browser');
const {chromium}=require('playwright');
const Module=require('node:module');
const data={titleModule:{subject:'Fixture Cotton Shirt'},imageModule:{imagePathList:['https://ae01.alicdn.com/kf/fixture.png']},skuModule:{productSKUPropertyList:[{skuPropertyId:14,skuPropertyName:'Color',skuPropertyValues:[{propertyValueId:1,propertyValueDisplayName:'Blue'}]}],skuPriceList:[{skuId:'fixture-sku',skuAttr:'14:1',skuVal:{skuAmount:{currency:'USD',value:'12.34'},availQuantity:2}}]},specsModule:{props:[{attrName:'Material',attrValue:'Cotton'}]}};
class FixtureBrowser extends Browser {
 constructor(dataDir,notify){super(dataDir,notify,{resourcesPath:process.env.E2E_BUNDLED?path.resolve('dist/win-unpacked/resources'):process.resourcesPath});}
 async ensureInstalled(){
  if(process.env.E2E_BUNDLED)return super.ensureInstalled();
  this.browserExecutablePath=process.env.TEST_CHROMIUM||(require('node:fs').existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath());
 }
 async open() {
  if(this.context)return this.page;
  await super.open('about:blank');
  const context=this.context;
  let verify=true;
  await context.route('https://www.aliexpress.com/**',async route=>{
   if(route.request().url().includes('/item/2.html'))return route.abort('failed');
   const html=verify?'<h1>Security verification</h1><button id="verify">I completed the fixture login</button><script>document.getElementById("verify").onclick=()=>location.href="https://www.aliexpress.com/verified"</script>':`<h1>Fixture Cotton Shirt</h1><div class="price--current">US $12.34</div><div id="product-description"><p>Actual fixture description</p><img src="https://ae01.alicdn.com/kf/detail.png"></div><script>window.runParams=${JSON.stringify(data)}</script>`;
   if(route.request().url().includes('/verified'))verify=false;
   await route.fulfill({contentType:'text/html',body:html});
  });
  this.page=context.pages()[0];
  const image=require('electron').nativeImage.createFromBitmap(Buffer.alloc(100*100*4,255),{width:100,height:100}).toPNG();
  const request={get:async()=>({ok:()=>true,headers:()=>({'content-type':'image/png'}),body:async()=>image})};
  // Keep a real browser/context; substitute only HTTP image transport.
  this.context=new Proxy(context,{get(target,key){if(key==='request')return request;const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
  global.fixturePage=this.page;
  return this.page;
 }
}
const originalLoad=Module._load;
Module._load=function(name,parent,...rest){if(name==='./browser'&&parent.filename.endsWith(path.join('src','main.js')))return {Browser:FixtureBrowser};return originalLoad.call(this,name,parent,...rest);};
require('../src/main');
