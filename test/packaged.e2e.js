// Native Windows acceptance check. Never report this as passed on Linux.
const {_electron:electron}=require('playwright');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const assert=require('node:assert/strict');
const yauzl=require('yauzl');

function zipContents(file) {
 return new Promise((resolve,reject)=>{
  yauzl.open(file,{lazyEntries:true},(error,zip)=>{
   if(error)return reject(error);
   const entries={};
   zip.on('error',reject);zip.on('end',()=>resolve(entries));
   zip.on('entry',entry=>{
    if(entry.fileName.endsWith('/')){entries[entry.fileName]=Buffer.alloc(0);zip.readEntry();return;}
    zip.openReadStream(entry,(error,stream)=>{
     if(error)return reject(error);
     const chunks=[];stream.on('data',chunk=>chunks.push(chunk));stream.on('error',reject);
     stream.on('end',()=>{entries[entry.fileName]=Buffer.concat(chunks);zip.readEntry();});
    });
   });
   zip.readEntry();
  });
 });
}
function parseCsv(bytes) {
 const input=bytes.toString('utf8').replace(/^\uFEFF/,'');
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<input.length;i++){
  const character=input[i];
  if(character==='"'){
   if(quoted&&input[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
  }else if(character===','&&!quoted){row.push(cell);cell='';}
  else if(character==='\r'&&!quoted&&input[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++;}
  else cell+=character;
 }
 row.push(cell);rows.push(row);return rows;
}
(async()=>{
 if(process.platform!=='win32')throw new Error('This packaged EXE test requires Windows.');
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'packaged-app-'));
 const app=await electron.launch({executablePath:path.resolve('dist/win-unpacked/AliExpress Product Archiver.exe'),args:[`--user-data-dir=${data}`]});
 try {
  const page=await app.firstWindow();await page.waitForSelector('#urls');
  const result=await app.evaluate(async({app})=>{
   const {Browser}=process.mainModule.require(app.getAppPath()+'/src/browser.js');
   const {convertToJpeg}=process.mainModule.require(app.getAppPath()+'/src/jpeg.js');
   const {makeArchive}=process.mainModule.require(app.getAppPath()+'/src/archive.js');
   const browser=new Browser(app.getPath('userData')+'/acceptance');
   try{
    const page=await browser.open('about:blank');
    const encoded=await page.evaluate(async()=>{
     const canvas=new OffscreenCanvas(20,12);const context=canvas.getContext('2d');
     context.fillStyle='#136ad7';context.fillRect(0,0,20,12);
     const blob=await canvas.convertToBlob({type:'image/webp',quality:1});
     return new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);
      reader.onerror=()=>reject(new Error('Fixture image generation failed'));reader.readAsDataURL(blob);
     });
    });
    const webp=Buffer.from(encoded,'base64');
    // Deliberately use a .jpg URL and JPEG MIME with actual WebP bytes: the
    // production codec must decode and convert, never just rename the file.
    const imageUrl='https://ae01.alicdn.com/kf/packaged-fixture.jpg';
    const fixture={
     productId:'991234567890',sourceUrl:'https://www.aliexpress.com/item/991234567890.html',
     title:'Packaged fixture, embroidery "kit"',
     descriptionText:'AI overview of item\nDisclaimer: local acceptance fixture.\nObserved fixture description.',
     capturedAt:new Date().toISOString(),warnings:[],images:[imageUrl],descriptionImages:[imageUrl],
     properties:[{name:'Size',values:[{name:'20*20cm',image:imageUrl}]}],
     variations:[{skuId:'fixture-size20',name:'Size: 20*20cm',price:{currency:'USD',value:'8.15'}}]
    };
    const request={get:async url=>({ok:()=>true,url:()=>url,headers:()=>({'content-type':'image/jpeg'}),body:async()=>webp})};
    const archive=await makeArchive(fixture,app.getPath('userData')+'/acceptance-output',request,async()=>{},(bytes,mime)=>convertToJpeg(page,bytes,mime));
    return {url:page.url(),exe:browser.browserExecutablePath,resources:process.resourcesPath,archive,
     sourceSignature:webp.toString('ascii',0,4)+'/'+webp.toString('ascii',8,12),
     expected:{title:fixture.title,description:fixture.descriptionText}};
   }finally{await browser.close();}
  });
  assert.equal(result.url,'about:blank');assert(result.exe.startsWith(path.join(result.resources,'chromium')));
  assert.equal(result.sourceSignature,'RIFF/WEBP');assert.equal(result.archive.exportFormat,'csv-jpeg-v1');
  assert.equal(result.archive.images,1);assert.deepEqual(result.archive.warnings,[]);
  const entries=await zipContents(result.archive.path);
  const files=Object.keys(entries).filter(name=>!name.endsWith('/')).sort();
  assert.deepEqual(files,['Images/variation-Size-20_20cm-001.jpg','product.csv']);
  assert(Object.keys(entries).every(name=>name==='product.csv'||name==='Images/'||/^Images\/[^/]+\.jpg$/.test(name)));
  const rows=parseCsv(entries['product.csv']);
  assert.deepEqual(rows,[['Title','Description','Variation','Price'],[result.expected.title,result.expected.description,'Size: 20*20cm','USD 8.15']]);
  const jpeg=entries[files[0]];assert.equal(jpeg.readUInt16BE(0),0xffd8);
  const decoded=await app.evaluate(({nativeImage},base64)=>{
   const image=nativeImage.createFromBuffer(Buffer.from(base64,'base64'));
   return {empty:image.isEmpty(),...image.getSize()};
  },jpeg.toString('base64'));
  assert.deepEqual(decoded,{empty:false,width:20,height:12});
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/packaged-windows.png'});
  console.log('PASS: native Windows packaged EXE launches bundled Chromium and exports four-column CSV plus decoded 20x12 JPEG from actual WebP bytes.');
 }finally{await app.close();await fs.rm(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
