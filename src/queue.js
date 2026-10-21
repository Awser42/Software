const fs = require('node:fs/promises');
const {EventEmitter} = require('node:events');
const {productKey, normalizedUrl} = require('./archive');
class Queue extends EventEmitter {
  constructor({extract, save = async () => {}, initial = {}}) {
    super(); this.extract = extract; this.save = save; this.items = initial.items || []; this.downloads = initial.downloads || [];
    this.running = false; this.paused = false; this.waiting = null; this.message = '';
    for (const item of this.items) if (['running','waiting'].includes(item.status)) item.status = 'pending';
  }
  state() { return {items:this.items, downloads:this.downloads, running:this.running, paused:this.paused, waiting:this.waiting, message:this.message}; }
  async publish() { await this.save({items:this.items, downloads:this.downloads}); this.emit('state', this.state()); }
  async add(urls, skipDuplicates = true) {
    const results = [];
    for (const input of urls) {
      const raw = input.trim(); if (!raw) continue;
      try {
        const id = productKey(raw); const url = normalizedUrl(raw);
        const prior = this.downloads.find(d => d.productId === id && d.path);
        const exists = prior ? await fs.access(prior.path).then(() => true, () => false) : false;
        const queued = this.items.some(i => i.productId === id && ['pending','running','waiting'].includes(i.status));
        if (skipDuplicates && (exists || queued)) { results.push({url, status:'duplicate'}); continue; }
        const item = {id:require('node:crypto').randomUUID(), productId:id, url, status:'pending', attempts:0, error:null};
        this.items.push(item); results.push(item);
      } catch (e) { results.push({url:raw, status:'invalid', error:e.message}); }
    }
    await this.publish(); return results;
  }
  async checkpoint() { while (this.paused) await new Promise(resolve => setTimeout(resolve, 100)); }
  pause() { this.paused = true; return this.publish(); }
  resume() { this.paused = false; return this.publish(); }
  async manual(message) {
    this.waiting = message; await this.publish();
    await new Promise(resolve => { this.continueManual = resolve; });
    this.waiting = null; this.continueManual = null; await this.publish();
  }
  continue() { this.continueManual?.(); }
  async retry() { for (const i of this.items) if (i.status === 'failed') { i.status = 'pending'; i.error = null; } await this.publish(); }
  async run(settings) {
    if (this.running) return;
    this.running = true; await this.publish();
    try {
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i]; if (item.status !== 'pending') continue;
        await this.checkpoint(); item.status='running'; item.attempts++; item.error=null; await this.publish();
        try {
          const result = await this.extract(item, settings, this);
          this.downloads.unshift(result); item.status='done'; item.title=result.title; item.warnings=result.warnings.length;item.savedAt=new Date().toISOString();
        } catch (e) { item.status='failed'; item.error=e.message; }
        await this.publish();
        await this.checkpoint();
        if (settings.delayMs) await new Promise(r => setTimeout(r, settings.delayMs));
      }
    } finally { this.running=false; await this.publish(); }
  }
}
module.exports = {Queue};
