const $=id=>document.getElementById(id);
let settings, state, installation, updateState={status:'idle',currentVersion:'1.4.1',totalBytes:0,downloadedBytes:0,canRestart:false};
const linkGrid=window.LinkGrid.create({body:$('linkRows'),summary:$('linkCount'),onChange:({rows})=>{const select=$('rowCount'),custom=$('customRowCount');if([15,20,30].includes(rows)){select.value=String(rows);custom.hidden=true;}else{custom.hidden=false;custom.textContent=String(rows);select.value='custom';}}});
$('addRows').onclick=()=>linkGrid.addRows(10);
$('clearLinks').onclick=()=>linkGrid.clear();
$('rowCount').onchange=event=>{if(event.target.value!=='custom')linkGrid.setRows(Number(event.target.value));};
function importTextLinks(){const text=$('urls').value;if(!text.trim())return 0;const count=linkGrid.importText(text);$('urls').value='';notice(`${count} links added to rows.`);return count;}
$('importLinks').onclick=importTextLinks;
async function call(name,value) {return window.desktop.call(name,value);}
function error(e){$('error').textContent=e.message||String(e);$('error').hidden=false;}
function notice(message){$('notice').textContent=message;$('notice').hidden=!message;}
function tab(name){$('workspaceTitle').textContent=({bulk:'Bulk Links',progress:'Progress',downloads:'Downloads',settings:'Settings'})[name]||name;for(const el of document.querySelectorAll('.panel')) el.hidden=el.id!==name;for(const el of document.querySelectorAll('.tab')) el.classList.toggle('active',el.dataset.tab===name);}
function el(tag,text,cls){const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;}
function dataPreview(data){
  const description=data.descriptionFull||data.descriptionPreview||'',seller=data.sellerDescriptionFull||data.sellerDescriptionPreview||'';
  if(data.rowCount==null&&!description&&!seller&&!data.detailsPreview?.length)return null;
  const details=el('details',null,'data-preview');details.append(el('summary','Preview extracted data'));
  const counts=[];for(const [key,label] of [['rowCount','variation rows'],['featureCount','features'],['specificationCount','specifications']])if(data[key]!=null)counts.push(`${data[key]} ${label}`);
  if(counts.length)details.append(el('p',counts.join(' · '),'data-preview-counts'));
  if(data.title)details.append(el('strong','Product title'),el('p',data.title,'data-preview-description'));
  if(description){details.append(el('strong','Description'),el('p',description,'data-preview-description'));if(data.descriptionTruncated)details.append(el('p','The preview is shortened. Open product.xlsx for the complete exported text.','data-preview-counts'));}
  if(seller){details.append(el('strong','Seller description'),el('p',seller,'data-preview-description'));if(data.sellerDescriptionTruncated)details.append(el('p','The seller preview is shortened. Open the exported file for the complete text.','data-preview-counts'));}
  if(!description&&!seller)details.append(el('p','Description was not captured. Show Chromium to check that the product description has loaded, then retry this product. Missing text has not been invented.','data-warning'));
  for(const [key,title] of [['featuresPreview','Features'],['specificationsPreview','Specifications']])if(data[key])details.append(el('strong',title),el('p',data[key],'data-preview-description'));
  if(data.detailsPreview?.length){const wrap=el('div',null,'data-preview-table-wrap'),table=el('table',null,'data-preview-table'),head=el('thead'),header=el('tr'),body=el('tbody');for(const title of ['Variation','Price','Size','Color']){const cell=el('th',title);cell.scope='col';header.append(cell);}head.append(header);for(const row of data.detailsPreview.slice(0,5)){const tr=el('tr');for(const key of ['variation','price','size','color'])tr.append(el('td',row[key]??''));body.append(tr);}table.append(el('caption','First extracted variations · full list is in the exported files'),head,body);wrap.append(table);details.append(wrap);}
  return details;
}
function bytesLabel(value){const bytes=Number(value)||0;return bytes<1024*1024?`${(bytes/1024).toFixed(0)} KB`:`${(bytes/(1024*1024)).toFixed(1)} MB`;}
function renderUpdate(value){
  if(value&&typeof value==='object')updateState={...updateState,...value};
  const u=updateState,busy=['checking','downloading'].includes(u.status),waiting=!!state?.running;
  $('appVersion').textContent=`Version ${u.currentVersion||'1.4.1'}`;
  const messages={idle:'Ready to check for updates.',checking:'Checking GitHub for a compatible small update…',available:`Version ${u.availableVersion||''} is available.`,downloading:'Downloading the small app update…',ready:'Update downloaded and verified. Restart when your current run finishes.', 'up-to-date':'You have the latest compatible app version.',incompatible:'This update needs a new browser or app runtime. Download the full package from GitHub.',error:'The update could not be completed. Check your connection and try again.'};
  $('updateStatus').textContent=u.message||messages[u.status]||messages.idle;
  $('updateStatus').classList.toggle('update-error',u.status==='error');
  $('checkUpdates').disabled=busy;
  $('downloadUpdate').disabled=u.status!=='available'||busy;
  $('restartUpdate').disabled=!(u.canRestart||u.status==='ready')||waiting||busy;
  $('restartUpdate').title=waiting?'Wait for the current run to finish before restarting.':'';
  const total=Number(u.totalBytes)||0,downloaded=Number(u.downloadedBytes)||0;
  $('updateProgress').hidden=u.status!=='downloading';
  if(total>0)$('updateProgress').value=Math.min(100,100*downloaded/total);else $('updateProgress').removeAttribute('value');
  $('updateSize').hidden=!(total||downloaded);
  $('updateSize').textContent=u.status==='downloading'?`${bytesLabel(downloaded)}${total?` of ${bytesLabel(total)}`:''}`:total?`Small update size: ${bytesLabel(total)}`:'';
}

