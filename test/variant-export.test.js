// Screenshot-shaped controlled cases. These are not live account prices.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {existsSync} = require('node:fs');
const {chromium} = require('playwright');
const {extractPage} = require('../src/extract');
const {captureVisiblePrices} = require('../src/prices');
const {makeArchive, EXPORT_FORMAT} = require('../src/archive');
const {variantMetadata} = require('../src/variant-metadata');
const {convertToJpeg} = require('../src/jpeg');
const {unzip, sheetRows, archiveTable} = require('./workbook');

let browser, directory;
const {imageUrl,designColors,fixed,dependent,html}=require('./variant-fixtures');

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'variant-export-'));
  browser = await chromium.launch({headless:true, ...(process.env.TEST_CHROMIUM ? {executablePath:process.env.TEST_CHROMIUM} : existsSync('/usr/bin/chromium') ? {executablePath:'/usr/bin/chromium'} : {})});
});
after(async () => {await browser?.close(); await fs.rm(directory, {recursive:true, force:true});});

async function capture(id, catalog, resetSizes, {staleSku=null,lateHoopMs=0,unpricedHoop=false}={}) {
  const page = await browser.newPage();
  await page.route('https://www.aliexpress.com/**', route => route.fulfill({contentType:'text/html', body:html(id, catalog, resetSizes)}));
  await page.goto(`https://www.aliexpress.com/item/${id}.html`);
  const product = await extractPage(page);
  product.productId = id;
  if(staleSku)await page.evaluate(sku=>{const marker=document.createElement('div');marker.dataset.selectedSkuId=sku;marker.textContent='Stale selected SKU';document.body.append(marker);},staleSku);
  if(lateHoopMs)await page.evaluate(delay=>{const option=document.querySelector('[data-sku-col="5:21"]');option.remove();setTimeout(()=>document.getElementById('sizes').append(option),delay);},lateHoopMs);
  if(unpricedHoop){await page.evaluate(()=>{window.blockHoopPrice=true;});product.variations=product.variations.filter(variant=>!variant.attributes.endsWith('5:21'));}
  // The full suite runs several real Chromium processes at once. Give UI
  // scheduling enough time; production retains its 10-second freshness window.
  await captureVisiblePrices(page, product, {checkpoint:async () => {}}, {settleMs:80, timeoutMs:3500});
  return {page, product};
}

test('each design discovers its own changing sizes, including sizes absent from an apparently complete catalog', async () => {
  const {page, product} = await capture('8148', dependent, true);
  try {
    const confirmed = product.variations.filter(variant => variant.displayedPrice);
    assert.equal(confirmed.length, 6, JSON.stringify(product.warnings));
    const seen = new Set();
    for (const variant of confirmed) {
      const design = variant.observedOptions.find(option => option.name === 'Color').value;
      const size = variant.observedOptions.find(option => option.name === 'Size').value;
      const expected = dependent[design].find(option => option.label === size);
      assert(expected, `${design} must not inherit another design's sizes`);
      assert.equal(variant.displayedPrice, expected.price);
      seen.add(`${design}/${size}`);
    }
    assert.equal(seen.size, 6);
    assert(confirmed.some(variant => variant.name.includes('C2') && variant.name.includes('25 cm')));
    assert(confirmed.some(variant => variant.name.includes('C4') && variant.name.includes('30 cm')));
  } finally {await page.close();}
});

