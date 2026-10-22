(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LinkGrid = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  // Excel copies cells as TSV, quoting cells that contain tabs or newlines.
  function parseClipboard(value) {
    const text = String(value || '').replace(/\r\n?/g, '\n');
    const cells = []; let cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"' && (quoted || !cell)) {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && (char === '\t' || char === '\n')) {
        if (cell.trim()) cells.push(cell.trim());
        cell = '';
      } else cell += char;
    }
    if (cell.trim()) cells.push(cell.trim());
    return cells;
  }
  function validateUrl(value) {
    const text = String(value || '').trim();
    if (!text) return {state: 'empty', message: 'Empty', productId: null};
    try {
      const url = new URL(text);
      const productId = url.pathname.match(/\/(?:item|i)\/(\d+)\.html/i)?.[1];
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || !/(^|\.)aliexpress\.(com|us)$/i.test(url.hostname) || !productId) throw new Error();
      return {state: 'ready', message: 'Ready', productId};
    } catch { return {state: 'invalid', message: 'Use a full AliExpress /item/NUMBER.html link', productId: null}; }
  }
  function create({body, summary, initialRows = 30, onChange = () => {}}) {
    let sequence = 0, rows = [], queueItems = [];
    const blank = () => ({id: ++sequence, value: '', result: null});
    const element = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
    function focusRow(index) { const input = body.querySelectorAll('.link-url')[index]; input?.focus(); }
    function refresh() {
      const seen = new Map(), counts = {links: 0, ready: 0, invalid: 0, duplicate: 0, submitted: 0};
      rows.forEach((row, index) => {
        const value = row.value.trim(), validation = validateUrl(value);
        let status = validation;
        if (value) counts.links++;
        if (validation.productId) {
          if (seen.has(validation.productId)) status = {state: 'duplicate', message: `Duplicate of row ${seen.get(validation.productId) + 1}`};
          else seen.set(validation.productId, index);
        }
        if (row.result && row.result.value === value && row.result.status !== 'invalid') {
          if (row.result.status === 'duplicate') status = {state: 'skipped', message: 'Duplicate skipped'};
          else {
            const job = queueItems.find(item => item.id === row.result.jobId);
            const labels = {pending: 'Queued', running: 'Running', waiting: 'Waiting', done: 'Saved', failed: 'Failed — retry in Progress'};
            const state = job?.status || 'pending';
            status = {state: state === 'pending' ? 'queued' : state, message: labels[state] || 'Queued'};
          }
          counts.submitted++;
        } else if (row.result?.status === 'invalid' && row.result.value === value) status = {state: 'invalid', message: row.result.error || validation.message};
        if (status.state === 'ready') counts.ready++;
        if (status.state === 'invalid') counts.invalid++;
        if (['duplicate', 'skipped'].includes(status.state)) counts.duplicate++;
        const tr = body.children[index], input = tr.querySelector('.link-url'), output = tr.querySelector('.link-status');
        output.dataset.state = status.state; output.textContent = status.message; output.title = status.message;
        input.setAttribute('aria-invalid', String(status.state === 'invalid'));
        tr.dataset.state = status.state;
      });
      summary.textContent = `${counts.links} links · ${counts.ready} ready${counts.invalid ? ` · ${counts.invalid} invalid` : ''}${counts.duplicate ? ` · ${counts.duplicate} duplicates` : ''}${counts.submitted ? ` · ${counts.submitted} submitted` : ''}`;
      onChange({rows: rows.length, ...counts});
    }
    function render() {
      body.replaceChildren();
      rows.forEach((row, index) => {
        const tr = element('tr'), number = element('th', String(index + 1), 'link-number'); number.scope = 'row';
        const cell = element('td'), input = element('input', null, 'link-url url-cell');
        input.type = 'text'; input.inputMode = 'url'; input.autocomplete = 'off'; input.spellcheck = false;
        input.value = row.value; input.placeholder = 'https://www.aliexpress.com/item/…html';
        input.dataset.row = String(index); input.dataset.urlRow = String(index + 1);
        input.setAttribute('aria-label', `Product URL row ${index + 1}`);
        input.oninput = () => { row.value = input.value; row.result = null; refresh(); };
        input.onpaste = event => {
          const text = event.clipboardData?.getData('text/plain') || '';
          if (!/[\r\n\t]/.test(text)) return;
          event.preventDefault(); importText(text, index);
        };
        input.onkeydown = event => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          if (!event.shiftKey && index === rows.length - 1) { rows.push(blank()); render(); }
          focusRow(Math.max(0, index + (event.shiftKey ? -1 : 1)));
        };
        cell.append(input);
        const statusCell = element('td'), status = element('span', '', 'link-status'); status.setAttribute('role', 'status'); statusCell.append(status);
        const actionCell = element('td'), remove = element('button', '×', 'remove-link'); remove.type = 'button'; remove.title = `Remove row ${index + 1}`; remove.setAttribute('aria-label', remove.title);
        remove.onclick = () => { rows.splice(index, 1); if (!rows.length) rows.push(blank()); render(); focusRow(Math.min(index, rows.length - 1)); };
        actionCell.append(remove); tr.append(number, cell, statusCell, actionCell); body.append(tr);
      });
      refresh();
    }
    function importText(text, start = -1) {
      const values = parseClipboard(text); if (!values.length) return 0;
      if (start < 0) { start = rows.findIndex(row => !row.value.trim()); if (start < 0) start = rows.length; }
      while (rows.length < start + values.length) rows.push(blank());
      values.forEach((value, index) => { rows[start + index].value = value; rows[start + index].result = null; });
      render(); focusRow(start); return values.length;
    }
    function entries() { return rows.filter(row => row.value.trim() && !['pending', 'duplicate'].includes(row.result?.status)).map(row => ({id: row.id, value: row.value.trim()})); }
    function markResults(submitted, results) {
      submitted.forEach((entry, index) => { const row = rows.find(row => row.id === entry.id); if (row && row.value.trim() === entry.value && results[index]) row.result = {...results[index], jobId: results[index].id, value: entry.value}; });
      refresh();
    }
    rows = Array.from({length: initialRows}, blank); render();
    return {
      importText, entries, markResults,
      syncQueue(items) { queueItems = items || []; refresh(); },
      resetResults(productId) { for (const row of rows) if (validateUrl(row.value).productId === productId) row.result = null; refresh(); },
      addRows(count = 10) { const index = rows.length; for (let n = 0; n < count; n++) rows.push(blank()); render(); focusRow(index); },
      setRows(count) { const last = rows.reduce((found, row, index) => row.value.trim() ? index : found, -1); const target = Math.max(count, last + 1, 1); while (rows.length < target) rows.push(blank()); rows = rows.slice(0, target); render(); },
      clear() { rows = Array.from({length: initialRows}, blank); render(); focusRow(0); }
    };
  }
  return {parseClipboard, validateUrl, create};
});
