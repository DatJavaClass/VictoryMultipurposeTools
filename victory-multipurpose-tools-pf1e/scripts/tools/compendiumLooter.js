/* Compendium Looter: search every pack, loot the hits. */
export default (vmt) => {
  const { App, store, adapter, ui: { esc, on, btn, opt, wait, confirm, i18n } } = vmt, L = i18n('VMTP');
  const TAG = 'VMTP Looter |', MAX = 100, MIN = 2, DEBOUNCE = 300, FALLBACK = 'icons/svg/mystery-man.svg';

  const packs = () => (game.user.isGM ? [...game.packs] : game.packs.filter((p) => p.metadata.type === 'Item')); /* players get Item packs only */
  const load = async (uuid) => { const doc = await fromUuid(uuid), data = doc?.toObject(); if (data) delete data._id; return [doc, data]; }; /* never pack.importDocument(), world assigns id */
  const targets = () => { const a = canvas.tokens.controlled.map((t) => t.actor).filter(Boolean); return a.length ? a : game.user.character ? [game.user.character] : []; };
  const qtyOf = (el) => el?.closest('.card')?.querySelector('.qty input');
  const snap = (i) => { const v = Math.max(1, parseInt(i?.value, 10) || 1); if (i) i.value = v; return v; }; /* bad input snaps to 1 */

  /* Index scan of every pack, bad packs skipped. */
  async function scan(needle) {
    const n = needle.toLowerCase(), list = packs(), hits = []; let docs = 0;
    for (const pack of list) {
      try { for (const e of await pack.getIndex()) { docs++; if ((e.name ?? '').toLowerCase().includes(n)) hits.push({ name: e.name, uuid: `Compendium.${pack.collection}.${e._id}`, type: e.type || pack.metadata.type, docType: pack.metadata.type, packName: pack.metadata.label, img: e.img || FALLBACK }); } }
      catch (err) { console.warn(TAG, 'pack failed', pack.metadata.label, err); }
    }
    return { hits, docs, packs: list.length };
  }

  class CompendiumLooterApp extends App {
    static DEFAULT_OPTIONS = { id: 'vmtp-compendium-looter', window: { title: 'VMTP.Looter.Title' }, position: { width: 700, height: 720 } };

    constructor(...args) { super(...args); this.needle = ''; this.res = null; this.timer = null; }

    html() {
      const stack = new Set(adapter.get().stackable ?? []), r = this.res, ic = (i, k) => `<i class="fas fa-${i}"></i> ${L(`Looter.${k}`)}`;
      const step = `<div class="qty" title="${L('Looter.QtyTip')}">${btn('up', '<i class="fas fa-caret-up"></i>', 'tabindex="-1"')}<input type="text" inputmode="numeric" value="1">${btn('down', '<i class="fas fa-caret-down"></i>', 'tabindex="-1"')}</div>`;
      const row = (h, i) => { const addable = h.docType === 'Item', d = `data-idx="${i}"`; return `<div class="card"><div class="row"><img class="face" src="${esc(h.img)}"><div class="meta"><b>${esc(h.name)}</b><span class="kind">${esc(h.type)}</span><span class="muted">${esc(h.packName)}</span></div><div class="row end">${btn('view', ic('eye', 'View'), `${d} title="${L('Looter.ViewTip')}"`)}${btn('import', ic('file-import', 'Import'), `${d} title="${L('Looter.ImportTip')}"`)}${btn('add', ic('user-plus', 'Add'), `${d} title="${L(addable ? 'Looter.AddTip' : 'Looter.NotAddable')}" ${addable ? '' : 'disabled'}`)}${addable && stack.has(h.type) ? step : ''}${btn('copy', ic('copy', 'Copy'), `${d} title="${L('Looter.CopyTip')}"`)}</div></div></div>`; };
      const stat = r ? L('Looter.Found', { total: r.hits.length, packs: r.packs, docs: r.docs }) + (r.hits.length > MAX ? ` ${L('Looter.Capped', { max: MAX })}` : '') : L('Looter.Ready', { packs: packs().length, mode: L(game.user.isGM ? 'Looter.ModeGM' : 'Looter.ModePlayer') });
      return `<div class="row"><input type="text" name="needle" placeholder="${L('Looter.Placeholder')}" value="${esc(this.needle)}" autocomplete="off">${btn('find', ic('search', 'Find'), 'class="gold"')}</div>
        <p class="stat">${esc(stat)}</p>
        <div class="list" data-keep="list">${r === null ? `<p class="empty">${L('Looter.Start')}</p>` : r.hits.slice(0, MAX).map(row).join('') || `<p class="empty">${L('Looter.None', { needle: this.needle })}</p>`}</div>`;
    }

    bind(root) {
      super.bind(root);
      on(root, 'input', '[name="needle"]', () => { clearTimeout(this.timer); this.timer = setTimeout(() => this.search(), DEBOUNCE); });
      on(root, 'keydown', '[name="needle"]', (_, ev) => { if (ev.key === 'Enter') this.search(); });
      on(root, 'change', '.qty input', snap);
    }

    /* Debounced search; short needles clear the list. */
    async search() {
      clearTimeout(this.timer);
      const raw = this.val('needle'), stat = this.element.querySelector('.stat');
      this.needle = raw.trim();
      if (this.needle.length < MIN) { this.res = null; return this.refresh(raw); }
      if (stat) stat.textContent = L('Looter.Searching', { needle: this.needle });
      this.res = await scan(this.needle);
      console.log(TAG, 'hits', this.res.hits.length, 'for', this.needle);
      return this.refresh(raw);
    }

    /* Rerender, keep typing focus, chase later keystrokes. */
    async refresh(searched) {
      const box = this.element.querySelector('[name="needle"]'), live = box?.value ?? searched, had = box === document.activeElement;
      await this.render();
      const nb = this.element.querySelector('[name="needle"]'); if (!nb) return;
      nb.value = live;
      if (had) { nb.focus(); nb.setSelectionRange(live.length, live.length); }
      if (live.trim() !== this.needle) this.timer = setTimeout(() => this.search(), DEBOUNCE);
    }

    async act(a, ds = {}, el) {
      const h = this.res?.hits[ds.idx], note = (k, d = {}, kind = 'info') => ui.notifications[kind](L(`Looter.${k}`, d));
      const acts = {
        find: () => this.search(),
        up: () => { const i = qtyOf(el); if (i) i.value = snap(i) + 1; },
        down: () => { const i = qtyOf(el); if (i) i.value = Math.max(1, snap(i) - 1); },
        copy: async () => { await navigator.clipboard.writeText(h.uuid); note('Copied', { name: h.name }); },
        view: async () => {
          try { const [doc] = await load(h.uuid); doc?.sheet ? doc.sheet.render(true) : note('NoSheet', {}, 'warn'); }
          catch (err) { console.error(TAG, 'view failed', err); note('LoadFail', {}, 'error'); }
        },
        import: async () => {
          try {
            const [, data] = await load(h.uuid); if (!data) return note('LoadFail', {}, 'error');
            const col = game.collections.get(h.docType); if (!col) return note('NoCollection', { type: h.docType }, 'error');
            const made = await col.documentClass.create(data);
            console.log(TAG, 'imported', made.name, h.docType, 'from', h.packName); note('Imported', { name: made.name });
          } catch (err) { console.error(TAG, 'import failed', err); note('ImportFail', {}, 'error'); }
        },
        add: async () => {
          const who = targets(); if (!who.length) return note('NoTarget', {}, 'warn');
          try {
            const [doc, data] = await load(h.uuid); if (!data) return note('LoadFail', {}, 'error');
            const i = qtyOf(el), n = i ? snap(i) : 1;
            if (i) foundry.utils.setProperty(data, adapter.get().quantity, n); /* stepper qty rides the copy */
            for (const actor of who) { await actor.createEmbeddedDocuments('Item', [data]); console.log(TAG, 'added', n, doc.name, 'to', actor.name); }
            note('Added', { qty: n, name: doc.name, names: who.map((x) => x.name).join(', ') });
          } catch (err) { console.error(TAG, 'add failed', err); note('AddFail', {}, 'error'); }
        },
      };
      return acts[a]?.();
    }
  }

  let app = null;
  return { id: 'compendium-looter', title: 'VMTP.Looter.Title', hint: 'VMTP.Looter.Hint', icon: 'fa-box-open', group: 'VMT.Group.Compendiums', gm: false, open: () => (app ??= new CompendiumLooterApp()).render(true) };
};
