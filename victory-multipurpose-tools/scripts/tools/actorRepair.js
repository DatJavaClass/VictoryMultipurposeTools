/* Actor Repair: canary rebuild onto a fresh actor. */
import { L, esc, btn, on, VmtApp } from '../core.js';

const TAG = 'VMT ActorRepair |', SAC = '__VMT_SACRIFICE__';
const log = (...a) => console.log(TAG, ...a), warn = (...a) => console.warn(TAG, ...a);
const strip = (d) => { const o = { ...d }; delete o._id; return o; }; // embedded copy, no id
const selected = () => { const c = canvas.tokens?.controlled ?? []; return c.length === 1 ? c[0] : null; };
const dup = (v) => foundry.utils.duplicate(v ?? {});

/* One repair run; every failure lands in bad. */
class Repair {
  constructor(token, name, app) {
    this.token = token; this.actor = token.actor; this.name = name; this.app = app;
    this.orig = this.actor.name; this.bad = []; this.sacs = 0; this.sac = null;
    this.items = this.actor.items.map((i) => ({ id: i.id, uuid: i.uuid, name: i.name, type: i.type, data: i.toObject() }));
    this.sys = dup(this.actor.system); this.flags = dup(this.actor.flags); this.proto = dup(this.actor.prototypeToken);
  }

  say(k, d) { this.app.note(L(`ActorRepair.${k}`, d)); }

  async attempt(label, type, id, fn) {
    try { await fn(); return true; }
    catch (e) { const error = e?.message ?? String(e); this.bad.push({ label, type, id, error }); warn(`corruption: ${label} (${type}): ${error}`); return false; }
  }

  /* Fresh disposable actor, old one deleted first. */
  async spawn() {
    if (this.sac) await this.sac.delete().catch(() => {});
    this.say(this.sac ? 'Replaced' : 'Spawning');
    this.sac = await Actor.create({ name: SAC, type: this.actor.type }); this.sacs++;
    if (!this.sac) throw new Error(L('ActorRepair.SacFail'));
  }

  async manual(ids) {
    this.say('ManualMode');
    const skip = new Set(ids), items = this.items.filter((i) => !skip.has(i.id) && !skip.has(i.uuid)).map((i) => strip(i.data)), n = this.items.length - items.length;
    const fresh = await this.build(this.sys, this.flags, this.proto, items);
    return this.finish(fresh, n, L('ActorRepair.ManualNote', { n }));
  }

  /* Each element hits the sacrifice first. */
  async canary() {
    await this.spawn();
    const items = [];

    for (const it of this.items) {
      const d = strip(it.data), ok = await this.attempt(it.name, it.type, it.id, () => this.sac.createEmbeddedDocuments('Item', [d]));
      this.say(ok ? 'ItemOk' : 'ItemBad', { name: it.name, type: it.type, error: this.bad.at(-1)?.error ?? '' });
      if (!ok) { warn(`sacrifice consumed by "${it.name}" (${it.type})`); await this.spawn(); continue; }
      items.push(d);
      try { const added = this.sac.items.find((i) => i.name === it.name && i.type === it.type); if (added) await this.sac.deleteEmbeddedDocuments('Item', [added.id]); }
      catch { warn('sacrifice cleanup failed, replacing'); await this.spawn(); }
    }

    const blob = async (key, val) => { const label = L(`ActorRepair.${key}Label`); if (await this.attempt(label, key, key, () => this.sac.update({ [key]: val }))) return val; this.say('BlobBad', { label }); await this.spawn(); return {}; };
    const system = await blob('system', this.sys), flags = await blob('flags', this.flags), proto = {};
    for (const [k, v] of Object.entries(this.proto)) if (await this.attempt(`prototypeToken.${k}`, 'prototypeToken', k, () => this.sac.update({ [`prototypeToken.${k}`]: v }))) proto[k] = v; // bad field dropped solo

    await this.sac.delete().catch((e) => warn('final sacrifice not deleted:', e));
    log(`canary complete, sacrifices ${this.sacs}, log entries ${this.bad.length}`);
    const fresh = await this.build(system, flags, proto, items);
    return this.finish(fresh, this.bad.length, null);
  }

  async build(system, flags, prototypeToken, items) {
    this.say('Building');
    const fresh = await Actor.create({ name: this.name, type: this.actor.type, img: this.actor.img, system, flags, prototypeToken });
    if (!fresh) throw new Error(L('ActorRepair.BuildFail'));
    if (items.length) await fresh.createEmbeddedDocuments('Item', items);
    return fresh;
  }

  /* Swap tokens, shelve the original, whisper the report. */
  async finish(fresh, problems, note) {
    const td = this.token.document, scene = td.parent, pos = { x: td.x, y: td.y, width: td.width, height: td.height, disposition: td.disposition, hidden: td.hidden };
    await td.delete().catch((e) => warn('token not deleted:', e));
    await this.actor.update({ name: `${this.orig}.old` }).catch((e) => warn('rename failed:', e));
    try { await scene.createEmbeddedDocuments('Token', [{ ...pos, actorId: fresh.id, actorLink: true }]); }
    catch (e) { warn('fresh token not placed:', e); }

    const n = this.bad.length, row = (e) => `<li><b style="color:#ff9999">${esc(e.label)}</b> <span style="color:#888">[${esc(e.type)}]</span><br><small>${L('ActorRepair.Id')}: ${esc(e.id)}</small><br><small style="color:#ff5555">${esc(e.error)}</small></li>`;
    const line = (k, v) => `<b>${L(`ActorRepair.${k}`)}:</b> ${esc(v)}<br>`;
    const content = `<h3>${L('ActorRepair.ReportTitle')}</h3><p>${line('Original', `${this.orig}.old`)}${line('Rebuilt', fresh.name)}${line('Items', fresh.items.size)}${note ? line('Mode', note) : ''}${this.sacs ? line('Sacrifices', this.sacs) : ''}</p>
      <b style="color:${n ? '#ff5555' : '#55ff55'}">${L('ActorRepair.CorruptionLog', { n })}</b><ul>${this.bad.map(row).join('') || `<li style="color:#55ff55">${L('ActorRepair.Clean')}</li>`}</ul>`;
    try { await ChatMessage.create({ content, whisper: ChatMessage.getWhisperRecipients('GM') }); } catch (e) { warn('report not sent:', e); }

    const msg = L('ActorRepair.Done', { items: fresh.items.size }) + (problems ? L('ActorRepair.DoneBad', { n: problems }) : L('ActorRepair.DoneClean'));
    ui.notifications.info(msg); this.app.note(msg);
    log('repair complete', { original: `${this.orig}.old`, rebuilt: fresh.name, items: fresh.items.size, corruption: this.bad });
  }
}

