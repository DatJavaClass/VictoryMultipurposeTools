/* Inspect Inventory: item by type breakdown, follows selection. */
export default (vmt) => {
  const { App, adapter, ui: { esc, i18n } } = vmt, L = i18n('VMTP');
  const first = () => (canvas.tokens?.controlled ?? []).find((t) => t.actor)?.actor ?? null;
  const prop = (doc, key) => foundry.utils.getProperty(doc, adapter.get()[key]);
  const label = (t) => game.i18n.localize(CONFIG.Item.typeLabels?.[t] ?? t);
  const rank = (t) => { const o = [...adapter.get().physical, ...adapter.get().features], i = o.indexOf(t); return i < 0 ? o.length : i; }; // physical first, features next

  class InspectApp extends App {
    static DEFAULT_OPTIONS = { id: 'vmtp-inspect-inventory', window: { title: 'VMTP.Inspect.Title' }, position: { width: 420, height: 520 } };

    constructor(...args) { super(...args); this.shown = new Set(); this.hook = null; }

    html() {
      const actor = first();
      if (!actor) return `<p class="empty">${L('Inspect.NoSelection')}</p>`;
      const groups = {}, phys = actor.items.filter((i) => adapter.get().physical.includes(i.type)).length;
      for (const i of actor.items) (groups[i.type] ??= []).push(i);
      const row = (i) => { const q = prop(i, 'quantity') ?? 1, un = prop(i, 'identified') === false; return `<li>${esc(i.name)}${q > 1 ? `<span class="muted"> x${q}</span>` : ''}${un ? `<span class="unid"> ${L('Inspect.Unid')}</span>` : ''}</li>`; };
      const block = ([t, items]) => `<details data-type="${esc(t)}" ${this.shown.has(t) ? 'open' : ''}><summary>${esc(label(t))}<span class="badge">${items.length}</span></summary><ul>${items.map(row).join('')}</ul></details>`;
      const blocks = Object.entries(groups).sort(([a], [b]) => rank(a) - rank(b) || label(a).localeCompare(label(b))).map(block).join('');
      return `<div class="card"><div class="row"><b>${esc(actor.name)}</b><span class="muted end">${L('Inspect.Meta', { items: actor.items.size, phys })}</span></div></div>
        <div class="list" data-keep="list">${blocks || `<p class="empty">${L('Inspect.NoItems')}</p>`}</div>`;
    }

    bind(root) { super.bind(root); root.addEventListener('toggle', (ev) => { const d = ev.target; if (d.tagName === 'DETAILS') this.shown[d.open ? 'add' : 'delete'](d.dataset.type); }, true); } // toggle never bubbles, capture it

    _onFirstRender() { super._onFirstRender(); this.hook = Hooks.on('controlToken', foundry.utils.debounce(() => this.rendered && this.render(), 50)); }
    _onClose(opts) { super._onClose(opts); Hooks.off('controlToken', this.hook); }
  }

  let app = null;
  return { id: 'inspect-inventory', title: 'VMTP.Inspect.Title', hint: 'VMTP.Inspect.Hint', icon: 'fa-magnifying-glass', group: 'VMTP.Group.Inventory', gm: true, open: () => (app ??= new InspectApp()).render(true) };
};
