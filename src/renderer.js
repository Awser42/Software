const $=id=>document.getElementById(id);
let settings, state;
async function call(name,value) {return window.desktop.call(name,value);}
function error(e){$('error').textContent=e.message||String(e);$('error').hidden=false;}
function notice(message){$('notice').textContent=message;$('notice').hidden=!message;}
function tab(name){for(const el of document.querySelectorAll('.panel')) el.hidden=el.id!==name;for(const el of document.querySelectorAll('.tab')) el.classList.toggle('active',el.dataset.tab===name);}
function el(tag,text,cls){const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;}
function render(s){
  state=s; const done=s.items.filter(i=>i.status==='done').length, failed=s.items.filter(i=>i.status==='failed').length;
  const pending=s.items.filter(i=>['pending','running'].includes(i.status)).length;
  $('queueCount').textContent=pending;$('downloadCount').textContent=s.downloads.length;$('statQueued').textContent=pending;$('statDone').textContent=s.downloads.length;$('statFailed').textContent=failed;
  $('bar').style.width=`${s.items.length?100*(done+failed)/s.items.length:0}%`;
  $('summary').textContent=`${s.paused?'Paused':s.running?'Running':'Idle'} · ${done} complete · ${failed} failed · ${pending} remaining`;
  $('pause').disabled=!s.running||s.paused;$('resume').disabled=!s.paused;$('retry').disabled=s.running||!failed;$('clear').disabled=s.running;$('run').disabled=s.running;$('saveSettings').disabled=s.running;
  $('manual').hidden=!s.waiting;$('manualText').textContent=s.waiting||'';
  const latest=s.downloads[0];$('latestExport').hidden=!latest;$('latestTitle').textContent=latest?.title||latest?.productId||'';$('latestMessage').textContent=s.running?'This ZIP is saved. The remaining products continue in the same Chromium session.':'Saved locally. All completed ZIPs are available in Downloads.';
  if(s.message)notice(s.message);
  $('items').replaceChildren();
  if(!s.items.length)$('items').append(el('p','Your queue is empty. Add links in Bulk Links.','empty'));
  for(const item of s.items){const row=el('div',null,'row'), content=el('div',null,'row-content');content.append(el('div',item.title||item.url,'row-title'),el('small',item.error||`Product ${item.productId} · Attempts: ${item.attempts}${item.warnings?` · ${item.warnings} warnings`:''}`));row.append(content,el('span',item.status,'status '+item.status));$('items').append(row);}
  $('downloadList').replaceChildren();
  if(!s.downloads.length)$('downloadList').append(el('div','Your completed product ZIPs will appear here.','empty'));
  s.downloads.forEach((d,index)=>{const card=el('article',null,'download-card'),preview=el('div',null,'preview');if(d.preview?.startsWith('data:image/')){const img=el('img');img.src=d.preview;img.alt=d.title||'Product image';preview.append(img);}else preview.textContent='No image available';const body=el('div',null,'download-body');body.append(el('h3',d.title||d.productId),el('p',`${d.images} images · ${d.warnings.length} warnings · ${new Date(d.capturedAt).toLocaleString()}`),el('p',d.path));const button=el('button','Show ZIP in folder','secondary');button.onclick=()=>call('show',index).catch(error);body.append(button);if(d.warnings.length){const details=el('details');details.append(el('summary','View warnings'));for(const w of d.warnings)details.append(el('p',w));body.append(details);}card.append(preview,body);$('downloadList').append(card);});
}
function applySettings(value){settings=value;$('folderLabel').textContent=value.output;$('skipDuplicates').checked=value.skipDuplicates;$('delay').value=value.delayMs/1000;$('settle').value=value.settleMs/1000;}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$('openBrowser').onclick=async()=>{const b=$('openBrowser');b.disabled=true;notice('Opening Chromium. The first launch downloads the browser.');try{await call('browser');}catch(e){error(e);}finally{b.disabled=false;}};
$('chooseFolder').onclick=()=>call('folder').then(applySettings).catch(error);
$('showLatest').onclick=()=>call('show',0).catch(error);
$('saveSettings').onclick=()=>call('settings',{skipDuplicates:$('skipDuplicates').checked,delayMs:Number($('delay').value)*1000,settleMs:Number($('settle').value)*1000}).then(v=>{applySettings(v);notice('Settings saved.');}).catch(error);
$('run').onclick=async()=>{try{$('error').hidden=true;const text=$('urls').value.trim();if(text){const results=await call('add',text);const invalid=results.filter(r=>r.status==='invalid');if(invalid.length)error(new Error(invalid.map(r=>`${r.url}: ${r.error}`).join('\n')));notice(`${results.filter(r=>r.status==='pending').length} links added · ${results.filter(r=>r.status==='duplicate').length} duplicates skipped.`);$('urls').value=invalid.map(r=>r.url).join('\n');}if(!state.items.some(i=>i.status==='pending'))return;tab('progress');await call('run');}catch(e){error(e);}};
for(const name of ['pause','resume','continue','clear'])$(name).onclick=()=>call(name).catch(error);
$('retry').onclick=async()=>{try{await call('retry');await call('run');}catch(e){error(e);}};
window.desktop.onState(render);
call('initial').then(v=>{applySettings(v.settings);render(v.state);}).catch(error);
