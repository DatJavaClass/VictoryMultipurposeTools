/* Item Update: swap stale items for compendium versions. */
import { L, esc, btn, opt, VmtApp } from '../core.js';

const log = (...m) => console.log('VMT ItemUpdate |', ...m);
const SCOPE = { all: () => true, pc: (a) => a.type === 'character', npc: (a) => a.type === 'npc', hostile: (a, t) => a.type === 'npc' && t.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE };
const matcher = (mode, needle) => (mode === 'uuid' ? (i) => (i._stats?.compendiumSource ?? i.flags?.core?.sourceId ?? '') === needle : (i) => i.name.toLowerCase() === needle.toLowerCase());

/* Scene actors in scope, linked tokens deduped. */
function scoped(scope) {
  const seen = new Set(), out = [];
  for (const t of canvas.tokens.placeables) { const a = t.actor; if (!a || seen.has(a.id) || !SCOPE[scope]?.(a, t)) continue; seen.add(a.id); out.push(a); }
  return out;
}

class ItemUpdateApp extends VmtApp {
  static DEFAULT_OPTIONS = { id: 'vmt-item-update', window: { title: 'VMT.ItemUpdate.Title' }, position: { width: 520, height: 560 } };

  constructor(...args) { super(...args); this.cur = { mode: 'name', target: '', uuid: '', scope: 'all' }; this.plan = null; this.busy = false; }

  html() {
    const c = this.cur, p = this.plan, dis = this.busy ? 'disabled' : '';
    const field = (name, key) => `<label>${L(`ItemUpdate.${key}`)}<input type="text" name="${name}" value="${esc(c[name])}" placeholder="${L(`ItemUpdate.${key}Placeholder`)}"></label><span class="hint">${L(`ItemUpdate.${key}Hint`)}</span>`;
    const sel = (name, key) => `<label>${L(`ItemUpdate.${key}`)}<select name="${name}">${opt(Object.keys(key === 'Scope' ? SCOPE : { name: 1, uuid: 1 }).map((k) => [k, L(`ItemUpdate.${key}s.${k}`)]), c[name])}</select></label>`;
    const cards = p ? p.actors.map(({ actor, items }) => `<div class="card"><div class="row"><b>${esc(actor.name)}</b><span class="badge">${L('ItemUpdate.Matches', { count: items.length })}</span></div></div>`).join('') : '';
    const strip = p ? `<div class="card act"><i class="fas fa-exclamation-triangle"></i><span>${L('ItemUpdate.Ask', { count: p.count, actors: p.actors.length, name: esc(p.doc.name) })}</span>${btn('run', `<i class="fas fa-sync-alt"></i> ${L('ItemUpdate.Run')}`, `class="red end" ${dis}`)}${btn('cancel', L('ItemUpdate.Cancel'), dis)}</div>` : '';
    return `<div class="main">
        <div class="grid2">${sel('mode', 'Mode')}${sel('scope', 'Scope')}</div>
        ${field('target', 'Target')}
        ${field('uuid', 'Replacement')}
        <span class="hint">${L('ItemUpdate.QuantityNote')}</span>
        <div class="row">${btn('plan', `<i class="fas fa-search"></i> ${L('ItemUpdate.Scan')}`, `class="gold" ${dis}`)}</div>
        ${strip}
        <div class="list" data-keep="plan">${cards || `<p class="empty">${L('ItemUpdate.Start')}</p>`}</div>
      </div>`;
  }

  read() { const f = this.form(); this.cur = { mode: f.mode, target: f.target.trim(), uuid: f.uuid.trim(), scope: f.scope }; return this.cur; }

  /* Validate, load replacement, gather matches; no writes. */
  async scan() {
    const { mode, target, uuid, scope } = this.read(), warn = (k, d) => { ui.notifications.warn(L(`ItemUpdate.${k}`, d)); return null; };
    if (!target) return warn('NeedTarget');
    if (!uuid) return warn('NeedUuid');
    const doc = await fromUuid(uuid).catch(() => null);
    if (!doc) { ui.notifications.error(L('ItemUpdate.BadUuid', { uuid })); return null; }
    log(`Replacement loaded: "${doc.name}" (${uuid})`);

    const actors = scoped(scope);
    if (!actors.length) return warn('NoActors', { scope: L(`ItemUpdate.Scopes.${scope}`) });
    log(`Scope "${scope}" resolved to ${actors.length} actor(s).`);
    const hit = matcher(mode, target), found = actors.map((actor) => ({ actor, items: actor.items.filter(hit) })).filter((x) => x.items.length), count = found.reduce((n, x) => n + x.items.length, 0);
    if (!count) { log(`No matches. Scope: "${scope}", Target: "${target}", Mode: "${mode}"`); return warn('NoMatches'); }
    return { doc, actors: found, count };
  }

  /* Delete old, create new, quantity carries over. */
  async run() {
    const { doc, actors } = this.plan, base = doc.toObject();
    delete base._id;
    let done = 0, failed = 0;
    for (const { actor, items } of actors) {
      log(`Processing "${actor.name}", ${items.length} match(es)`);
      for (const old of items) {
        const data = foundry.utils.deepClone(base), qty = old.system?.quantity ?? null;
        if (qty !== null && data.system?.quantity !== undefined) { data.system.quantity = qty; log(`Preserving quantity: ${qty}`); }
        try { await old.delete(); await actor.createEmbeddedDocuments('Item', [data]); done++; log(`Replaced "${old.name}" on "${actor.name}"`); }
        catch (e) { failed++; console.error('VMT ItemUpdate |', `Failed on "${actor.name}":`, e); }
      }
    }
    log(`Complete. ${done} replacement(s) across ${actors.length} actor(s), ${failed} failed.`);
    ui.notifications.info(L('ItemUpdate.Done', { count: done, actors: actors.length }));
    if (failed) ui.notifications.warn(L('ItemUpdate.Failed', { count: failed }));
  }

  async act(a) {
    if (this.busy) return;
    const acts = {
      plan: async () => { this.plan = await this.scan(); },
      run: async () => { if (this.plan) await this.run(); this.plan = null; },
      cancel: () => { this.read(); this.plan = null; },
    };
    if (!acts[a]) return;
    this.busy = true;
    try { await acts[a](); } finally { this.busy = false; this.render(); }
  }
}

let app = null;
export const tool = { id: 'item-update', title: 'VMT.ItemUpdate.Title', hint: 'VMT.ItemUpdate.Hint', icon: 'fa-sync-alt', group: 'VMT.Group.Items', gm: true, open: () => (app ??= new ItemUpdateApp()).render(true) };
