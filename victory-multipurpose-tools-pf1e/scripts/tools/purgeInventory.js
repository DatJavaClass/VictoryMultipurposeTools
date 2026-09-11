/* Purge Inventory: delete physical items, features stay. */
export default (vmt) => {
  const { App, adapter, ui: { esc, btn, confirm, i18n } } = vmt, L = i18n('VMTP'), TAG = 'VMTP Purge |';
  const first = () => (canvas.tokens?.controlled ?? []).find((t) => t.actor)?.actor ?? null;
  const physical = (actor) => actor.items.filter((i) => adapter.get().physical.includes(i.type));

  class PurgeApp extends App {
    static DEFAULT_OPTIONS = { id: 'vmtp-purge-inventory', window: { title: 'VMTP.Purge.Title' }, position: { width: 400, height: 260 } };

    html() {
      const actor = first(), n = actor ? physical(actor).length : 0;
      return `<div class="row"><span class="hint">${L('Purge.Hint')}</span>${btn('refresh', `<i class="fas fa-rotate"></i> ${L('Purge.Refresh')}`, 'class="end"')}</div>
        <div class="list" data-keep="list">${actor ? `<div class="card"><div class="row"><b>${esc(actor.name)}</b><span class="muted end">${L('Purge.Meta', { n, total: actor.items.size })}</span></div></div>` : `<p class="empty">${L('Purge.NoSelection')}</p>`}</div>
        <div class="row">${btn('run', `<i class="fas fa-fire"></i> ${L('Purge.Run')}`, 'class="red"')}</div>`;
    }

    async act(a) {
      if (a === 'refresh') return this.render();
      if (a !== 'run') return;
      const actor = first();
      if (!actor) return ui.notifications.warn(L('Purge.NoSelection'));
      const ids = physical(actor).map((i) => i.id);
      if (!ids.length) return ui.notifications.info(L('Purge.None', { name: actor.name }));
      if (!(await confirm(L('Purge.Title'), L('Purge.Ask', { n: ids.length, name: esc(actor.name) })))) return;

      try { await actor.deleteEmbeddedDocuments('Item', ids); }
      catch (e) { console.error(TAG, 'purge failed:', e); return ui.notifications.error(L('Purge.Fail')); }

      console.log(TAG, `purged ${ids.length} items from ${actor.name}`);
      ui.notifications.info(L('Purge.Done', { n: ids.length, name: actor.name }));
      this.render();
    }
  }

  let app = null;
  return { id: 'purge-inventory', title: 'VMTP.Purge.Title', hint: 'VMTP.Purge.Hint', icon: 'fa-fire', group: 'VMTP.Group.Inventory', gm: true, open: () => (app ??= new PurgeApp()).render(true) };
};
