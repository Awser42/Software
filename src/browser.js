const path = require('node:path');
const fs = require('node:fs/promises');
const {spawn} = require('node:child_process');
const {extractPage, parseDescription} = require('./extract');
const {makeArchive} = require('./archive');
const {bundledChromium}=require('./browser-path');

class Browser {
  constructor(dataDir, notify = () => {}, {resourcesPath=process.resourcesPath} = {}) { this.dataDir=dataDir; this.notify=notify; this.resourcesPath=resourcesPath;this.browserExecutablePath=null;this.context=null; this.page=null; this.installing=null; }
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
  async open(url = 'https://www.aliexpress.com/') {
    if (this.context) {
      if (!this.page || this.page.isClosed()) this.page=await this.context.newPage();
      await this.page.bringToFront(); return this.page;
    }
    await this.ensureInstalled();
    const {chromium}=require('playwright');
    this.context=await chromium.launchPersistentContext(path.join(this.dataDir,'chromium-profile'), {headless:false, viewport:null, acceptDownloads:false,...(this.browserExecutablePath?{executablePath:this.browserExecutablePath}:{})});
    this.context.on('close', () => {this.context=null; this.page=null;});
    this.page=this.context.pages()[0] || await this.context.newPage();
    await this.page.goto(url, {waitUntil:'domcontentloaded', timeout:60000});
    return this.page;
  }
  async inspectGate(page) {
    return page.evaluate(() => {
      const title=document.title.toLowerCase(); const text=document.body?.innerText?.slice(0, 10000) || '';
      return /captcha|punish|_____tmd|\/login|\/signin|passport\./i.test(location.href) || /captcha|security verification|verify you are human|slide to verify|verify your identity|access denied|unusual traffic|just a moment/i.test(title+' '+text) || !!document.querySelector('#nc_1_n1z, #baxia-dialog-content, iframe[src*="captcha"]');
    });
  }
  async extract(item, settings, queue) {
    const page=await this.open(item.url);
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
      for (let attempt=0; attempt<4; attempt++) {
        await queue.checkpoint();
        if (await this.inspectGate(page)) {
          await page.bringToFront();
          await queue.manual('Complete login or CAPTCHA in Chromium. Open the product page there, then click Continue after login.');
          await page.waitForTimeout(2000); continue;
        }
        // Scroll through the product to trigger lazy-loaded description content.
        for (let n=0; n<6; n++) { await queue.checkpoint(); await page.evaluate(n=>window.scrollTo(0, n*850),n); await page.waitForTimeout(250); }
        await Promise.allSettled([...pending]);
        const data=await extractPage(page, responses);
        const observedId=page.url().match(/\/(?:item|i)\/(\d+)\.html/i)?.[1];
        if(!observedId || observedId!==item.productId) {
          if(attempt===3) throw new Error('The browser is not on the requested product. No archive was created from a different page.');
          await queue.manual('Open the requested product link in Chromium, then click Continue. The app will not archive a different page.');continue;
        }
        if (!data.title || (!data.images.length && !data.prices.displayed && !data.prices.structuredOffers && !data.prices.sourceModule)) {
          if (attempt===3) throw new Error('Product content is unavailable. It may be removed, region-restricted, or blocked. No archive was fabricated.'+(navError ? ` Navigation: ${navError.message}` : ''));
          await queue.manual('Product content has not loaded. Check the product in Chromium, finish any login prompt, then click Continue after login.'); continue;
        }
        data.productId=item.productId;
        if (data.descriptionUrl && !data.descriptionHtml) {
          try {
            const u=new URL(data.descriptionUrl);
            if (!/(^|\.)(aliexpress\.(com|us)|alicdn\.com|aliexpress-media\.com)$/i.test(u.hostname)) throw new Error('Description host not recognized');
            const r=await this.context.request.get(data.descriptionUrl,{timeout:30000});
            if (!r.ok()) throw new Error(`HTTP ${r.status()}`);
            const body=await r.text();
            if (/^\s*</.test(body)) data.descriptionHtml=body;
            else data.warnings.push('Description endpoint did not return HTML; it was not evaluated as code.');
          } catch(e) {data.warnings.push(`Description fetch failed: ${e.message}`);}
        }
        if (!data.descriptionHtml) {
          for (const frame of page.frames().filter(f => f!==page.mainFrame() && /desc|detail/i.test(f.url()))) {
            try {data.descriptionHtml=await frame.locator('body').innerHTML({timeout:3000}); break;} catch {}
          }
        }
        if (data.descriptionHtml) {
          const clean=await parseDescription(page,data.descriptionHtml);
          data.descriptionHtml=clean.html; data.descriptionText=clean.text; data.descriptionImages=[...new Set([...data.descriptionImages,...clean.images])];
        }
        for (const [name,missing] of [['description',!data.descriptionHtml && !data.descriptionText],['variations',!data.variations.length],['specifications',!data.specifications.length],['prices',!data.prices.displayed && !data.prices.structuredOffers && !data.prices.sourceModule]]) if(missing) data.warnings.push(`${name} not exposed in the observed page.`);
        data.priceContext={note:'Observed account/session prices, not a guaranteed checkout total. No currency conversion or missing-value estimation.', pageLanguage:await page.locator('html').getAttribute('lang')};
        return await makeArchive(data,settings.output,this.context.request,()=>queue.checkpoint());
      }
      throw new Error('Login or verification is still blocking the page. Complete it and retry this link.');
    } finally {page.off('response',handler);}
  }
  async close() {if(this.context) await this.context.close();}
}
module.exports={Browser};
