const {app}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
app.setAppPath(path.resolve(__dirname,'..'));
app.setPath('userData',process.env.E2E_DATA);
app.on('ready',()=>app.setPath('userData',process.env.E2E_DATA));
const {Browser}=require('../src/browser');
global.failureFixture={successful:new Set(['3']),seen:[],blocked:false,release:null};
Browser.prototype.extract=async(item,settings)=>{
  const fixture=global.failureFixture;fixture.seen.push(item.productId);
  if(fixture.blocked)await new Promise(resolve=>{fixture.release=resolve;});
  if(!fixture.successful.has(item.productId))throw new Error(`Product ${item.productId} unavailable: fixture navigation failed`);
  const file=path.join(settings.output,`fixture-${item.productId}.zip`);await fs.writeFile(file,'synthetic archive sentinel');
  return {productId:item.productId,title:`Fixture product ${item.productId}`,path:file,warnings:[],images:0,capturedAt:new Date().toISOString()};
};
require('../src/main');