class ActorRepairApp extends VmtApp {
  static DEFAULT_OPTIONS = { id: 'vmt-actor-repair', window: { title: 'VMT.ActorRepair.Title' }, position: { width: 520, height: 640 } };

  constructor(...args) { super(...args); this.token = null; this.name = ''; this.manual = false; this.ids = ''; this.busy = false; this.ask = false; this.lines = []; }

  html() {
    const a = this.token?.actor, dis = this.busy ? 'disabled' : '';
    const who = a ? `<div class="card act"><img class="face" src="${esc(a.img)}"><div><b>${esc(a.name)}</b><span class="hint">${L('ActorRepair.Meta', { type: a.type, items: a.items.size, id: a.id })}</span></div></div>` : `<p class="empty">${L('ActorRepair.NoSelection')}</p>`;
    const go = this.ask ? `<div class="row warn"><span>${L('ActorRepair.Ask', { name: esc(this.name || a?.name) })}</span>${btn('go', `<i class="fas fa-ambulance"></i> ${L('ActorRepair.Yes')}`, 'class="red"')}${btn('no', L('ActorRepair.No'))}</div>`
      : `<div class="row">${btn('begin', `<i class="fas fa-ambulance"></i> ${L('ActorRepair.Begin')}`, `class="gold" ${dis}`)}</div>`;
    return `<div class="row"><h3>${L('ActorRepair.Selected')}</h3>${btn('refresh', `<i class="fas fa-sync"></i> ${L('ActorRepair.Refresh')}`, `class="end" ${dis}`)}</div>${who}
      <label>${L('ActorRepair.NewName')}<input type="text" name="name" value="${esc(this.name)}" placeholder="${esc(a?.name ?? '')}" ${dis}></label>
      <p class="hint">${L('ActorRepair.RenameNote', { name: esc(a?.name ?? '') })}</p>
      <h3>${L('ActorRepair.Manual')}</h3>
      <label class="check"><input type="checkbox" name="manual" ${this.manual ? 'checked' : ''} ${dis}>${L('ActorRepair.ManualOn')}</label>
      ${this.manual ? `<p class="hint warn">${L('ActorRepair.ManualWarn')}</p>` : ''}
      <label>${L('ActorRepair.Ids')}<input type="text" name="ids" value="${esc(this.ids)}" placeholder="${L('ActorRepair.IdsPlaceholder')}" ${this.manual && !this.busy ? '' : 'disabled'}></label>
      ${go}<h3>${L('ActorRepair.Log')}</h3>
      <div class="list" data-keep="log">${this.lines.map((l) => `<div class="card ${l.bad ? 'bad' : ''}">${esc(l.text)}</div>`).join('') || `<p class="empty">${L('ActorRepair.NoLog')}</p>`}</div>`;
  }

  bind(root) { super.bind(root); on(root, 'change', '[name="manual"]', () => { this.sync(); this.render(); }); }
  sync() { const f = this.form(); this.name = (f.name ?? '').trim(); this.manual = !!f.manual; this.ids = f.ids ?? ''; } // fields survive re-render
  note(text, bad = false) { this.lines.push({ text, bad }); this.render(); }

  async act(a) {
    if (this.busy) return ui.notifications.warn(L('ActorRepair.Busy'));
    this.sync();
    const acts = {
      refresh: () => { this.token = selected(); this.render(); },
      begin: () => { this.token = selected(); if (!this.token) return ui.notifications.warn(L('ActorRepair.NoSelection')); if (!this.token.actor) return ui.notifications.error(L('ActorRepair.NoActor')); this.ask = true; this.render(); },
      no: () => { this.ask = false; this.render(); },
      go: () => this.run(),
    };
    return acts[a]?.();
  }

  async run() {
    const t = this.token, r = new Repair(t, this.name || t.actor.name, this), ids = this.ids.split(',').map((s) => s.trim()).filter(Boolean);
    this.busy = true; this.ask = false; this.lines = []; this.note(L('ActorRepair.Reading'));
    try { await (this.manual ? r.manual(ids) : r.canary()); }
    catch (e) { warn('run failed:', e); const msg = L('ActorRepair.RunFail', { error: e?.message ?? String(e) }); ui.notifications.error(msg); this.note(msg, true); }
    this.busy = false; this.token = null; this.render();
  }
}

let app = null;
export const tool = { id: 'actor-repair', title: 'VMT.ActorRepair.Title', hint: 'VMT.ActorRepair.Hint', icon: 'fa-briefcase-medical', group: 'VMT.Group.Actors', gm: true, open: () => (app ??= new ActorRepairApp()).render(true) };