test('screenshot-shaped C1/C4 options export explicit identities, own prices, matched photos and labelled shared references', async () => {
  const {page, product} = await capture('9148', fixed, false);
  try {
    product.descriptionText = 'Controlled fixture example. C1 screenshot-shaped prices are $5.25 without hoop and $6.89 with 20cm hoop. Other values are synthetic test data.';
    product.images = [...Object.keys(fixed).map(imageUrl), imageUrl('shared')];
    const source = {};
    for (const [design, color] of Object.entries(designColors)) source[imageUrl(design)] = Buffer.from(await page.evaluate(color => {
      const canvas = new OffscreenCanvas(320, 240), context = canvas.getContext('2d');context.fillStyle=color;context.fillRect(0,0,320,240);
      return canvas.convertToBlob({type:'image/png'}).then(blob => new Promise(resolve => {const reader = new FileReader();reader.onload = () => resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);}));
    }, color), 'base64');
    const requested = [];
    const result = await makeArchive(product, process.env.VARIANT_EXAMPLE_OUTPUT || directory, {get:async url => {requested.push(url);return {ok:() => true, url:() => url, headers:() => ({'content-type':'image/png'}), body:async () => source[url]};}}, async () => {}, (bytes, mime) => convertToJpeg(page, bytes, mime));
    assert.equal(result.exportFormat, EXPORT_FORMAT);
    assert.equal(result.rowCount, 12);
    assert.equal(requested.length, 7, 'Each original downloads once');
    const table = await archiveTable(result.path), entries = await unzip(result.path);
    const rows = table.slice(1).map(values => Object.fromEntries(table[0].map((key, index) => [key, values[index]])));
    const [mapHeaders, ...mapValues] = sheetRows((await unzip(entries['product.xlsx']))['xl/worksheets/sheet3.xml']);
    const imageMap = mapValues.map(values => Object.fromEntries(mapHeaders.map((key, index) => [key, values[index]])));
    const ids = new Set();
    for (const row of rows) {
      const expected = fixed[row.Design].find(size => size.label === row.Size);
      assert(expected);assert.equal(row.Price, expected.price);assert.equal(row['Price Status'], 'confirmed-visible');
      assert.equal(row['Product ID'], '9148');
      assert.equal(row['Option Status'], 'confirmed-selected');
      assert.equal(row['Hoop / Pack'], row.Size);assert.equal(row.Currency, '$');
      assert(!ids.has(row['Variant ID']));ids.add(row['Variant ID']);
      assert.equal(JSON.parse(row['Options JSON']).length, 2);
      const matched = row['Matched Images'].split('\n'), shared = row['Shared Images'].split('\n');
      assert.equal(matched.length, 1);assert.equal(shared.length, 1);assert.equal(row.Images.split('\n').length, 2);
      for (const file of [...matched, ...shared]) {
        assert(entries[file]);assert(file.includes(row['Variant ID']));assert(file.includes(row['Design ID']));assert(file.includes(`-cost-${row.Price}-`));
        const mapping = imageMap.find(image => image.File === file);assert(mapping);assert.equal(mapping['Variant ID'], row['Variant ID']);assert.equal(mapping.Price, row.Price);
        assert.equal(mapping.Role, matched.includes(file) ? 'matched' : 'shared');
        assert.equal(mapping['Source URLs'], imageUrl(matched.includes(file) ? row.Design : 'shared'));
      }
      const pixel = await page.evaluate(async data => {const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(data), c=>c.charCodeAt(0))]));const canvas=new OffscreenCanvas(320,240),context=canvas.getContext('2d');context.drawImage(bitmap,0,0);const rgb=[...context.getImageData(1,1,1,1).data].slice(0,3);bitmap.close();return rgb;}, entries[matched[0]].toString('base64'));
      const rgb = designColors[row.Design].slice(1).match(/../g).map(value => parseInt(value,16));
      assert(pixel.every((value,index) => Math.abs(value-rgb[index]) < 8), 'Known photos from other designs must not be relabelled');
    }
    const c1 = rows.filter(row => row.Design === 'C1');assert.deepEqual(new Set(c1.map(row => row.Price)), new Set(['$5.25','$6.89']));assert.equal(new Set(c1.map(row=>row['Design ID'])).size,1);
    assert.notEqual(rows.find(row=>row.Design==='C1'&&row.Price==='$6.89')['Variant ID'], rows.find(row=>row.Design==='C4'&&row.Price==='$6.89')['Variant ID']);
    assert.equal(imageMap.length,24);
    if(process.env.VARIANT_EXAMPLE_OUTPUT)console.log(`Fixture example archive: ${result.path}`);
  } finally {await page.close();}
});

test('variant identities survive row order, price changes and sanitised-label collisions', () => {
  const product = {productId:'123'};
  const options = [{name:'Color',value:'C1',propertyId:'14',id:'1'}, {name:'Size',value:'20 cm',propertyId:'5',id:'20'}];
  const first = variantMetadata(product, {displayedPrice:'$6.89'}, options);
  const again = variantMetadata(product, {displayedPrice:'$7.99'}, options.slice().reverse());
  assert.equal(first['Variant ID'],again['Variant ID']);assert.equal(first['Design ID'],again['Design ID']);
  assert.notEqual(first['Variant ID'],variantMetadata({productId:'124'}, {}, options)['Variant ID']);
  assert.notEqual(variantMetadata(product, {}, [{name:'Design',value:'A/B'}])['Variant ID'],variantMetadata(product, {}, [{name:'Design',value:'A:B'}])['Variant ID']);
});

