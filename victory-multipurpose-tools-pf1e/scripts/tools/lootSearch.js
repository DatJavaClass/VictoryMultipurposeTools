/* Loot Search: scan scene inventories, hold one item. */
export default (vmt) => {
  const { App, store, adapter, ui: { esc, on, btn, opt, wait, confirm, i18n } } = vmt, L = i18n('VMTP');
  const PILES = 'item-piles';
  const log = (m, err) => (err ? console.error(`VMTP LootSearch | ${m}`, err) : console.log(`VMTP LootSearch | ${m}`));
  const warn = (k, d) => ui.notifications.warn(L(`LootSearch.${k}`, d)), info = (k, d) => ui.notifications.info(L(`LootSearch.${k}`, d));
  const hasPiles = () => !!game.modules.get(PILES)?.active;
  const live = (id) => canvas.tokens?.get(id) ?? null; /* token may have left since scan */
  const push = (map, k, v) => (map.get(k) ?? map.set(k, []).get(k)).push(v);

  /* Player reach: piles, open or unlocked containers, LIMITED. */
  const reachable = (t) => { const d = t.actor.getFlag(PILES, 'data'); return !!d?.enabled && (d.type === 'pile' || (d.type === 'container' && (d.opened || d.locked === false)) || t.actor.testUserPermission(game.user, 'LIMITED')); };

  /* Pan to the owner token and select it. */
  async function view(o) {
    const t = live(o.tokenId);
    if (!t) return warn('TokenGone');
    const d = t.document, g = canvas.grid.size;
    await canvas.animatePan({ x: d.x + (d.width * g) / 2, y: d.y + (d.height * g) / 2, scale: 1.5, duration: 500 });
    t.control({ releaseOthers: true });
    info('Viewing', { name: o.actorName });
  }

  class LootSearchApp extends App {
    static DEFAULT_OPTIONS = { id: 'vmtp-loot-search', window: { title: 'VMTP.LootSearch.Title' }, position: { width: 700, height: 720 } };

    constructor(...args) { super(...args); this.gm = game.user.isGM; this.cat = { loot: new Map(), features: new Map() }; this.count = 0; this.mode = 'loot'; this.q = ''; this.sel = null; this.hand = null; }

    /* Catalog every reachable token; false when nothing found. */
    scan() {
      const { physical, features, quantity } = adapter.get(), tokens = (canvas.tokens?.placeables ?? []).filter((t) => t.actor && (this.gm || reachable(t)));
      this.cat = { loot: new Map(), features: new Map() }; this.count = tokens.length; this.sel = null; this.q = '';
      if (!tokens.length) { warn(this.gm ? 'NoTokens' : 'NoPiles'); return false; }
      for (const t of tokens) for (const item of t.actor.items) {
        const bucket = this.gm ? (features.includes(item.type) ? 'features' : 'loot') : physical.includes(item.type) ? 'loot' : null; /* players see physical only */
        if (bucket) push(this.cat[bucket], item.name, { tokenId: t.id, actorName: t.actor.name, itemId: item.id, qty: foundry.utils.getProperty(item, quantity) || 1, img: item.img, type: item.type });
      }
      log(`Found ${this.cat.loot.size} unique loot items${this.gm ? ` and ${this.cat.features.size} unique features` : ''} on ${tokens.length} tokens`);
      return true;
    }

    owners() { return this.cat[this.mode].get(this.sel) ?? []; }
    names() { const q = this.q.toLowerCase(); return [...this.cat[this.mode].keys()].sort().filter((n) => n.toLowerCase().includes(q)); }

    /* Item rows for the current filter. */
    rows() {
      const names = this.names(), none = this.gm ? (this.mode === 'loot' ? 'LootSearch.NoLoot' : 'LootSearch.NoFeatures') : 'LootSearch.NoItems';
      if (!names.length) return `<p class="empty">${L(none)}</p>`;
      return names.map((n) => { const o = this.cat[this.mode].get(n), qty = o.reduce((s, x) => s + x.qty, 0); return `<div class="card act ${n === this.sel ? 'sel' : ''}" data-act="pick" data-name="${esc(n)}"><img class="pic" src="${esc(o[0].img)}"><span class="grow">${esc(n)}</span><span class="muted">${L(o.length > 1 ? 'LootSearch.Sources' : 'LootSearch.Source', { n: o.length, qty })}</span></div>`; }).join('');
    }

    /* Owner rows for the selected name. */
    ownerRows() {
      const acts = (i) => `${btn('copy', `<i class="fas fa-copy"></i> ${L('LootSearch.Copy')}`, `data-i="${i}" title="${L('LootSearch.CopyTip')}"`)}${btn('grab', `<i class="fas fa-hand-rock"></i> ${L('LootSearch.PickUp')}`, `data-i="${i}" title="${L('LootSearch.PickUpTip')}"`)}`;
      return this.owners().map((o, i) => `<div class="card act" data-act="view" data-i="${i}"><b class="grow">${esc(o.actorName)}</b><span class="qty">${L('LootSearch.Qty', { n: o.qty })}</span>${this.gm ? acts(i) : ''}</div>`).join('');
    }

    /* Hand rail: held item, put down, drop. */
    rail() {
      const h = this.hand, off = h ? '' : 'disabled';
      const held = h ? `<div class="card hand"><img src="${esc(h.data.img)}"><div><b>${esc(h.data.name)}</b><span class="hint">${L('LootSearch.From', { name: esc(h.from) })}</span><span class="qty">${L(h.action === 'copy' ? 'LootSearch.Copied' : 'LootSearch.PickedUp')}</span></div></div>` : `<p class="empty">${L('LootSearch.HandEmpty')}</p>`;
      return `<aside class="rail"><h3>${L('LootSearch.Hand')}</h3>${held}${btn('put', `<i class="fas fa-hand-holding"></i> ${L('LootSearch.PutDown')}`, `class="gold" title="${L('LootSearch.PutDownTip')}" ${off}`)}${btn('drop', `<i class="fas fa-trash"></i> ${L('LootSearch.Drop')}`, `class="red" ${off}`)}</aside>`;
    }

    html() {
      const n = { loot: this.cat.loot.size, features: this.cat.features.size, tokens: this.count }, stats = L(this.gm ? 'LootSearch.StatsGm' : 'LootSearch.StatsPlayer', n);
      const radio = (v, k) => `<label class="check"><input type="radio" name="mode" value="${v}" ${this.mode === v ? 'checked' : ''}>${L(k)}</label>`;
      return `<div class="cols"><div class="main">
        <p class="hint">${esc(stats)}</p>
        ${this.gm ? `<div class="row">${radio('loot', 'LootSearch.ModeLoot')}${radio('features', 'LootSearch.ModeFeatures')}</div>` : ''}
        <div class="row"><input type="text" name="q" value="${esc(this.q)}" placeholder="${L('LootSearch.Filter')}">${btn('rescan', `<i class="fas fa-sync"></i> ${L('LootSearch.Rescan')}`)}</div>
        <div class="list" data-keep="names">${this.rows()}</div>
        ${this.sel ? `<div class="owners"><h3>${L(this.gm ? 'LootSearch.OwnersGm' : 'LootSearch.OwnersPlayer', { name: esc(this.sel) })}</h3><div class="list" data-keep="owners">${this.ownerRows()}</div></div>` : ''}
      </div>${this.gm ? this.rail() : ''}</div>`;
    }

    /* Live filter swaps the list, search keeps focus. */
    bind(root) {
      super.bind(root);
      on(root, 'input', '[name="q"]', (el) => { this.q = el.value; this.sel = null; root.querySelector('[data-keep="names"]').innerHTML = this.rows(); root.querySelector('.owners')?.remove(); });
      on(root, 'change', '[name="mode"]', (el) => { this.mode = el.value; this.q = ''; this.sel = null; this.render(); });
    }

    async act(a, ds) {
      const o = this.owners()[Number(ds.i)];
      const acts = {
        rescan: () => { this.scan(); this.render(); },
        pick: () => { this.sel = ds.name; this.render(); },
        view: () => view(o),
        copy: () => this.take(o, 'copy'),
        grab: () => this.take(o, 'grab'),
        put: () => this.put(),
        drop: () => { if (!this.hand) return warn('HandEmpty'); info('Dropped', { name: this.hand.data.name }); this.hand = null; this.render(); },
      };
      return acts[a]?.();
    }

    /* Copy or pick up into the Hand. */
    async take(o, action) {
      if (this.hand) return warn('HandFull');
      const item = live(o.tokenId)?.actor?.items.get(o.itemId);
      if (!item) return warn('ItemGone');
      const hand = { data: item.toObject(), from: o.actorName, action };
      if (action === 'grab') {
        try { await item.actor.deleteEmbeddedDocuments('Item', [item.id]); } catch (err) { log(`Pick up failed on ${o.actorName}`, err); return ui.notifications.error(L('LootSearch.PickUpFail')); }
        this.forget(o);
      }
      this.hand = hand;
      info(action === 'copy' ? 'CopiedMsg' : 'PickedUpMsg', { name: item.name, actor: o.actorName });
      this.render();
    }

    /* Owner entry leaves the catalog after pick up. */
    forget(o) {
      const map = this.cat[this.mode], list = map.get(this.sel).filter((x) => x !== o);
      if (list.length) map.set(this.sel, list); else { map.delete(this.sel); this.sel = null; }
    }

    /* Put the held item on the selected token. */
    async put() {
      if (!this.hand) return warn('HandEmpty');
      const c = canvas.tokens.controlled, t = c[0];
      if (c.length !== 1) return warn(c.length ? 'OnlyOne' : 'SelectOne');
      try { await t.actor.createEmbeddedDocuments('Item', [this.hand.data]); } catch (err) { log(`Put down failed on ${t.name}`, err); return ui.notifications.error(L('LootSearch.PutDownFail')); }
      info('PutDownDone', { name: this.hand.data.name, token: t.name });
      this.hand = null;
      this.render();
    }
  }

  let app = null;
  return { id: 'loot-search', title: 'VMTP.LootSearch.Title', hint: 'VMTP.LootSearch.Hint', icon: 'fa-search-dollar', group: 'VMTP.Group.Inventory', gm: false, open: () => { if (!game.user.isGM && !hasPiles()) return warn('NeedPiles'); app ??= new LootSearchApp(); if (app.scan()) app.render(true); } };
};
