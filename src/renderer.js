const $=id=>document.getElementById(id);
let settings,state,installation,activeTab='bulk',framePending=false,downloadLimit=24,itemLimit=150,failureLimit=50,view='grid',lastLatest=null,lastRunError='';
let updateState={status:'idle',currentVersion:'1.4.8',totalBytes:0,downloadedBytes:0,canRestart:false};
const downloadCache=new Map(),rowCache=new Map(),failureCache=new Map();
const linkGrid=window.LinkGrid.create({body:$('linkRows'),summary:$('linkCount'),onChange:({rows})=>{const select=$('rowCount'),custom=$('customRowCount');if([15,20,30].includes(rows)){select.value=String(rows);custom.hidden=true;}else{custom.hidden=false;custom.textContent=String(rows);select.value='custom';}}});
$('addRows').onclick=()=>linkGrid.addRows(10);
$('clearLinks').onclick=()=>linkGrid.clear();
$('rowCount').onchange=event=>{if(event.target.value!=='custom')linkGrid.setRows(Number(event.target.value));};
function importTextLinks(){const text=$('urls').value;if(!text.trim())return 0;const count=linkGrid.importText(text);$('urls').value='';notice(`${count} links added to rows.`);return count;}
$('importLinks').onclick=importTextLinks;
async function call(name,value) {return window.desktop.call(name,value);}
function error(e){$('error').textContent=e.message||String(e);$('error').hidden=false;}
function notice(message){$('notice').textContent=message;$('notice').hidden=!message;}
function tab(name){if(!['bulk','progress','downloads','failed','settings'].includes(name))return;activeTab=name;$('workspaceTitle').textContent=({bulk:'Bulk Links',progress:'Progress',downloads:'Downloads',failed:'Failed Links',settings:'Settings'})[name];for(const node of document.querySelectorAll('.panel'))node.hidden=node.id!==name;for(const node of document.querySelectorAll('.tab')){node.classList.toggle('active',node.dataset.tab===name);if(node.dataset.tab===name)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');}$('workspaceScroll').scrollTop=0;if(state)paint();}
function el(tag,text,cls){const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;}
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(svg.namespaceURI,'use');svg.classList.add('icon');svg.setAttribute('aria-hidden','true');use.setAttribute('href',`icons.svg#${name}`);svg.append(use);return svg;}
function command(label,name,action,classes='secondary'){const button=el('button',null,classes);button.append(icon(name),document.createTextNode(label));button.onclick=()=>Promise.resolve().then(action).catch(error);return button;}
function empty(message,name='folder-down'){const node=el('div',null,'empty');node.append(icon(name),el('span',message));return node;}
function reconcile(parent,nodes){let next=parent.firstElementChild;for(const node of nodes){if(node===next)next=next.nextElementSibling;else parent.insertBefore(node,next);}while(next){const remove=next;next=next.nextElementSibling;remove.remove();}}
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
  if(data.detailsPreview?.length){const wrap=el('div',null,'data-preview-table-wrap'),table=el('table',null,'data-preview-table'),head=el('thead'),header=el('tr'),body=el('tbody');for(const title of ['Design','Size / Hoop','Price','Variant ID']){const cell=el('th',title);cell.scope='col';header.append(cell);}head.append(header);for(const row of data.detailsPreview.slice(0,5)){const tr=el('tr');for(const key of ['design','size','price','variantId'])tr.append(el('td',row[key]??''));body.append(tr);}table.append(el('caption','First extracted variations · full list is in the exported files'),head,body);wrap.append(table);details.append(wrap);}
  return details;
}
function bytesLabel(value){const bytes=Number(value)||0;return bytes<1024*1024?`${(bytes/1024).toFixed(0)} KB`:`${(bytes/(1024*1024)).toFixed(1)} MB`;}
function renderUpdate(value){
  if(value&&typeof value==='object')updateState={...updateState,...value};
  const u=updateState,busy=['checking','downloading'].includes(u.status),waiting=!!state?.running;
  $('appVersion').textContent=`Version ${u.currentVersion||'1.4.8'}`;$('runningVersion').textContent=u.currentVersion||'1.4.8';
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

function render(s){state=s;if(framePending)return;framePending=true;requestAnimationFrame(()=>{framePending=false;paint();});}
function paint(){
  const s=state;if(!s)return;
  if(s.error)error(new Error(s.error));else if(lastRunError)$('error').hidden=true;lastRunError=s.error||'';
  const done=s.items.filter(i=>i.status==='done').length,failed=s.items.filter(i=>i.status==='failed').length;
  const pending=s.items.filter(i=>['pending','running','waiting'].includes(i.status)).length;
  const percent=s.items.length?Math.round(100*(done+failed)/s.items.length):0;
  const status=s.paused?'Paused':s.waiting?'Waiting':s.running?'Running':'Idle';
  $('queueCount').textContent=pending;$('downloadCount').textContent=s.downloads.length;
  $('failedCount').textContent=failed;$('failedCount').classList.toggle('has-failures',failed>0);
  $('failedSummary').textContent=`${failed} failed links`;
  $('retryFailures').disabled=s.running||!failed;
  for(const id of ['copyFailures','exportFailures','clearFailures'])$(id).disabled=!failed;
  $('statQueued').textContent=pending;$('statDone').textContent=s.downloads.length;$('statFailed').textContent=failed;
  $('bar').style.width=percent+'%';$('bar').parentElement.setAttribute('aria-valuenow',String(percent));$('progressPercent').textContent=percent+'%';
  $('runStatus').textContent=status;$('runStatus').dataset.state=status.toLowerCase();$('footerStatus').textContent=status;
  $('summary').textContent=`${status} · ${done} complete · ${failed} failed · ${pending} remaining · ${s.activeTabs||0} active tabs`;
  $('progressCaption').textContent=s.running?`${pending} products remaining in this run.`:s.items.length?`${done} products complete.`:'Your queue is ready.';
  $('activityCount').textContent=(s.items.length-failed)+' products';
  $('pause').disabled=!s.running||s.paused;$('resume').disabled=!s.paused;$('retry').disabled=s.running||!failed;
  $('clear').disabled=s.running;$('run').disabled=s.running;$('saveSettings').disabled=s.running;
  $('chooseFolder').disabled=s.running;
  $('manageInstallation').disabled=s.running||!installation?.installed;$('clearRecords').disabled=!s.downloads.length;
  $('historyCount').textContent=s.downloads.length+' saved archives';
  $('manual').hidden=!s.waiting;$('manualText').textContent=s.waiting||'';
  if(s.browser){$('browserStatus').dataset.visible=String(s.browser.visible);$('browserStatus').lastChild.textContent=s.browser.visible?'Browser visible':s.browser.open?'Browser hidden':'Browser closed';}
  notice(s.message||'');renderUpdate();renderLatest(s.downloads[0],s.running);
  if(activeTab==='bulk')linkGrid.syncQueue(s.items);
  if(activeTab==='progress')renderItems();
  if(activeTab==='downloads')renderDownloads();
  if(activeTab==='failed')renderFailures();
}
function renderLatest(latest,running){
  $('latestExport').hidden=!latest;$('bulkLatest').hidden=!latest;$('bulkLatestEmpty').hidden=!!latest;
  $('latestMessage').textContent=running?'Saved to your output folder.':'Saved locally.';
  const key=latest?latest.path+'|'+(latest.previewRepairVersion||0):null;
  if(key===lastLatest)return;lastLatest=key;
  $('latestDataPreview').replaceChildren();$('bulkLatestPhoto').replaceChildren();
  if(!latest)return;
  $('latestTitle').textContent=latest.title||latest.productId;$('bulkLatestTitle').textContent=latest.title||latest.productId;
  $('bulkLatestMeta').textContent=`${latest.images||0} JPEGs · ${latest.rowCount||0} variations`;
  if(latest.preview?.startsWith('data:image/')){const img=el('img');img.src=latest.preview;img.alt=latest.title||'Product photo';img.decoding='async';$('bulkLatestPhoto').append(img);}else $('bulkLatestPhoto').append(icon('image'));
  const details=dataPreview(latest);if(details)$('latestDataPreview').append(details);
}
function renderItems(){
  const records=state.items.filter(item=>item.status!=='failed'),nodes=[],ids=new Set(records.map(item=>item.id));
  for(const id of rowCache.keys())if(!ids.has(id))rowCache.delete(id);
  for(const [index,item] of records.slice(0,itemLimit).entries()){
    const signature=JSON.stringify([item.status,item.title,item.url,item.error,item.attempts,item.warnings]);let cached=rowCache.get(item.id);
    if(!cached||cached.signature!==signature){
      const row=el('div',null,'row'),leading=el('div',null,'row-leading'),content=el('div',null,'row-content');row.dataset.state=item.status;leading.dataset.state=item.status;
      const symbol=({running:'loader-circle',waiting:'shield-alert',done:'check',failed:'circle-alert'})[item.status];if(symbol)leading.append(icon(symbol));else leading.textContent=String(index+1).padStart(2,'0');
      content.append(el('div',item.title||item.url,'row-title'),el('small',item.error||`Product ${item.productId} · Attempt ${item.attempts||0}${item.warnings?` · ${item.warnings} warnings`:''}`));
      row.append(leading,content,el('span',item.status,'status '+item.status));cached={signature,node:row};rowCache.set(item.id,cached);
    }
    nodes.push(cached.node);
  }
  if(!nodes.length)nodes.push(empty('No products in this queue.','list-plus'));
  reconcile($('items'),nodes);$('moreItems').hidden=records.length<=itemLimit;
}
async function retryFailures(ids=null){const retried=await call('retry-failed',ids);if(retried?.length){tab('progress');await call('run');}}
async function copyFailures(ids=null){const count=await call('copy-failed',ids);if(count)notice(`${count} failed links copied.`);}
function failureRow(item){
  const row=el('article',null,'failure-row'),leading=el('div',null,'row-leading'),content=el('div',null,'failure-content'),actions=el('div',null,'failure-actions');row.dataset.failureId=item.id;leading.dataset.state='failed';leading.append(icon('circle-alert'));
  content.append(el('h2',item.title||`Product ${item.productId}`),el('p',item.url,'failure-url'),el('p',item.error||'Extraction failed.','failure-error'));
  const date=Date.parse(item.failedAt);content.append(el('small',`Attempt ${item.attempts||0}${Number.isNaN(date)?'':` · ${new Date(date).toLocaleString()}`}`));
  const retry=command('','rotate-ccw',()=>retryFailures([item.id]),'icon-button secondary');retry.disabled=state.running;
  const copy=command('','copy',()=>copyFailures([item.id]),'icon-button secondary');
  const remove=command('','trash-2',()=>call('delete-failed',[item.id]),'icon-button secondary danger');
  for(const [button,label] of [[retry,'Retry link'],[copy,'Copy link'],[remove,'Remove failed link']]){button.setAttribute('aria-label',label);button.dataset.tooltip=button===retry&&state.running?'Retry after the current run finishes':label;actions.append(button);}
  row.append(leading,content,actions);return row;
}
function renderFailures(){
  const query=$('failedSearch').value.trim().toLocaleLowerCase(),all=state.items.filter(item=>item.status==='failed');
  const records=all.filter(item=>!query||[item.title,item.productId,item.url,item.error].some(value=>String(value||'').toLocaleLowerCase().includes(query))).reverse();
  const ids=new Set(all.map(item=>item.id));for(const id of failureCache.keys())if(!ids.has(id))failureCache.delete(id);
  const visible=records.slice(0,failureLimit),nodes=visible.map(item=>{const signature=JSON.stringify([item.title,item.url,item.productId,item.error,item.attempts,item.failedAt,state.running]);let cached=failureCache.get(item.id);if(!cached||cached.signature!==signature){cached={signature,node:failureRow(item)};failureCache.set(item.id,cached);}return cached.node;});
  if(!nodes.length)nodes.push(empty(query?'No matching failed links.':'No failed links.',query?'search':'folder-x'));
  reconcile($('failedList'),nodes);$('moreFailures').hidden=records.length<=failureLimit;$('failedResults').textContent=records.length?`${visible.length} of ${records.length} links`:'';
}
function archiveSignature(d){return JSON.stringify([d.title,d.productId,d.exportFormat,d.capturedAt,d.images,d.previewRepairVersion,d.rowCount,d.preview?.length]);}
function downloadCard(d){
  const card=el('article',null,'download-card'),actions=el('div',null,'download-actions'),preview=el('div',null,'preview'),body=el('div',null,'download-body');card.dataset.archivePath=d.path;
  const badge=/xlsx/.test(d.exportFormat||'')?(d.exportFormat==='product-xlsx-jpeg-v9'?'Excel + JPEG':'Earlier Excel + JPEG'):'Earlier archive';
  const remove=command('','trash-2',async()=>{if(await call('delete-record',d.path))linkGrid.resetResults(d.productId);},'icon-button danger');
  remove.setAttribute('aria-label','Delete record');remove.dataset.tooltip='Delete record; keep ZIP';actions.append(el('span',badge,'badge'),remove);
  if(d.preview?.startsWith('data:image/')){const image=el('img');image.src=d.preview;image.alt=d.title||'Product image';image.decoding='async';image.loading='lazy';preview.append(image);}else preview.append(icon('image'));
  const title=el('h3',d.title||d.productId);title.title=title.textContent;body.append(title);
  const prices=[...new Set((d.detailsPreview||[]).map(row=>row.price).filter(Boolean))];if(prices.length)body.append(el('div',prices.slice(0,3).join(' / '),'download-price'));
  const meta=el('div',null,'download-meta');meta.append(icon('image'),el('span',`${d.images||0} JPEGs${d.rowCount!=null?` · ${d.rowCount} variations`:''}${d.warnings?.length?` · ${d.warnings.length} warnings`:''}`));body.append(meta);
  body.append(el('p',Number.isNaN(Date.parse(d.capturedAt))?'':new Date(d.capturedAt).toLocaleString(),'download-time'));
  const details=dataPreview(d);if(details)body.append(details);
  const location=el('details',null,'archive-location');location.append(el('summary','File location'),el('p',d.path));body.append(location,command('Open folder','folder-open',()=>call('show',d.path)));
  if(d.warnings?.length){const warnings=el('details');warnings.append(el('summary','View warnings'));for(const warning of d.warnings)warnings.append(el('p',warning));body.append(warnings);}
  card.append(actions,preview,body);return card;
}
function renderDownloads(){
  const query=$('downloadSearch').value.trim().toLocaleLowerCase(),sort=$('downloadSort').value;
  let records=state.downloads.filter(d=>!query||[d.title,d.productId].some(value=>String(value||'').toLocaleLowerCase().includes(query)));
  if(sort==='oldest')records=[...records].reverse();else if(sort==='title')records=[...records].sort((a,b)=>String(a.title||a.productId).localeCompare(String(b.title||b.productId)));
  const ids=new Set(state.downloads.map(d=>d.path));for(const id of downloadCache.keys())if(!ids.has(id))downloadCache.delete(id);
  const visible=records.slice(0,downloadLimit),nodes=visible.map(record=>{const signature=archiveSignature(record);let cached=downloadCache.get(record.path);if(!cached||cached.signature!==signature){cached={signature,node:downloadCard(record)};downloadCache.set(record.path,cached);}return cached.node;});
  if(!nodes.length)nodes.push(empty(query?'No matching products.':'No saved archives yet.',query?'search':'folder-down'));
  reconcile($('downloadList'),nodes);$('moreDownloads').hidden=records.length<=downloadLimit;
  $('downloadResults').textContent=records.length?`${visible.length} of ${records.length} archives`:'';
}
function applySettings(value){settings=value;$('folderLabel').textContent=value.output;$('folderLabel').title=value.output;$('skipDuplicates').checked=value.skipDuplicates;$('delay').value=value.delayMs/1000;$('settle').value=value.settleMs/1000;$('parallelTabs').value=value.parallelTabs||3;$('backgroundBrowser').checked=value.backgroundBrowser!==false;$('keepRunningInBackground').checked=value.keepRunningInBackground!==false;$('defaultTabs').textContent=`${value.parallelTabs||3} parallel tabs`;$('defaultDuplicates').textContent=value.skipDuplicates?'Skip saved':'Allow repeats';}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
document.querySelectorAll('[data-open-tab]').forEach(button=>button.onclick=()=>tab(button.dataset.openTab));
document.querySelector('.brand').onclick=event=>{event.preventDefault();tab('bulk');};
$('importToggle').onclick=()=>{$('bulkPaste').open=!$('bulkPaste').open;if($('bulkPaste').open)$('urls').focus();};
$('moreItems').onclick=()=>{itemLimit+=150;renderItems();};
$('moreDownloads').onclick=()=>{downloadLimit+=24;renderDownloads();};
$('moreFailures').onclick=()=>{failureLimit+=50;renderFailures();};
$('failedSearch').oninput=()=>{failureLimit=50;renderFailures();};
$('retryFailures').onclick=()=>retryFailures().catch(error);
$('copyFailures').onclick=()=>copyFailures().catch(error);
$('exportFailures').onclick=()=>call('export-failed').then(saved=>{if(saved)notice('Failed links exported.');}).catch(error);
$('clearFailures').onclick=()=>call('delete-failed').catch(error);
for(const id of ['downloadSearch','downloadSort'])$(id).addEventListener(id==='downloadSearch'?'input':'change',()=>{downloadLimit=24;renderDownloads();});
for(const [id,value] of [['gridView','grid'],['listView','list']])$(id).onclick=()=>{view=value;$('downloadList').classList.toggle('list-mode',view==='list');for(const [button,mode] of [['gridView','grid'],['listView','list']]){$(button).classList.toggle('active',view===mode);$(button).setAttribute('aria-pressed',String(view===mode));}};
const tooltip=$('tooltip');
function hideTooltip(){tooltip.hidden=true;}
function showTooltip(target){if(!target)return;tooltip.textContent=target.dataset.tooltip;tooltip.hidden=false;const rect=target.getBoundingClientRect();tooltip.style.left=Math.max(8,Math.min(innerWidth-tooltip.offsetWidth-8,rect.left+rect.width/2-tooltip.offsetWidth/2))+'px';tooltip.style.top=(rect.bottom+tooltip.offsetHeight+16>innerHeight?rect.top-tooltip.offsetHeight-8:rect.bottom+8)+'px';}
document.addEventListener('pointerover',event=>showTooltip(event.target.closest('[data-tooltip]')));
document.addEventListener('pointerout',hideTooltip);document.addEventListener('focusin',event=>showTooltip(event.target.closest('[data-tooltip]')));document.addEventListener('focusout',hideTooltip);$('workspaceScroll').addEventListener('scroll',hideTooltip,{passive:true});
async function showBrowser(){const buttons=[$('openBrowser'),$('showManualBrowser')];buttons.forEach(button=>button.disabled=true);notice('Showing Chromium with your saved login session.');try{await call('browser');}catch(e){error(e);}finally{buttons.forEach(button=>button.disabled=false);}}
$('openBrowser').onclick=showBrowser;$('showManualBrowser').onclick=showBrowser;
$('hideBrowser').onclick=()=>call('hide-browser').then(()=>notice('Chromium is hidden. Your login and extraction session stay active.')).catch(error);
$('manageInstallation').onclick=async()=>{const button=$('manageInstallation');button.disabled=true;try{await call('uninstall');notice('The Windows uninstaller has started. The app will close.');}catch(e){error(e);button.disabled=!installation?.installed||!!state?.running;}};
$('hideApp').onclick=()=>call('hide-app').catch(error);
$('chooseFolder').onclick=()=>call('folder').then(applySettings).catch(error);
$('showLatest').onclick=$('bulkLatestShow').onclick=()=>{const latest=state?.downloads[0];if(latest)call('show',latest.path).catch(error);};
$('clearRecords').onclick=async()=>{try{const ids=state.downloads.map(d=>d.productId);if(await call('clear-downloads')){for(const id of ids)linkGrid.resetResults(id);$('error').hidden=true;}}catch(e){error(e);}};
$('saveSettings').onclick=()=>call('settings',{skipDuplicates:$('skipDuplicates').checked,backgroundBrowser:$('backgroundBrowser').checked,keepRunningInBackground:$('keepRunningInBackground').checked,parallelTabs:Number($('parallelTabs').value),delayMs:Number($('delay').value)*1000,settleMs:Number($('settle').value)*1000}).then(v=>{applySettings(v);notice('Settings saved.');}).catch(error);
$('run').onclick=async()=>{const button=$('run');button.disabled=true;try{$('error').hidden=true;importTextLinks();const entries=linkGrid.entries();let pending=state?.items.some(item=>item.status==='pending');if(entries.length){const results=await call('add',entries.map(entry=>entry.value).join('\n'));linkGrid.markResults(entries,results);pending=pending||results.some(result=>result.status==='pending');const invalid=results.filter(result=>result.status==='invalid');if(invalid.length)error(new Error(invalid.map(result=>`${result.url}: ${result.error}`).join('\n')));notice(`${results.filter(result=>result.status==='pending').length} links added · ${results.filter(result=>result.status==='duplicate').length} duplicates skipped.`);}if(!pending)return;tab('progress');await call('run');}catch(e){error(e);}finally{button.disabled=!!state?.running;}};
for(const name of ['pause','resume','continue','clear'])$(name).onclick=()=>call(name).catch(error);
$('retry').onclick=async()=>{try{await call('retry');await call('run');}catch(e){error(e);}};
for(const [button,action] of [['checkUpdates','update-check'],['downloadUpdate','update-download'],['restartUpdate','update-restart']])$(button).onclick=async()=>{const control=$(button);control.disabled=true;try{$('error').hidden=true;const result=await call(action);if(result)renderUpdate(result);}catch(e){error(e);}finally{renderUpdate();}};
window.desktop.onState(render);
window.desktop.onUpdate?.(renderUpdate);
call('initial').then(v=>{installation=v.installation;$('installationStatus').textContent=installation?.installed?'Installed on Windows.':'Portable copy.';applySettings(v.settings);render(v.state);renderUpdate(v.update||v.updateState);}).catch(error);