function render(s){
  state=s; linkGrid.syncQueue(s.items); const done=s.items.filter(i=>i.status==='done').length, failed=s.items.filter(i=>i.status==='failed').length;
  const pending=s.items.filter(i=>['pending','running'].includes(i.status)).length;
  $('queueCount').textContent=pending;$('downloadCount').textContent=s.downloads.length;$('statQueued').textContent=pending;$('statDone').textContent=s.downloads.length;$('statFailed').textContent=failed;
  $('bar').style.width=`${s.items.length?100*(done+failed)/s.items.length:0}%`;
  $('summary').textContent=`${s.paused?'Paused':s.running?'Running':'Idle'} · ${done} complete · ${failed} failed · ${pending} remaining`;
  $('pause').disabled=!s.running||s.paused;$('resume').disabled=!s.paused;$('retry').disabled=s.running||!failed;$('clear').disabled=s.running;$('run').disabled=s.running;$('saveSettings').disabled=s.running;$('manageInstallation').disabled=s.running||!installation?.windows;renderUpdate();
  $('manual').hidden=!s.waiting;$('manualText').textContent=s.waiting||'';
  const latest=s.downloads[0];$('latestExport').hidden=!latest;$('latestTitle').textContent=latest?.title||latest?.productId||'';$('latestMessage').textContent=s.running?'This ZIP is saved. The remaining products continue in the same Chromium session.':'Saved locally. All completed ZIPs are available in Downloads.';
  const latestPanel=$('latestDataPreview'),latestOpen=latestPanel.dataset.archivePath===latest?.path&&!!latestPanel.querySelector('details')?.open;latestPanel.replaceChildren();const latestPreview=latest?dataPreview(latest):null;if(latestPreview){latestPreview.open=latestOpen;latestPanel.append(latestPreview);}latestPanel.dataset.archivePath=latest?.path||'';latestPanel.hidden=!latestPreview;
  notice(s.message||'');
  $('items').replaceChildren();
  if(!s.items.length)$('items').append(el('p','Your queue is empty. Add links in Bulk Links.','empty'));
  for(const item of s.items){const row=el('div',null,'row'), content=el('div',null,'row-content');content.append(el('div',item.title||item.url,'row-title'),el('small',item.error||`Product ${item.productId} · Attempts: ${item.attempts}${item.warnings?` · ${item.warnings} warnings`:''}`));row.append(content,el('span',item.status,'status '+item.status));$('items').append(row);}
  const openPreviews=new Set([...$('downloadList').querySelectorAll('.download-card')].filter(card=>card.querySelector('.data-preview')?.open).map(card=>card.dataset.archivePath));
  $('downloadList').replaceChildren();
  if(!s.downloads.length)$('downloadList').append(el('div','Your completed Excel and JPEG product ZIPs will appear here.','empty'));
  s.downloads.forEach((d,index)=>{const card=el('article',null,'download-card'),preview=el('div',null,'preview');card.dataset.archivePath=d.path;if(d.preview?.startsWith('data:image/')){const img=el('img');img.src=d.preview;img.alt=d.title||'Product image';img.decoding='async';img.loading='lazy';preview.append(img);}else preview.textContent='No image available';const body=el('div',null,'download-body');body.append(el('span',d.exportFormat==='product-xlsx-jpeg-v4'?'Excel + JPEG':d.exportFormat==='product-csv-xlsx-jpeg-v3'?'Earlier Excel + CSV':d.exportFormat==='product-csv-jpeg-v2'?'Full product CSV + JPEG':d.exportFormat==='csv-jpeg-v1'?'CSV + JPEG':'Earlier archive','badge'),el('h3',d.title||d.productId),el('p',`${d.images} ${['csv-jpeg-v1','product-csv-jpeg-v2','product-csv-xlsx-jpeg-v3','product-xlsx-jpeg-v4'].includes(d.exportFormat)?'JPEG images':'images'} · ${(d.warnings||[]).length} warnings · ${new Date(d.capturedAt).toLocaleString()}`),el('p',d.path));const previewData=dataPreview(d);if(previewData){previewData.open=openPreviews.has(d.path);body.append(previewData);}const button=el('button','Show ZIP in folder','secondary');button.onclick=()=>call('show',index).catch(error);body.append(button);if(d.warnings?.length){const details=el('details');details.append(el('summary','View warnings'));for(const w of d.warnings)details.append(el('p',w));body.append(details);}card.append(preview,body);$('downloadList').append(card);});
}
function applySettings(value){settings=value;$('folderLabel').textContent=value.output;$('skipDuplicates').checked=value.skipDuplicates;$('delay').value=value.delayMs/1000;$('settle').value=value.settleMs/1000;$('backgroundBrowser').checked=value.backgroundBrowser!==false;$('keepRunningInBackground').checked=value.keepRunningInBackground!==false;}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
async function showBrowser(){const buttons=[$('openBrowser'),$('showManualBrowser')];buttons.forEach(button=>button.disabled=true);notice('Showing Chromium with your saved login session.');try{await call('browser');}catch(e){error(e);}finally{buttons.forEach(button=>button.disabled=false);}}
$('openBrowser').onclick=showBrowser;$('showManualBrowser').onclick=showBrowser;
$('hideBrowser').onclick=()=>call('hide-browser').then(()=>notice('Chromium is hidden. Your login and extraction session stay active.')).catch(error);
$('manageInstallation').onclick=()=>call('manage-installation').catch(error);
$('hideApp').onclick=()=>call('hide-app').catch(error);
$('chooseFolder').onclick=()=>call('folder').then(applySettings).catch(error);
$('showLatest').onclick=()=>call('show',0).catch(error);
$('saveSettings').onclick=()=>call('settings',{skipDuplicates:$('skipDuplicates').checked,backgroundBrowser:$('backgroundBrowser').checked,keepRunningInBackground:$('keepRunningInBackground').checked,delayMs:Number($('delay').value)*1000,settleMs:Number($('settle').value)*1000}).then(v=>{applySettings(v);notice('Settings saved.');}).catch(error);
$('run').onclick=async()=>{const button=$('run');button.disabled=true;try{$('error').hidden=true;importTextLinks();const entries=linkGrid.entries();if(entries.length){const results=await call('add',entries.map(entry=>entry.value).join('\n'));linkGrid.markResults(entries,results);const invalid=results.filter(result=>result.status==='invalid');if(invalid.length)error(new Error(invalid.map(result=>`${result.url}: ${result.error}`).join('\n')));notice(`${results.filter(result=>result.status==='pending').length} links added · ${results.filter(result=>result.status==='duplicate').length} duplicates skipped.`);}if(!state.items.some(item=>item.status==='pending'))return;tab('progress');await call('run');}catch(e){error(e);}finally{button.disabled=!!state?.running;}};
for(const name of ['pause','resume','continue','clear'])$(name).onclick=()=>call(name).catch(error);
$('retry').onclick=async()=>{try{await call('retry');await call('run');}catch(e){error(e);}};
for(const [button,action] of [['checkUpdates','update-check'],['downloadUpdate','update-download'],['restartUpdate','update-restart']])$(button).onclick=async()=>{const control=$(button);control.disabled=true;try{$('error').hidden=true;const result=await call(action);if(result)renderUpdate(result);}catch(e){error(e);}finally{renderUpdate();}};
window.desktop.onState(render);
window.desktop.onUpdate?.(renderUpdate);
call('initial').then(v=>{installation=v.installation;$('installationStatus').textContent=installation?.installed?'Installed on Windows. Remove the app from Windows Settings → Apps → Installed apps.':'Portable copy. Use the Setup installer to add Windows uninstall support, or Quit and delete the portable EXE.';applySettings(v.settings);render(v.state);renderUpdate(v.update||v.updateState);}).catch(error);
