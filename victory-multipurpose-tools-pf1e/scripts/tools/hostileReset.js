/* Hostile Inventory Reset: wipe hostile loot by group. */
export default (vmt) => {
  const { App, store, adapter, ui: { esc, on, btn, opt, wait, confirm, i18n } } = vmt, L = i18n('VMTP');
  const HOSTILE_DISPOSITION = -1, log = (...m) => console.log('VMTP HostileReset |', ...m);
  const coinPaths = (actor) => { const { path, coins } = adapter.get().currency; return coins.map((c) => `${path}.${c}`).filter((p) => foundry.utils.getProperty(actor, p) !== undefined); };
  const loot = (actor) => actor.items.filter((i) => adapter.get().physical.includes(i.type));
  const n = (list, key) => list.reduce((s, g) => s + g[key].length, 0); /* sum of a list field */

  /* Hostile NPC tokens grouped by name, biggest first. */
  function scan() {
    const groups = new Map();
    for (const t of canvas.tokens.placeables) {
      const a = t.actor;
      if (!a || a.type !== 'npc' || t.document.disposition !== HOSTILE_DISPOSITION) continue;
      const g = groups.get(a.name) ?? groups.set(a.name, { name: a.name, img: a.img, tokens: [], actors: new Map(), items: 0, coin: false }).get(a.name);
      g.tokens.push(t);
      if (g.actors.has(a.id)) continue; /* linked tokens share one actor */
      g.actors.set(a.id, a); g.items += loot(a).length;
      g.coin ||= coinPaths(a).some((p) => Number(foundry.utils.getProperty(a, p)) > 0);
    }
    return [...groups.values()].map((g) => ({ ...g, actors: [...g.actors.values()], on: g.items > 0 || g.coin })).sort((a, b) => b.tokens.length - a.tokens.length);
  }

  class HostileResetApp extends App {
    static DEFAULT_OPTIONS = { id: 'vmtp-hostile-reset', window: { title: 'VMTP.HostileReset.Title' }, position: { width: 460, height: 520 } };

    constructor(...args) { super(...args); this.groups = null; this.busy = false; }

    html() {
      const gs = this.groups, dis = this.busy ? 'disabled' : '';
      const row = (g, i) => `<label class="pick"><input type="checkbox" data-idx="${i}" ${g.on ? 'checked' : ''} ${dis}><img src="${esc(g.img)}" class="face"><span class="grow"><b>${esc(g.name)}</b> <span class="${g.items ? 'loot' : 'bare'}">${g.items ? L('HostileReset.Items', { count: g.items }) : L('HostileReset.NoLoot')}</span>${g.coin ? ` <i class="fas fa-coins coin" title="${L('HostileReset.Coin')}"></i>` : ''}</span><span class="badge">${g.tokens.length}</span></label>`;
      const summary = gs ? `<span class="muted">${L('HostileReset.Summary', { groups: gs.length, tokens: n(gs, 'tokens') })}</span>` : '';
      return `<div class="main">
        <div class="row">${btn('scan', `<i class="fas fa-search"></i> ${L('HostileReset.Scan')}`, `class="gold" ${dis}`)}${summary}${btn('all', L('HostileReset.All'), `class="end" ${dis}`)}${btn('none', L('HostileReset.None'), dis)}</div>
        <div class="list" data-keep="groups">${gs?.map(row).join('') || `<p class="empty">${L(gs ? 'HostileReset.NoHostiles' : 'HostileReset.Start')}</p>`}</div>
        <div class="row"><span class="hint">${L('HostileReset.Footer')}</span><span class="hint end" data-count>${this.picked()}</span></div>
        <div class="row">${btn('purge', `<i class="fas fa-fire"></i> ${L('HostileReset.Purge')}`, `class="red" ${dis}`)}</div>
      </div>`;
    }

    picked() { return L('HostileReset.Selected', { count: this.groups?.filter((g) => g.on).length ?? 0 }); }
    check(on) { for (const g of this.groups ?? []) g.on = on; }

    bind(root) {
      super.bind(root);
      on(root, 'change', 'input[data-idx]', (el) => { this.groups[el.dataset.idx].on = el.checked; root.querySelector('[data-count]').textContent = this.picked(); });
    }

    /* Confirm with the casualty list, then wipe. */
    async purge() {
      const sel = this.groups?.filter((g) => g.on) ?? [];
      if (!sel.length) return ui.notifications.warn(L('HostileReset.NoneSelected'));
      const tokens = n(sel, 'tokens'), body = `${L('HostileReset.Ask', { groups: sel.length, tokens })}<br>${sel.map((g) => `${esc(g.name)} (${g.tokens.length})`).join(', ')}<br><b>${L('HostileReset.AskWarn', { items: sel.reduce((s, g) => s + g.items, 0) })}</b>`;
      if (!(await confirm(L('HostileReset.Title'), body))) return ui.notifications.info(L('HostileReset.Cancelled'));

      let items = 0, failed = 0;
      for (const g of sel) for (const a of g.actors) {
        const ids = loot(a).map((i) => i.id), cur = Object.fromEntries(coinPaths(a).map((p) => [p, 0]));
        try {
          if (ids.length) await a.deleteEmbeddedDocuments('Item', ids);
          if (Object.keys(cur).length) await a.update(cur);
          items += ids.length;
        } catch (e) { failed++; console.error('VMTP HostileReset |', `Failed on "${a.name}":`, e); }
      }

      log(`Done. Groups: ${sel.length}, Tokens: ${tokens}, Items removed: ${items}, Failed: ${failed}`);
      ui.notifications.info(L('HostileReset.Done', { items, tokens }));
      if (failed) ui.notifications.warn(L('HostileReset.Failed', { count: failed }));
      this.groups = scan();
    }

    async act(a) {
      if (this.busy) return;
      const acts = {
        scan: () => { this.groups = scan(); if (!this.groups.length) ui.notifications.warn(L('HostileReset.NoHostiles')); },
        all: () => this.check(true),
        none: () => this.check(false),
        purge: () => this.purge(),
      };
      if (!acts[a]) return;
      this.busy = true;
      try { await acts[a](); } finally { this.busy = false; this.render(); }
    }
  }

  let app = null;
  return { id: 'hostile-reset', title: 'VMTP.HostileReset.Title', hint: 'VMTP.HostileReset.Hint', icon: 'fa-broom', group: 'VMTP.Group.Inventory', gm: true, open: () => (app ??= new HostileResetApp()).render(true) };
};
