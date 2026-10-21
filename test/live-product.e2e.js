// Optional public-site check. This profile contains no supplied user account.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const yauzl=require('yauzl');
const {Browser}=require('../src/browser');
const {extractPage}=require('../src/extract');
const {normalizedUrl,productKey}=require('../src/archive');
function csvRows(bytes){const text=bytes.toString('utf8').replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\r'&&text[i+1]==='\n'&&!quoted){row.push(cell);rows.push(row);row=[];cell='';i++;}else cell+=c;}row.push(cell);rows.push(row);return rows;}
function csvFromZip(file){return new Promise((resolve,reject)=>{yauzl.open(file,{lazyEntries:true},(error,zip)=>{if(error)return reject(error);zip.on('error',reject);zip.on('end',()=>reject(new Error('Public export contained no product.csv')));zip.on('entry',entry=>{if(entry.fileName!=='product.csv'){zip.readEntry();return;}zip.openReadStream(entry,(error,stream)=>{if(error)return reject(error);const chunks=[];stream.on('data',chunk=>chunks.push(chunk));stream.on('error',reject);stream.on('end',()=>{zip.close();resolve(Buffer.concat(chunks));});});});zip.readEntry();});});}
async function bounded(promise,milliseconds){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Public validation exceeded its time limit.'),{code:'LIVE_TIMEOUT'})),milliseconds);})]);}finally{clearTimeout(timer);}}
(async()=>{
 const input=process.env.LIVE_PRODUCT_URL;if(!input)throw new Error('LIVE_PRODUCT_URL is required for the optional public-site check.');const url=normalizedUrl(input);const id=productKey(url);
 await fs.mkdir('test-results',{recursive:true});const directory=await fs.mkdtemp(path.join(os.tmpdir(),'public-product-check-'));const browser=new Browser(directory,()=>{},{resourcesPath:process.env.E2E_BUNDLED?path.resolve('dist/win-unpacked/resources'):process.resourcesPath});const deadline=Date.now()+60000;
 const record={testedAt:new Date().toISOString(),url,accountSession:false,browser:process.env.E2E_BUNDLED?'bundled Chromium':'configured Playwright Chromium',status:'unavailable',finalUrl:null,title:null,descriptionCharacters:0,sellerDescriptionCharacters:0,featuresCount:0,specificationsCount:0,variationRows:0,pricedVariationRows:0,imageCount:0};
 let extraction;
 try{
  const queue={checkpoint:async()=>{if(Date.now()>deadline)throw Object.assign(new Error('Public validation exceeded 60 seconds.'),{code:'LIVE_TIMEOUT'});},manual:async message=>{throw Object.assign(new Error(message),{code:'LIVE_MANUAL'});}};
  extraction=browser.extract({productId:id,url},{output:path.join(directory,'output'),settleMs:1000,delayMs:0},queue);
  const result=await bounded(extraction,60000);const table=csvRows(await csvFromZip(result.path));const headers=table.shift();const rows=table.map(row=>Object.fromEntries(headers.map((name,index)=>[name,row[index]||''])));const first=rows[0]||{};
  record.title=first.Title||null;record.descriptionCharacters=(first.Description||'').length;record.sellerDescriptionCharacters=(first['Seller Description']||'').length;record.featuresCount=(first.Features||'').split('\n').filter(Boolean).length;record.specificationsCount=(first.Specifications||'').split('\n').filter(Boolean).length;record.variationRows=rows.filter(row=>row.Variation).length;record.pricedVariationRows=rows.filter(row=>row.Variation&&row.Price).length;record.imageCount=result.images;record.pricesSample=[...new Set(rows.map(row=>row.Price).filter(Boolean))].slice(0,5);record.status=record.title?'parsed':'extraction-error';if(!record.title){record.reason='A public product export was created without a title.';process.exitCode=1;}
 }catch(error){
  let gate=false;try{if(browser.page&&!browser.page.isClosed())gate=await bounded(browser.inspectGate(browser.page),3000);}catch{}
  const message=String(error.message||error).replace(/\s+/g,' ').slice(0,300);
  if(gate||error.code==='LIVE_MANUAL'&&/login|captcha|verification/i.test(message)){record.status='manual-login-required';record.reason='The fresh public profile requires manual login or verification. No account was provided.';}
  else if(error.code==='LIVE_TIMEOUT'){record.status='unavailable';record.reason='The public product workflow did not finish within 60 seconds.';}
  else if(error.code==='LIVE_MANUAL'||/unavailable|removed|region.restrict|blocked|not.*requested product/i.test(message)){record.status='unavailable';record.reason=message;}
  else if(/net::|HTTP|navigation|ECONN|ENOTFOUND|network|ERR_/i.test(message)){record.status='network-error';record.reason=message;}
  else{record.status='error';record.reason=message;process.exitCode=1;}
  try{
   if(!gate&&browser.page&&!browser.page.isClosed()){
    const snapshot=await bounded(extractPage(browser.page,[],null),3000);record.title=snapshot.title||null;record.descriptionCharacters=(snapshot.descriptionText||'').length;record.sellerDescriptionCharacters=(snapshot.sellerDescriptionText||'').length;record.featuresCount=snapshot.features?.length||0;record.specificationsCount=snapshot.specifications?.length||0;record.imageCount=snapshot.images?.length||0;
    const visibleTitle=await bounded(browser.page.locator('h1:visible').first().innerText({timeout:1000}).catch(()=>''),1500);if(visibleTitle&&!snapshot.title){record.status='extraction-error';record.reason='A visible public product h1 was present but the production extractor returned no title.';process.exitCode=1;}
   }
  }catch{}
 }finally{
  try{if(browser.page&&!browser.page.isClosed()){const finalUrl=new URL(browser.page.url());record.finalUrl=/^https?:$/.test(finalUrl.protocol)?finalUrl.origin+finalUrl.pathname:finalUrl.protocol+finalUrl.pathname;}}catch{}
  try{if(browser.page&&!browser.page.isClosed()){await browser.page.screenshot({path:'test-results/live-product.png',fullPage:false,timeout:5000});record.screenshot='live-product.png';}}catch{}
  await bounded(browser.close(),5000).catch(()=>{});await bounded(extraction?.catch(()=>{}),3000).catch(()=>{});await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
  await fs.writeFile('test-results/live-product.json',JSON.stringify(record,null,2)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY){const safe=value=>String(value??'').replace(/[<>`|\r\n]/g,' ');await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`\n### Public AliExpress validation\n\nStatus: **${safe(record.status)}**. Account session supplied: **no**.\n\nObserved title: ${safe(record.title||'(not available)')}\n\nDescription characters: ${record.descriptionCharacters}; seller description characters: ${record.sellerDescriptionCharacters}; features: ${record.featuresCount}; specifications: ${record.specificationsCount}; images: ${record.imageCount}; priced variation rows: ${record.pricedVariationRows}.\n\n${safe(record.reason||'The production public-page workflow completed.')}\n`);}
  console.log('LIVE_PRODUCT_VALIDATION '+JSON.stringify(record));
 }
})().catch(error=>{console.error('Public validation setup failed:',error.message);process.exitCode=1;});
