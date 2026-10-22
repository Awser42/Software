const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Browser}=require('../src/browser');
const {isProductResponse}=require('../src/browser');
test('product responses require a genuine HTTPS AliExpress host, not a matching query or suffix',()=>{
 for(const url of ['https://www.aliexpress.com/mtop/product','https://acs.aliexpress.us/pdp/detail'])assert.equal(isProductResponse(url),true);
 for(const url of ['https://aliexpress.com.attacker.test/pdp','https://attacker.test/?aliexpress.com/product','http://www.aliexpress.com/pdp','https://user:pass@www.aliexpress.com/pdp','https://www.aliexpress.com:444/pdp','not a url'])assert.equal(isProductResponse(url),false,url);
});
function windowFixture(){const commands=[];let fronts=0,detached=0;const browser=new Browser('/unused-fixture-profile',()=>{},{platform:'linux'});const page={isClosed:()=>false,bringToFront:async()=>{fronts++;}};browser.page=page;browser.context={newCDPSession:async()=>({send:async(name,args)=>{commands.push([name,args]);return name==='Browser.getWindowForTarget'?{windowId:71}:{};},detach:async()=>{detached++;}})};return {browser,page,commands,fronts:()=>fronts,detached:()=>detached};}
test('hide and show change the same Chromium window without navigating or launching another profile',async()=>{const f=windowFixture(),context=f.browser.context;assert.equal(await f.browser.hide(),true);assert.equal(f.browser.hidden,true);assert.equal(f.fronts(),0);assert.deepEqual(f.commands[1],['Browser.setWindowBounds',{windowId:71,bounds:{windowState:'minimized'}}]);assert.equal(await f.browser.open('https://www.aliexpress.com/',{show:false}),f.page);assert.equal(f.commands.length,2);assert.equal(await f.browser.show(),f.page);assert.equal(f.browser.hidden,false);assert.equal(f.fronts(),1);assert.equal(f.browser.context,context);assert.deepEqual(f.commands[3],['Browser.setWindowBounds',{windowId:71,bounds:{windowState:'normal'}}]);assert.equal(f.detached(),2);});
test('a background minimize failure is reported without silently replacing the authenticated session',async()=>{const messages=[];const browser=new Browser('/unused-fixture-profile',message=>messages.push(message),{platform:'linux'});const context={newCDPSession:async()=>{throw new Error('Window manager unavailable');}};browser.context=context;browser.page={isClosed:()=>false,bringToFront:async()=>{throw new Error('A hide action must not bring Chromium forward');}};assert.equal(await browser.hide(),false);assert.equal(browser.context,context);assert(messages.some(message=>message.includes('Window manager unavailable')));});
test('Windows hides only the CDP-identified Chromium process and shows the verification tab',async()=>{
 const calls=[],primary={isClosed:()=>false,bringToFront:async()=>{throw new Error('Wrong tab');}},worker={isClosed:()=>false,bringToFront:async()=>calls.push('verification-tab')};
 const browser=new Browser('/unused',()=>{},{platform:'win32',windowVisibility:async(pid,action)=>{calls.push([pid,action]);return {hidden:action==='hide'};}});
 browser.page=primary;browser.context={newCDPSession:async()=>({send:async()=>({windowId:71}),detach:async()=>{}}),browser:()=>({newBrowserCDPSession:async()=>({send:async()=>({processInfo:[{type:'renderer',id:9001},{type:'browser',id:9002}]}),detach:async()=>{}})})};
 browser.attentionPages.set('product',worker);assert.equal(await browser.hide(),true);assert.equal(await browser.show(),worker);
 assert.deepEqual(calls,[[9002,'hide'],[9002,'show'],'verification-tab']);assert.equal(browser.page,primary);
});
test('Windows cannot target the software process or claim a failed hide succeeded',async()=>{
 const messages=[];const browser=new Browser('/unused',message=>messages.push(message),{platform:'win32',windowVisibility:async()=>{throw new Error('Must not run');}});
 browser.page={isClosed:()=>false};browser.context={newCDPSession:async()=>({send:async()=>({windowId:71}),detach:async()=>{}}),browser:()=>({newBrowserCDPSession:async()=>({send:async()=>({processInfo:[{type:'browser',id:process.pid}]}),detach:async()=>{}})})};
 browser.hidden=false;assert.equal(await browser.hide(),false);assert.equal(browser.hidden,false);assert(messages.some(message=>message.includes('identity')));
});