test('unconfirmed catalog options keep a blank price and cannot claim a confirmed selection', async () => {
  const product={productId:'4148',sourceUrl:'https://www.aliexpress.com/item/4148.html',title:'Unconfirmed fixture',images:[],properties:[{id:'14',name:'Color',values:[{id:'1',name:'C1'}]},{id:'5',name:'Size',values:[{id:'20',name:'without hoop'}]}],variations:[{attributes:'14:1;5:20',name:'Color: C1 / Size: without hoop',price:{currency:'USD',value:'999.00'},displayedPrice:null}],prices:{mode:'visible-variation'},warnings:[]};
  const result=await makeArchive(product,directory,{get:async()=>{throw new Error('No images expected');}});
  const [headers,values]=await archiveTable(result.path),row=Object.fromEntries(headers.map((key,index)=>[key,values[index]]));
  assert.equal(row.Price,'');assert.equal(row['Price Status'],'unconfirmed');assert.equal(row['Option Status'],'catalog-only');assert.equal(row.Design,'C1');assert.equal(row['Hoop / Pack'],'without hoop');
});


test('stale catalog SKU markers cannot drop the selected 20cm hoop rows for any design', async () => {
  const {page,product}=await capture('9249',fixed,false,{staleSku:'C1-20'});
  try {
    const confirmed=product.variations.filter(variant=>variant.displayedPrice);
    assert.equal(confirmed.length,12,'Every design must retain both observed hoop options despite a stale SKU marker');assert.deepEqual(product.prices.captureCoverage,{confirmed:12,observed:12,complete:true});
    for(const design of Object.keys(fixed)) {
      const rows=confirmed.filter(variant=>variant.observedOptions.some(option=>option.name==='Color'&&option.value===design));
      assert.deepEqual(new Set(rows.map(row=>row.observedOptions.find(option=>option.name==='Size').value)),new Set(['without hoop','with 20cm hoop']));
      for(const row of rows)assert.equal(row.displayedPrice,fixed[design].find(size=>size.label===row.observedOptions.find(option=>option.name==='Size').value).price);
    }
    const result=await makeArchive(product,directory,{get:async()=>{throw new Error('No fixture image response');}});
    const table=await archiveTable(result.path),rows=table.slice(1).map(values=>Object.fromEntries(table[0].map((key,index)=>[key,values[index]])));
    assert.equal(rows.length,12);assert.equal(rows.filter(row=>row.Size==='with 20cm hoop').length,6);
    assert(rows.every(row=>row['Price Status']==='confirmed-visible'&&row['Option Status']==='confirmed-selected'));
  }finally{await page.close();}
});


test('a 20cm hoop option that appears after the first stable price is still discovered',async()=>{
  const {page,product}=await capture('9349',{C1:fixed.C1},false,{lateHoopMs:450});
  try{
    const rows=product.variations.filter(variant=>variant.displayedPrice);
    assert.equal(rows.length,2,'Rescan actual size controls before declaring the option graph exhausted');assert.deepEqual(product.prices.captureCoverage,{confirmed:2,observed:2,complete:true});
    assert(rows.some(variant=>variant.observedOptions.some(option=>option.value==='with 20cm hoop')&&variant.displayedPrice==='$6.89'));
  }finally{await page.close();}
});


test('an observed 20cm hoop option is retained with a blank price when freshness cannot be confirmed',async()=>{
  const {page,product}=await capture('9449',{C1:fixed.C1},false,{unpricedHoop:true});
  try{
    const unknown=product.variations.find(variant=>variant.observedOptions?.some(option=>option.value==='with 20cm hoop'));
    assert(unknown,'Do not drop the actual selected hoop just because its price is unknown');assert.equal(unknown.displayedPrice,null);
    assert.deepEqual(product.prices.captureCoverage,{confirmed:1,observed:2,complete:false});
    const result=await makeArchive(product,directory,{get:async()=>{throw new Error('No fixture image response');}});
    assert.equal(result.captureComplete,false);const table=await archiveTable(result.path),rows=table.slice(1).map(values=>Object.fromEntries(table[0].map((key,index)=>[key,values[index]])));
    const row=rows.find(row=>row.Size==='with 20cm hoop');assert(row);assert.equal(row.Price,'');assert.equal(row['Price Status'],'unconfirmed');assert.equal(row['Option Status'],'confirmed-selected');
  }finally{await page.close();}
});
