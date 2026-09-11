/* Linkage Repair: relink host compendium children by name. */
import { L, esc, btn, opt, confirm, VmtApp } from '../core.js';

const TAG = 'VMT Linkage |', MODES = ['class', 'race', 'custom'], norm = (s) => String(s ?? '').toLowerCase().trim();
const PRESETS = {
  class: { path: 'system.links.classAssociations', nameKey: 'name', uuidKey: 'uuid', skip: (n) => n.includes('bonus feat') || n.endsWith('(b)') }, /* bonus feats never resolve by name */
  race: { path: 'system.links.supplements', nameKey: 'name', uuidKey: 'uuid' },
};
const itemPacks = () => game.packs.filter((p) => p.documentName === 'Item').sort((a, b) => a.metadata.label.localeCompare(b.metadata.label));
const entryLabel = (e, nameKey) => String(foundry.utils.getProperty(e, nameKey) ?? '') + (e?.level != null ? ` (${L('Linkage.Level', { level: e.level })})` : '');

/* Child name to uuid map, last duplicate wins. */
const nameMap = (docs) => { const m = new Map(); for (const d of docs) { const k = norm(d.name); if (m.has(k)) console.warn(`${TAG} duplicate child name "${d.name}", last entry used`); m.set(k, d.uuid); } return m; };

/* Relink one host doc, write on change. */
async function repairDoc(doc, cfg, map, out) {
  const list = foundry.utils.getProperty(doc, cfg.path);
  if (!Array.isArray(list) || !list.length) return;
  out.hosts++;
  const manual = [], missing = [], next = [];
  let changed = 0;

  for (const e of list) {
    const name = norm(foundry.utils.getProperty(e, cfg.nameKey)), uuid = map.get(name);
    if (cfg.skip?.(name)) { manual.push(e); next.push(e); out.valid++; continue; }
    if (!uuid) { missing.push(e); next.push(e); out.notFound++; console.warn(`${TAG} "${doc.name}" > "${name}" not found in child pack`); continue; }
    const fixed = foundry.utils.deepClone(e);
    foundry.utils.setProperty(fixed, cfg.uuidKey, uuid);
    next.push(fixed);
    if (foundry.utils.getProperty(e, cfg.uuidKey) === uuid) out.valid++; else { changed++; console.log(`${TAG} "${doc.name}" > "${name}" relinked`); }
  }

  if (changed) try { await doc.update({ [cfg.path]: next }); out.repaired += changed; console.log(`${TAG} updated "${doc.name}", ${changed} link(s) repaired`); } catch (err) { out.failed += changed; console.error(`${TAG} update failed for "${doc.name}"`, err); }
  if (manual.length) out.manual.set(doc.name, manual);
  if (missing.length) out.missing.set(doc.name, missing);
}

class LinkageApp extends VmtApp {
  static DEFAULT_OPTIONS = { id: 'vmt-linkage-repair', window: { title: 'VMT.Linkage.Title' }, position: { width: 560, height: 560 } };

  constructor(...args) { super(...args); this.step = 'gate'; this.cfg = { mode: 'class', host: '', child: '', path: '', nameKey: 'name', uuidKey: 'uuid' }; this.out = null; }

  html() { return this[this.step](); }

  gate() {
    return `<div class="card warn"><b>${L('Linkage.WarnHead')}</b><p>${L('Linkage.WarnBody')}</p></div>
      <p>${L('Linkage.Intro')}</p><p>${L('Linkage.Match')}</p><p class="hint">${L('Linkage.OnlyUuid')}</p>
      <div class="row">${btn('proceed', `<i class="fas fa-exclamation-triangle"></i> ${L('Linkage.Proceed')}`, 'class="gold"')}${btn('cancel', `<i class="fas fa-times"></i> ${L('Linkage.Cancel')}`)}</div>`;
  }

  config() {
    const pairs = itemPacks().map((p) => [p.collection, `${p.metadata.label} (${p.collection})`]);
    if (!pairs.length) return `<p class="empty">${L('Linkage.NoPacks')}</p>`;
    const c = this.cfg, preset = PRESETS[c.mode], field = (n, ph) => `<label>${L(`Linkage.${n}`)}<input type="text" name="${n}" value="${esc(c[n])}" placeholder="${esc(ph)}"></label>`;
    c.host ||= pairs[0][0]; c.child ||= (pairs[1] ?? pairs[0])[0];
    const pick = (n) => `<div><label>${L(`Linkage.${n}`)}<select name="${n}">${opt(pairs, c[n])}</select></label><span class="hint">${L(`Linkage.${n}Hint`)}</span></div>`;
    const custom = preset ? `<p class="muted">${L('Linkage.PresetPath', { path: preset.path })}</p>` : `${field('path', 'system.links.classAssociations')}<div class="grid2">${field('nameKey', 'name')}${field('uuidKey', 'uuid')}</div>`;
    return `<p class="hint">${L('Linkage.ConfigHint')}</p>
      <label>${L('Linkage.Mode')}<select name="mode">${opt(MODES.map((k) => [k, L(`Linkage.Preset.${k}`)]), c.mode)}</select></label>
      ${pick('host')}${pick('child')}${custom}
      <div class="row">${btn('run', `<i class="fas fa-link"></i> ${L('Linkage.Run')}`, 'class="gold"')}${btn('cancel', `<i class="fas fa-times"></i> ${L('Linkage.Cancel')}`)}</div>`;
  }

