/* Transfer Inventory: items and coins, first to second. */
export default (vmt) => {
  const { App, adapter, ui: { esc, btn, confirm, i18n } } = vmt, L = i18n('VMTP'), TAG = 'VMTP Transfer |';
  const sel = () => (canvas.tokens?.controlled ?? []).filter((t) => t.actor).map((t) => t.actor);
  const physical = (actor) => actor.items.filter((i) => adapter.get().physical.includes(i.type));
  const coins = (actor) => { const { path, coins: names } = adapter.get().currency; return Object.fromEntries(names.map((c) => [c, Number(foundry.utils.getProperty(actor, `${path}.${c}`) || 0)])); };
  const purse = (actor) => Object.entries(coins(actor)).filter(([, n]) => n).map(([c, n]) => `${n} ${c}`).join(', ') || '0';
  const strip = (i) => { const d = i.toObject(); delete d._id; return d; }; // embedded copy, no id

  class TransferApp extends App {
    static DEFAULT_OPTIONS = { id: 'vmtp-transfer-inventory', window: { title: 'VMTP.Transfer.Title' }, position: { width: 420, height: 340 } };

    html() {
      const [src, dst] = sel();
      const card = (k, a) => `<div class="card"><h3>${L(k)}</h3>${a ? `<div class="row"><b>${esc(a.name)}</b><span class="muted end">${L('Transfer.Meta', { items: physical(a).length, coins: purse(a) })}</span></div>` : `<p class="empty">${L('Transfer.Pick')}</p>`}</div>`;
      return `<div class="row"><span class="hint">${L('Transfer.Hint')}</span>${btn('refresh', `<i class="fas fa-rotate"></i> ${L('Transfer.Refresh')}`, 'class="end"')}</div>
        <div class="list" data-keep="list">${card('Transfer.Source', src)}${card('Transfer.Destination', dst)}</div>
        <div class="row">${btn('run', `<i class="fas fa-right-left"></i> ${L('Transfer.Run')}`, 'class="gold"')}</div>`;
    }

    async act(a) {
      if (a === 'refresh') return this.render();
      if (a !== 'run') return;
      const [src, dst] = sel();
      if (!src || !dst) return ui.notifications.warn(L('Transfer.NeedTwo'));
      if (src === dst) return ui.notifications.warn(L('Transfer.Same'));
      if (!(await confirm(L('Transfer.Title'), L('Transfer.Ask', { src: esc(src.name), dst: esc(dst.name) })))) return;
      const { path, coins: names } = adapter.get().currency, from = coins(src), to = coins(dst), items = physical(src), moved = Object.values(from).reduce((s, n) => s + n, 0);

      try {
        await dst.update({ [path]: Object.fromEntries(names.map((c) => [c, to[c] + from[c]])) });
        await src.update({ [path]: Object.fromEntries(names.map((c) => [c, 0])) });
        if (items.length) { await dst.createEmbeddedDocuments('Item', items.map(strip)); await src.deleteEmbeddedDocuments('Item', items.map((i) => i.id)); }
      } catch (e) { console.error(TAG, 'transfer failed:', e); return ui.notifications.error(L('Transfer.Fail')); }

      console.log(TAG, `moved ${items.length} items and ${moved} coins from ${src.name} to ${dst.name}`);
      ui.notifications.info(L('Transfer.Done', { items: items.length, coins: moved, src: src.name, dst: dst.name }));
      this.render();
    }
  }

  let app = null;
  return { id: 'transfer-inventory', title: 'VMTP.Transfer.Title', hint: 'VMTP.Transfer.Hint', icon: 'fa-right-left', group: 'VMTP.Group.Inventory', gm: true, open: () => (app ??= new TransferApp()).render(true) };
};
