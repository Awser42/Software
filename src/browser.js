const path = require('node:path');
const fs = require('node:fs/promises');
const {spawn} = require('node:child_process');
const {extractPage, parseDescription, captureOverview, captureProductDetails} = require('./extract');
const {convertToJpeg} = require('./jpeg');
const {captureVisiblePrices} = require('./prices');
const {makeArchive} = require('./archive');
const {bundledChromium}=require('./browser-path');
const {chromiumWindowVisibility}=require('./window-visibility');

class Browser {
  constructor(dataDir, notify = () => {}, {resourcesPath=process.resourcesPath,platform=process.platform,windowVisibility=chromiumWindowVisibility} = {}) { this.dataDir=dataDir; this.notify=notify; this.resourcesPath=resourcesPath;this.platform=platform;this.windowVisibility=windowVisibility;this.browserExecutablePath=null;this.context=null; this.page=null; this.installing=null;this.opening=null;this.hidden=true;this.activePages=new Map();this.attentionPages=new Map(); }
  currentPage() {return [...this.attentionPages.values(),...this.activePages.values(),this.page].find(page=>page&&!page.isClosed());}
  async browserProcessId() {
    const session=await this.context.browser().newBrowserCDPSession();
    try {
      const {processInfo}=await session.send('SystemInfo.getProcessInfo');
      const id=processInfo.find(info=>info.type==='browser')?.id;
      if(!Number.isSafeInteger(id)||id===process.pid)throw new Error('Chromium process identity is unavailable.');
      return id;
    } finally {await session.detach();}
  }
  async visibility() {return this.windowVisibility(await this.browserProcessId(),'inspect');}
  async newProductPage() {
    const session=await this.context.browser().newBrowserCDPSession();
    let resolveTarget;
    const target=new Promise(resolve=>{resolveTarget=resolve;});
    const created=this.context.waitForEvent('page',{timeout:60000,predicate:async page=>{
      const id=await target;if(!id)return false;
      const pageSession=await this.context.newCDPSession(page);
      try {return (await pageSession.send('Target.getTargetInfo')).targetInfo.targetId===id;}
      finally {await pageSession.detach();}
    }});
    created.catch(()=>{});
    try {
      // Background targets share the logged-in profile without activating tabs.
      const {targetId}=await session.send('Target.createTarget',{url:'about:blank',background:true});
      resolveTarget(targetId);return await created;
    } catch(error){resolveTarget(null);throw error;}
    finally {await session.detach();}
  }
  async ensureInstalled() {
    const bundled=await bundledChromium(this.resourcesPath);
    if(bundled){this.browserExecutablePath=bundled;this.notify('Bundled Chromium is ready. No browser download required.');return;}
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(this.dataDir, 'browsers');
    const {chromium} = require('playwright');
    if (await fs.access(chromium.executablePath()).then(() => true, () => false)) return;
    if (this.installing) return this.installing;
    this.notify('Downloading verified Playwright Chromium. First launch can take several minutes.');
    this.installing = new Promise((resolve, reject) => {
      const cli=path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js').replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
      const child=spawn(process.execPath, [cli, 'install', 'chromium'], {
        env:{...process.env, ELECTRON_RUN_AS_NODE:'1'}, windowsHide:true
      });
      child.stdout.on('data', b => this.notify(b.toString().trim()));
      child.stderr.on('data', b => this.notify(b.toString().trim()));
      child.on('error', reject); child.on('exit', code => code===0 ? resolve() : reject(new Error(`Chromium installation failed (${code}). Check Internet access and retry Open Chromium.`)));
    }).finally(() => {this.installing=null;});
    return this.installing;
  }
  async open(url = 'https://www.aliexpress.com/', {show=true} = {}) {
    // A manual Show Chromium click can arrive while the queue is starting its
    // browser. Reuse that launch rather than locking the same profile twice.
    if(this.opening) await this.opening;
    if (this.context) {
      if (!this.page || this.page.isClosed()) this.page=await this.context.newPage();
      if(show) await this.show();
      return this.page;
    }
    this.opening=(async()=>{
      await this.ensureInstalled();
      const {chromium}=require('playwright');
      this.context=await chromium.launchPersistentContext(path.join(this.dataDir,'chromium-profile'), {headless:false, viewport:null, acceptDownloads:false,args:['--lang=en-US',...(!show?['--start-minimized']:[])],...(this.browserExecutablePath?{executablePath:this.browserExecutablePath}:{})});
      this.context.on('close', () => {this.context=null; this.page=null;this.hidden=true;this.activePages.clear();this.attentionPages.clear();});
      this.page=this.context.pages()[0] || await this.context.newPage();
      if(!await this.setWindowVisibility(show))throw new Error(`Chromium could not be ${show?'shown':'hidden'}. Try Show Chromium / Login again.`);
      await this.page.goto(url, {waitUntil:'domcontentloaded', timeout:60000});
      return this.page;
    })();
    try {return await this.opening;} finally {this.opening=null;}
  }
  async setWindowVisibility(show) {
    const page=this.currentPage();if(!this.context||!page)return false;
    let session;
    try {
      if(this.platform==='win32') {
        await this.windowVisibility(await this.browserProcessId(),show?'show':'hide');
        if(show)await page.bringToFront();
        this.hidden=!show;return true;
      }
      session=await this.context.newCDPSession(page);
      const {windowId}=await session.send('Browser.getWindowForTarget');
      await session.send('Browser.setWindowBounds',{windowId,bounds:{windowState:show?'normal':'minimized'}});
      if(show) await page.bringToFront();
      this.hidden=!show;
      return true;
    } catch(error) {
      // The browser remains usable if a desktop/window manager does not expose
      // minimize controls. Never switch to a separate headless login session.
      if(show&&this.platform!=='win32') {await page.bringToFront();this.hidden=false;return true;}
      this.notify(`Chromium could not be ${show?'shown':'hidden'} automatically: ${error.message}`);
      return false;
    } finally {await session?.detach().catch(()=>{});}
  }
  async show() {
    if(this.opening) await this.opening;
    if(!this.context)return this.open();
    if(!this.page||this.page.isClosed())this.page=await this.context.newPage();
    if(!await this.setWindowVisibility(true))throw new Error('Chromium could not be shown. Try again.');
    return this.currentPage();
  }
  async hide() {
    if(this.opening) await this.opening;
    return this.setWindowVisibility(false);
  }
  async inspectGate(page) {
    return page.evaluate(() => {
      const title=document.title.toLowerCase(); const text=document.body?.innerText?.slice(0, 10000) || '';
      return /captcha|punish|_____tmd|\/login|\/signin|passport\./i.test(location.href) || /captcha|security verification|verify you are human|slide to verify|verify your identity|access denied|unusual traffic|just a moment/i.test(title+' '+text) || !!document.querySelector('#nc_1_n1z, #baxia-dialog-content, iframe[src*="captcha"]');
    });
  }
  async extract(item, settings, queue) {
    const background=settings.backgroundBrowser!==false;
    await this.open('about:blank',{show:!background});
    const page=await this.newProductPage();this.activePages.set(item.id,page);
    const manual=async message=>{
      this.attentionPages.set(item.id,page);
      try {if(!background)await this.show();await queue.manual(message,item);}
      finally {this.attentionPages.delete(item.id);}
    };
    const responses=[];
    const pending=new Set();
    const handler=response => {
      if (!/aliexpress\.(com|us)/i.test(response.url()) || !/mtop|pdp|detail|product/i.test(response.url())) return;
      const job=(async () => {
        try {
          if (!(response.headers()['content-type'] || '').includes('json')) return;
          const body=await response.body(); if (body.length < 8*1024*1024 && responses.length<30) responses.push(JSON.parse(body.toString()));
        } catch {}
      })();
      pending.add(job); job.finally(()=>pending.delete(job));
    };
    page.on('response',handler);
    try {
      let navError=null;
      try { await page.goto(item.url, {waitUntil:'domcontentloaded',timeout:60000}); } catch(e) {
        if(e.name!=='TimeoutError') throw new Error(`Product navigation failed: ${e.message}`);
        navError=e;
      }
      await page.waitForTimeout(settings.settleMs || 3000);
      let verificationEpoch=queue.verificationEpoch;
      for (let attempt=0; attempt<4; attempt++) {
        await queue.checkpoint();
        if(verificationEpoch!==queue.verificationEpoch){
          await page.goto(item.url,{waitUntil:'domcontentloaded',timeout:60000});
          await page.waitForTimeout(settings.settleMs||3000);verificationEpoch=queue.verificationEpoch;
        }
        if (await this.inspectGate(page)) {
          await manual('Click Show Chromium, complete login or CAPTCHA, then click Continue after login.');
          await page.waitForTimeout(2000); continue;
        }
        const capturePrices=async product=>{
          await page.evaluate(()=>window.scrollTo(0,0));
          await captureVisiblePrices(page,product,queue,{
          settleMs:settings.settleMs||3000,
          onProgress:message=>this.notify(message),
          onGate:async()=>{
            if(await this.inspectGate(page)) {
              await manual('Click Show Chromium, complete login or CAPTCHA, then click Continue to read the visible variation prices.');
            }
          }
        });
        };
        const overview=await captureOverview(page);
        const topSnapshot=await extractPage(page,responses,overview);
        const topData=topSnapshot.sourceUrl?.match(/\/(?:item|i)\/(\d+)\.html/i)?.[1]===item.productId?topSnapshot:{};
        // Read prices while the main product controls are still mounted. Native
        // description/specification tabs can unmount the selectable SKU panel.
        if(topData.title){topData.productId=item.productId;await capturePrices(topData);}
        // Scroll through the product to trigger lazy-loaded description content.
        for (let n=0; n<6; n++) { await queue.checkpoint(); await page.evaluate(n=>window.scrollTo(0, n*850),n); await page.waitForTimeout(250); }
        await Promise.allSettled([...pending]);
        const details=await captureProductDetails(page);
        // Opening the native description tab can start another PDP response.
        // Keep those observed endpoint modules before taking the final snapshot.
        await Promise.allSettled([...pending]);
        const data=await extractPage(page,responses,overview||undefined);
        if(topData.titleSource==='dom') {data.title=topData.title;data.titleSource='dom';}
        const unique=values=>[...new Set(values.filter(Boolean))];
        data.descriptionUrl=data.descriptionUrl||topData.descriptionUrl;
        data.descriptionUrls=unique([...(topData.descriptionUrls||[]),topData.descriptionUrl,...(data.descriptionUrls||[]),data.descriptionUrl,...(details.descriptionUrls||[])]).slice(0,8);
        if(!data.properties.length&&topData.properties?.length) data.properties=topData.properties;
        if(!data.variations.length&&topData.variations?.length) data.variations=topData.variations;
        data.images=unique([...(topData.images||[]),...(data.images||[])]);
        data.descriptionImages=unique([...(topData.descriptionImages||[]),...(data.descriptionImages||[]),...(details.descriptionImages||[])]);
        data.features=unique([...(topData.features||[]),...(data.features||[]),...(details.features||[])]);
        const specMap=new Map();
        for(const spec of [...(topData.specifications||[]),...(data.specifications||[]),...(details.specifications||[])]) specMap.set(JSON.stringify([spec.name,spec.value]),spec);
        data.specifications=[...specMap.values()];
        const observedId=page.url().match(/\/(?:item|i)\/(\d+)\.html/i)?.[1];
        if(!observedId || observedId!==item.productId) {
          if(attempt===3) throw new Error('The browser is not on the requested product. No archive was created from a different page.');
          await manual('Open the requested product link in Chromium, then click Continue. The app will not archive a different page.');continue;
        }
        if (!data.title || (!data.images.length && !data.prices.displayed && !data.prices.structuredOffers && !data.prices.sourceModule)) {
          if (attempt===3) throw new Error('Product content is unavailable. It may be removed, region-restricted, or blocked. No archive was fabricated.'+(navError ? ` Navigation: ${navError.message}` : ''));
          await manual('Product content has not loaded. Check the product in Chromium, finish any login prompt, then click Continue after login.'); continue;
        }
        data.productId=item.productId;
        if(topData.variations?.some(variant=>variant.displayedPrice)){
          data.properties=topData.properties;data.variations=topData.variations;data.prices=topData.prices;
          data.warnings.push(...(topData.warnings||[]));
        }else await capturePrices(data);
        if(data.descriptionSource!=='ai-overview') {
          const lateOverview=await captureOverview(page);
          if(lateOverview?.text) {
            data.descriptionText=lateOverview.text;data.descriptionHtml=lateOverview.html;data.descriptionSource='ai-overview';
            data.features=unique([...data.features,...(lateOverview.features||[])]);
            data.descriptionImages=unique([...data.descriptionImages,...(lateOverview.images||[])]);
          }
        }
        // Seller content/images are independent of the preferred AI overview.
        // Read every exposed description source; never discard seller media just
        // because the overview beside the product price was available.
        const fragments=unique([topData.sellerDescriptionHtml,data.sellerDescriptionHtml,details.sellerDescriptionHtml,
          ...(data.descriptionSource==='ai-overview'?[]:[data.descriptionHtml])]);
        for (const descriptionUrl of data.descriptionUrls) {
          await queue.checkpoint();
          try {
            const u=new URL(descriptionUrl);
            if (!/^https?:$/.test(u.protocol) || !/(^|\.)(aliexpress\.(com|us)|alicdn\.com|aliexpress-media\.com)$/i.test(u.hostname)) throw new Error('Description host not recognized');
            const response=await this.context.request.get(descriptionUrl,{timeout:30000,maxRedirects:3});
            if(!response.ok()) throw new Error(`HTTP ${response.status()}`);
            if(typeof response.url==='function') {
              const finalUrl=new URL(response.url());
              if(!/^https?:$/.test(finalUrl.protocol)||!/(^|\.)(aliexpress\.(com|us)|alicdn\.com|aliexpress-media\.com)$/i.test(finalUrl.hostname)||/captcha|punish|\/login|\/signin|passport\./i.test(finalUrl.href))throw new Error('Description endpoint redirected away from seller content');
            }
            if(Number(response.headers()['content-length'])>8*1024*1024)throw new Error('Description exceeds 8 MB');
            const body=await response.text();
            if(body.length>8*1024*1024) throw new Error('Description exceeds 8 MB');
            if(/^\s*</.test(body)) {const clean=await parseDescription(page,body,descriptionUrl);fragments.push(clean.html);data.descriptionImages=unique([...data.descriptionImages,...clean.images]);}
            else {
              let json;try{json=JSON.parse(body);}catch{}
              const html=json?.data?.pcDescContent||json?.data?.description||json?.data?.descHtml||json?.data?.descriptionHtml||json?.data?.result?.pcDescContent||json?.result?.description||json?.description||json?.html;
              if(typeof html==='string') {const clean=await parseDescription(page,html,descriptionUrl);fragments.push(clean.html);data.descriptionImages=unique([...data.descriptionImages,...clean.images]);}
              else data.warnings.push('Description endpoint did not expose supported description content.');
            }
          } catch(e) {data.warnings.push(`Description fetch failed: ${e.message}`);}
        }
        for(const frame of page.frames().filter(f=>f!==page.mainFrame())) {
          try {
            const frameUrl=new URL(frame.url());
            const allowedFrame=/^https?:$/.test(frameUrl.protocol)&&/(^|\.)(aliexpress\.(com|us)|alicdn\.com|aliexpress-media\.com)$/i.test(frameUrl.hostname);
            const excludedFrame=/captcha|login|signin|recommend|(?:[\/._-])reviews?(?:[\/?. _-]|$)/i.test(frameUrl.href);
            let sellerFrame=allowedFrame&&!excludedFrame&&/desc|description/i.test(frameUrl.pathname);
            if(!sellerFrame&&!excludedFrame&&(allowedFrame||frameUrl.href==='about:blank'||frameUrl.href==='about:srcdoc')) {const element=await frame.frameElement();sellerFrame=await element.evaluate(el=>!!el.closest('#product-description,#productDescription,#ae-product-description,.product-description,[class*="description--detail"],[class*="description--content"],.detailmodule_html'));}
            if(sellerFrame) {const clean=await parseDescription(frame,await frame.locator('body').innerHTML({timeout:3000}));fragments.push(clean.html);data.descriptionImages=unique([...data.descriptionImages,...clean.images]);}
          } catch(e) {data.warnings.push(`Description frame unavailable: ${e.message}`);}
        }
        let sellerTexts=unique([topData.sellerDescriptionText,data.sellerDescriptionText,details.sellerDescriptionText]);
        const cleaned=[];
        for(const html of unique(fragments)) {
          const clean=await parseDescription(page,html);cleaned.push(clean.html);
          data.descriptionImages=unique([...data.descriptionImages,...clean.images]);
          if(clean.text&&!/^(?:loading[. ]*|description|product description|view more)$/i.test(clean.text.trim())) sellerTexts.push(clean.text);
        }
        sellerTexts=unique(sellerTexts).filter((text,index,all)=>!all.some((other,i)=>i!==index&&other.length>text.length&&other.includes(text)));
        data.sellerDescriptionHtml=cleaned.join('\n');
        data.sellerDescriptionText=sellerTexts.join('\n\n');
        if(data.descriptionSource!=='ai-overview') {
          data.descriptionHtml=data.sellerDescriptionHtml||data.descriptionHtml;
          data.descriptionText=data.sellerDescriptionText||data.descriptionText;
        }
        for(const [name,missing] of [['title',!data.title],['description text',!data.descriptionText?.trim()],['variation names',!data.variations.length],['visible prices',!data.variations.some(v=>v.displayedPrice)&&!data.prices.displayed]]) if(missing) data.warnings.push(`${name} not exposed or confirmed in the observed page.`);
        data.priceContext={note:'Observed account/session prices, not a guaranteed checkout total. No currency conversion or missing-value estimation.', pageLanguage:await page.locator('html').getAttribute('lang')};
        return await makeArchive(data,settings.output,this.context.request,()=>queue.checkpoint(),(bytes,mime)=>convertToJpeg(page,bytes,mime));
      }
      throw new Error('Login or verification is still blocking the page. Complete it and retry this link.');
    } finally {page.off('response',handler);this.activePages.delete(item.id);this.attentionPages.delete(item.id);await page.close().catch(()=>{});}
  }
  async close() {if(this.opening)await this.opening.catch(()=>{});if(this.context) await this.context.close();}
}
module.exports={Browser};