  busy() { return `<p class="empty">${L('Linkage.Loading')}</p>`; }

  done() {
    const o = this.out, kv = (k, v) => `<div class="row"><span>${L(k)}</span><b class="end">${v}</b></div>`, work = o.manual.size || o.missing.size;
    const section = (head, body, map) => (map.size ? `<h3>${L(head)}</h3><p class="hint">${L(body)}</p>` + [...map].map(([h, es]) => `<div class="card"><b>${esc(h)}</b>${es.map((e) => `<div class="muted">${esc(entryLabel(e, o.nameKey))}</div>`).join('')}</div>`).join('') : '');
    return `<div class="card">${kv('Linkage.Hosts', o.hosts)}${kv('Linkage.Repaired', o.repaired)}${kv('Linkage.Valid', o.valid)}${kv('Linkage.NotFound', o.notFound)}${o.failed ? kv('Linkage.Failed', o.failed) : ''}</div>
      <p class="${work ? 'bad' : 'ok'}">${L(work ? 'Linkage.ManualNeeded' : 'Linkage.Clean')}</p>
      <div class="list" data-keep="report">${section('Linkage.ManualHead', 'Linkage.ManualBody', o.manual)}${section('Linkage.MissingHead', 'Linkage.MissingBody', o.missing)}</div>
      <div class="row">${btn('proceed', `<i class="fas fa-redo"></i> ${L('Linkage.Again')}`)}${btn('cancel', `<i class="fas fa-check"></i> ${L('Linkage.Close')}`)}</div>`;
  }

  bind(root) { super.bind(root); root.addEventListener('change', (ev) => { const n = ev.target.name; if (!n) return; this.cfg[n] = ev.target.value; if (n === 'mode') this.render(); }); } /* mode swap reveals custom fields */

  async act(a) {
    const acts = { proceed: () => { this.step = 'config'; this.render(); }, cancel: () => this.close(), run: () => this.run() };
    return acts[a]?.();
  }

  /* Validate, confirm, load packs, repair hosts. */
  async run() {
    Object.assign(this.cfg, this.form());
    const c = this.cfg, preset = PRESETS[c.mode], cfg = preset ? { ...preset } : { path: c.path.trim(), nameKey: c.nameKey.trim() || 'name', uuidKey: c.uuidKey.trim() || 'uuid' };
    const host = game.packs.get(c.host), child = game.packs.get(c.child), fail = (k, d) => ui.notifications.error(L(k, d));
    if (!cfg.path) return fail('Linkage.NeedPath');
    if (!host || !child) return fail('Linkage.NoPack');
    if (host === child) return fail('Linkage.Same');
    if (host.locked) return fail('Linkage.Locked', { label: host.metadata.label });
    if (!await confirm(L('Linkage.Title'), L('Linkage.RunAsk', { host: esc(host.metadata.label), child: esc(child.metadata.label), path: esc(cfg.path) }))) return;

    this.step = 'busy'; this.render();
    let hostDocs, childDocs;
    try { [hostDocs, childDocs] = await Promise.all([host.getDocuments(), child.getDocuments()]); } catch (err) { console.error(`${TAG} pack load failed`, err); this.step = 'config'; this.render(); return fail('Linkage.LoadFail'); }
    if (!hostDocs.length || !childDocs.length) { this.step = 'config'; this.render(); return fail(hostDocs.length ? 'Linkage.ChildEmpty' : 'Linkage.HostEmpty'); }

    console.log(`${TAG} host "${host.metadata.label}" ${hostDocs.length} doc(s), child "${child.metadata.label}" ${childDocs.length} doc(s), path ${cfg.path}`);
    const map = nameMap(childDocs), out = { hosts: 0, repaired: 0, valid: 0, notFound: 0, failed: 0, manual: new Map(), missing: new Map(), nameKey: cfg.nameKey };
    for (const doc of hostDocs) await repairDoc(doc, cfg, map, out);
    console.log(`${TAG} done: ${out.hosts} host doc(s), ${out.repaired} repaired, ${out.valid} already valid, ${out.notFound} not found, ${out.failed} failed`);
    for (const [h, es] of out.manual) console.log(`${TAG} manual repair "${h}": ${es.map((e) => entryLabel(e, cfg.nameKey)).join(', ')}`);
    for (const [h, es] of out.missing) console.log(`${TAG} not found "${h}": ${es.map((e) => entryLabel(e, cfg.nameKey)).join(', ')}`);
    this.out = out; this.step = 'done'; this.render();
  }
}

let app = null;
export const tool = { id: 'linkage-repair', title: 'VMT.Linkage.Title', hint: 'VMT.Linkage.Hint', icon: 'fa-link', group: 'VMT.Group.Compendiums', gm: true, open: () => (app ??= new LinkageApp()).render(true) };
