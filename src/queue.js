const fs = require('node:fs/promises');
const {EventEmitter} = require('node:events');
const {productKey, normalizedUrl, EXPORT_FORMAT} = require('./archive');
class Queue extends EventEmitter {
  constructor({extract, save = async () => {}, initial = {}}) {
    super(); this.extract = extract; this.save = save; this.items = initial.items || []; this.downloads = initial.downloads || [];
    this.running = false; this.paused = false; this.waiting = null; this.message = '';this.error='';this.manualRequests=new Map();this.verificationEpoch=0;
    for (const item of this.items) if (['running','waiting'].includes(item.status)) item.status = 'pending';
  }
  state() { return {items:this.items, downloads:this.downloads, running:this.running, paused:this.paused, waiting:this.waiting, waitingCount:this.manualRequests.size,activeTabs:this.items.filter(i=>['running','waiting'].includes(i.status)).length,message:this.message,error:this.error}; }
  async publish() { await this.save({items:this.items, downloads:this.downloads}); this.emit('state', this.state()); }
  async add(urls, skipDuplicates = true) {
    const results = [],addedIds=new Set();
    for (const input of urls) {
      const raw = input.trim(); if (!raw) continue;
      try {
        const id = productKey(raw); const url = normalizedUrl(raw);
        const prior = this.downloads.find(d => d.productId === id && d.exportFormat === EXPORT_FORMAT && d.priceMode === 'visible-variation-v1' && d.path);
        const exists = prior ? await fs.access(prior.path).then(() => true, () => false) : false;
        const queued = this.items.some(i => i.productId === id && ['pending','running','waiting'].includes(i.status));
        if (skipDuplicates && (exists || queued)) { results.push({url, status:'duplicate'}); continue; }
        const item = {id:require('node:crypto').randomUUID(), productId:id, url, status:'pending', attempts:0, error:null};
        this.items.push(item);addedIds.add(item.id);results.push(item);
      } catch (e) { results.push({url:raw, status:'invalid', error:e.message}); }
    }
    try{await this.publish();}catch(error){this.items=this.items.filter(item=>!addedIds.has(item.id)||item.status!=='pending');throw error;}return results;
  }
  async checkpoint() { while (this.paused||this.waiting) await new Promise(resolve => setTimeout(resolve, 100)); }
  pause() { this.paused = true; return this.publish(); }
  resume() { this.paused = false; return this.publish(); }
  async manual(message,item) {
    const key=item?.id||Symbol('verification');let resolve;
    const ready=new Promise(done=>{resolve=done;});
    this.manualRequests.set(key,{message,item,resolve});
    if(item)item.status='waiting';
    this.waiting=this.manualRequests.values().next().value.message;
    try {await this.publish();await ready;}
    finally {
      this.manualRequests.delete(key);
      if(item?.status==='waiting')item.status='running';
      this.waiting=this.manualRequests.values().next().value?.message||null;
      await this.publish();
    }
  }
  continue() {
    if(!this.manualRequests.size)return;
    const requests=[...this.manualRequests.values()];this.manualRequests.clear();this.waiting=null;this.verificationEpoch++;
    for(const request of requests){if(request.item?.status==='waiting')request.item.status='running';request.resolve();}
    return this.publish();
  }
  failureItems(ids = null) {
    const failed=this.items.filter(item=>item.status==='failed');
    if(ids===null)return failed;
    if(!Array.isArray(ids)||ids.length>100000||ids.some(id=>typeof id!=='string'))throw new Error('Invalid failed-link selection.');
    const selected=new Set(ids),records=failed.filter(item=>selected.has(item.id));
    if(records.length!==selected.size)throw new Error('A selected link is no longer in Failed Links.');
    return records;
  }
  async retry(ids = null) {
    if(this.running)throw new Error('Wait for the run to finish before retrying failed links.');
    const records=this.failureItems(ids),selected=new Set(records.map(item=>item.id));
    const activeProducts=new Set(this.items.filter(item=>['pending','running','waiting'].includes(item.status)).map(item=>item.productId));
    if(records.some(record=>activeProducts.has(record.productId)))throw new Error('A selected product is already queued.');
    const previous={items:this.items,message:this.message};
    this.items=this.items.map(item=>selected.has(item.id)?{...item,status:'pending',error:null}:item);
    this.message=`${records.length} failed links returned to the queue.`;
    try {await this.publish();}catch(error){Object.assign(this,previous);throw error;}
    return records.map(item=>item.id);
  }
  async removeFailures(ids = null) {
    const records=this.failureItems(ids),selected=new Set(records.map(item=>item.id));
    const previous={items:this.items,message:this.message};
    this.items=this.items.filter(item=>!selected.has(item.id));
    this.message=`${records.length} failed links removed. Exported ZIP files kept.`;
    try {await this.publish();}catch(error){Object.assign(this,previous);throw error;}
    return records.length;
  }
  async clearFinished() {
    if(this.running)throw new Error('Wait for the run to finish.');
    const previous=this.items;this.items=this.items.filter(item=>item.status!=='done');
    try {await this.publish();}catch(error){this.items=previous;throw error;}
  }
  async deleteRecords(archivePath = null,{downloadsOnly=false} = {}) {
    if (this.running&&!downloadsOnly) throw new Error('Wait for the run to finish before deleting records.');
    const record=archivePath===null?null:this.downloads.find(d=>d.path===archivePath);
    if (archivePath!==null&&!record) throw new Error('Unknown download');
    const previous={items:this.items,downloads:this.downloads,paused:this.paused,waiting:this.waiting,message:this.message};
    if (record) {
      this.downloads=this.downloads.filter(d=>d.path!==archivePath);
      if (!this.downloads.some(d=>d.productId===record.productId)) this.items=this.items.filter(i=>i.productId!==record.productId||i.status!=='done');
      this.message='Record deleted. Exported ZIP file kept.';
    } else {
      this.items=downloadsOnly?this.items.filter(i=>i.status!=='done'):[];this.downloads=[];
      if(!downloadsOnly){this.paused=false;this.waiting=null;}
      this.message=downloadsOnly?'Downloads cleared. Exported ZIP files kept.':'All records deleted. Exported ZIP files kept.';
    }
    try {await this.publish();} catch(error) {Object.assign(this,previous);throw error;}
  }
  async run(settings) {
    if (this.running) return;
    this.running = true;
    try {
      await this.publish();
      const limit=Math.max(1,Math.min(4,Math.floor(Number(settings.parallelTabs)||3),this.items.filter(i=>i.status==='pending').length||1));
      const worker=async()=>{
        while(true){
          await this.checkpoint();const item=this.items.find(i=>i.status==='pending');if(!item)return;
          const previous={status:item.status,attempts:item.attempts,error:item.error};
          item.status='running';item.attempts++;item.error=null;
          try{await this.publish();}catch(error){Object.assign(item,previous);throw error;}
          try {
            const result=await this.extract(item,settings,this);
            this.downloads.unshift(result);item.status='done';item.title=result.title;item.warnings=result.warnings.length;item.savedAt=new Date().toISOString();
          } catch(error){item.status='failed';item.error=error.message;item.failedAt=new Date().toISOString();}
          await this.publish();await this.checkpoint();
          if(settings.delayMs)await new Promise(resolve=>setTimeout(resolve,settings.delayMs));
        }
      };
      const results=await Promise.allSettled(Array.from({length:limit},worker));
      const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
    } finally { this.running=false; await this.publish(); }
  }
}
module.exports = {Queue};
