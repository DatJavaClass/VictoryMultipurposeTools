/* Identify All: mark selected actors' items identified. */
export default (vmt) => {
  const { App, adapter, ui: { esc, btn, confirm, i18n } } = vmt, L = i18n('VMTP'), TAG = 'VMTP IdentifyAll |';
  const sel = () => (canvas.tokens?.controlled ?? []).filter((t) => t.actor).map((t) => t.actor);
  const unid = (actor) => actor.items.filter((i) => foundry.utils.getProperty(i, adapter.get().identified) === false);

  class IdentifyAllApp extends App {
    static DEFAULT_OPTIONS = { id: 'vmtp-identify-all', window: { title: 'VMTP.IdentifyAll.Title' }, position: { width: 400, height: 380 } };

    html() {
      const rows = sel().map((a) => `<div class="card"><div class="row"><b>${esc(a.name)}</b><span class="muted end">${L('IdentifyAll.Meta', { n: unid(a).length })}</span></div></div>`).join('');
      return `<div class="row"><span class="hint">${L('IdentifyAll.Hint')}</span>${btn('refresh', `<i class="fas fa-rotate"></i> ${L('IdentifyAll.Refresh')}`, 'class="end"')}</div>
        <div class="list" data-keep="list">${rows || `<p class="empty">${L('IdentifyAll.NoSelection')}</p>`}</div>
        <div class="row">${btn('run', `<i class="fas fa-eye"></i> ${L('IdentifyAll.Run')}`, 'class="gold"')}</div>`;
    }

    async act(a) {
      if (a === 'refresh') return this.render();
      if (a !== 'run') return;
      const actors = sel();
      if (!actors.length) return ui.notifications.warn(L('IdentifyAll.NoSelection'));
      if (!(await confirm(L('IdentifyAll.Title'), L('IdentifyAll.Ask', { n: actors.length })))) return;
      let items = 0, touched = 0;

      for (const actor of actors) {
        const upd = unid(actor).map((i) => ({ _id: i.id, [adapter.get().identified]: true }));
        if (!upd.length) continue;
        try { await actor.updateEmbeddedDocuments('Item', upd); items += upd.length; touched++; }
        catch (e) { console.warn(TAG, `${actor.name} failed:`, e); }
      }

      console.log(TAG, `identified ${items} items across ${touched} actors`);
      ui.notifications.info(items ? L('IdentifyAll.Done', { items, actors: touched }) : L('IdentifyAll.None'));
      this.render();
    }
  }

  let app = null;
  return { id: 'identify-all', title: 'VMTP.IdentifyAll.Title', hint: 'VMTP.IdentifyAll.Hint', icon: 'fa-eye', group: 'VMTP.Group.Inventory', gm: true, open: () => (app ??= new IdentifyAllApp()).render(true) };
};
