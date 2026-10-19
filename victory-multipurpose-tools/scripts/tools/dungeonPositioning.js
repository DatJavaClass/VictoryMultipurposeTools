/* Dungeon Positioning: scene beacons, place, search, pan. */
import { MODULE_ID, L, esc, btn, opt, confirm, VmtApp, socket } from '../core.js';

const { DialogV2 } = foundry.applications.api;
const CAP = 5, PAN = 1200, FLAG = 'beacons', LOG = 'VMT Positioning |';
const ICON = { poi: 'fa-map', merchant: 'fa-coins', entrance: 'fa-sign-in-alt', exit: 'fa-sign-out-alt', player: 'fa-map-pin' };
const ORDER = Object.keys(ICON), GM_TYPES = ORDER.filter((t) => t !== 'player');

/* Flag read local, write via active GM. */
const read = (scene) => foundry.utils.deepClone(scene?.getFlag(MODULE_ID, FLAG) ?? []);
const write = (scene, beacons) => socket.emit('positioning', { sceneId: scene.id, beacons });
socket.on('positioning', async ({ sceneId, beacons } = {}) => {
  if (game.user !== game.users.activeGM) return; /* in: not active GM, out: skip */
  const scene = game.scenes.get(sceneId);
  if (!scene) return console.warn(LOG, 'no scene', sceneId); /* in: no scene, out: warn */
  try { await scene.setFlag(MODULE_ID, FLAG, beacons); } catch (e) { console.error(LOG, 'flag write failed', e); } /* failed write: log */
});

const own = (b) => b.ownerUserId === game.user.id;
const newId = () => crypto.randomUUID?.() ?? foundry.utils.randomID();
const kind = (b) => (ICON[b.type] ? b.type : 'poi'); /* unknown renders poi */

/* One snapped canvas click; right click cancels. */
const pick = () => new Promise((done) => {
  ui.notifications.info(L('Positioning.ClickMap'));
  const stop = () => { canvas.stage.off('mousedown', down); document.removeEventListener('keydown', key, true); };
  const down = (ev) => {
    const which = ev.data?.originalEvent?.button ?? ev.button ?? 0;
    if (which === 2) { stop(); return done(null); } /* in: right click, out: cancel */
    if (which !== 0) return; /* other buttons ignored, keep listening */
    const p = (ev.data ?? ev).getLocalPosition(canvas.stage), g = canvas.grid.size;
    stop(); done({ x: Math.floor(p.x / g) * g, y: Math.floor(p.y / g) * g });
  };
  const key = (ev) => { if (ev.key === 'Escape') { stop(); done(null); } }; /* in: Escape, out: cancel */
  canvas.stage.on('mousedown', down); document.addEventListener('keydown', key, true);
});

/* Journal import, pages flagged world.dps-scene-id. */
export async function importJournal(uuid) {
  const journal = await fromUuid(uuid), out = { scenes: 0, beacons: 0 }, div = document.createElement('div');
  if (!journal?.pages) throw new Error(L('Positioning.NoJournal')); /* in: no pages, out: throw */
  const same = (a, b) => a.id === b.id || (a.name === b.name && a.type === b.type && a.ownerUserId === b.ownerUserId);
  for (const page of journal.pages) { /* in: each page, out: flags written */
    const scene = game.scenes.get(page.flags?.world?.['dps-scene-id']);
    if (!scene) continue; /* in: no scene, out: next page */
    let data;
    try { div.innerHTML = page.text?.content ?? ''; data = JSON.parse(div.textContent || '{}'); } catch (e) { console.warn(LOG, 'skipped page', page.name, e); continue; } /* bad page: skip */
    const cur = read(scene), add = (Array.isArray(data.beacons) ? data.beacons : []).filter((b) => !cur.some((c) => same(c, b))); /* array or empty */
    if (!add.length) continue; /* in: nothing new, out: next */
    try { await scene.setFlag(MODULE_ID, FLAG, [...cur, ...add]); out.scenes++; out.beacons += add.length; } catch (e) { console.error(LOG, 'import write failed', scene.name, e); } /* failed write: log */
  }
  console.log(LOG, 'import done', out);
  return out;
}

/* Header button flow: uuid prompt, import, report. */
async function askImport(app) {
  const uuid = await DialogV2.prompt({ window: { title: L('Positioning.ImportTitle') }, content: `<label>${L('Positioning.ImportUuid')}<input type="text" name="uuid" autofocus></label>`, ok: { label: L('Positioning.ImportGo'), icon: 'fas fa-file-import', callback: (ev, b) => b.form.elements.uuid.value.trim() }, rejectClose: false });
  if (!uuid) return; /* in: cancelled, out: exit */
  try { ui.notifications.info(L('Positioning.ImportDone', await importJournal(uuid))); app.render(); } catch (e) { ui.notifications.error(e.message); console.error(LOG, 'import failed', e); } /* failure: notify and log */
}

class PositioningApp extends VmtApp {
  static DEFAULT_OPTIONS = { id: 'vmt-dungeon-positioning', window: { title: 'VMT.Positioning.Title', controls: [{ icon: 'fas fa-file-import', label: 'VMT.Positioning.Import', action: 'import' }] }, actions: { import() { return askImport(this); } }, position: { width: 560, height: 640 } };

  constructor(...args) { super(...args); this.view = 'gm'; this.q = ''; this.draft = null; }

  _getHeaderControls() { return super._getHeaderControls().filter((c) => c.action !== 'import' || game.user.isGM); } /* import is GM only */

  html() {
    const scene = canvas.scene, gm = game.user.isGM;
    if (!scene) return `<p class="empty">${L('Positioning.NoScene')}</p>`; /* in: no scene, out: empty text */
    const all = read(scene), mine = all.filter(own).length, nGm = all.filter((b) => !b.ownerUserId).length;
    const stats = gm ? L('Positioning.StatsGm', { gm: nGm, player: all.length - nGm }) : L('Positioning.StatsPlayer', { n: mine, cap: CAP }); /* GM or player */
    const toggle = btn('view', `<i class="fas fa-exchange-alt"></i> ${L(this.view === 'gm' ? 'Positioning.ViewPlayer' : 'Positioning.ViewGm')}`, 'class="end"'); /* label flips view */
    const d = this.draft, draft = d ? `<div class="card"><div class="grid2">${gm ? `<label>${L('Positioning.TypeLabel')}<select name="type">${opt(GM_TYPES.map((t) => [t, L(`Positioning.Type.${t}`)]), d.type)}</select></label>` : ''}<label>${L('Positioning.Name')}<input type="text" name="name" maxlength="60" value="${esc(d.name)}" placeholder="${L(gm ? 'Positioning.NameHintGm' : 'Positioning.NameHintPlayer')}"></label></div>
        <div class="row">${btn('save', `<i class="fas fa-check"></i> ${L(d.id ? 'Positioning.Update' : 'Positioning.Place')}`, 'class="gold"')}${btn('cancel', L('Positioning.Cancel'))}<span class="muted">x:${d.x} y:${d.y}</span></div></div>` : ''; /* card or empty */
    const mark = btn('mark', `<i class="fas fa-map-pin"></i> ${L('Positioning.Mark')}${gm ? '' : ` (${mine}/${CAP})`}`, `class="gold" ${!gm && mine >= CAP ? 'disabled' : ''}`); /* cap disables button */
    return `<div class="row"><b>${esc(scene.name)}</b><span class="muted">${stats}</span>${toggle}</div>
      <div class="row"><input type="text" name="q" placeholder="${L('Positioning.Search')}" value="${esc(this.q)}"></div>
      ${draft}
      <div class="list" data-keep="list">${this.rows()}</div>
      <div class="row">${d ? '' : mark}${gm ? '' : `<span class="hint">${L('Positioning.PlayerNote')}</span>`}</div>`; /* in: draft, out: no mark; player note */
  }

  /* View pool, searched, GM view type sorted. */
  rows() {
    const gm = game.user.isGM, all = read(canvas.scene);
    let pool = all.filter((b) => (this.view === 'gm') === !b.ownerUserId); /* GM or player */
    if (!gm && this.view === 'player') pool = pool.filter(own); /* in: player view, out: own only */
    if (this.q) pool = pool.filter((b) => (b.name ?? '').toLowerCase().includes(this.q)); /* in: search text, out: name match */
    if (this.view === 'gm') pool.sort((a, b) => ORDER.indexOf(kind(a)) - ORDER.indexOf(kind(b))); /* in: GM view, out: type sorted */
    if (!pool.length) return `<p class="empty">${L(this.q ? 'Positioning.NoneSearch' : this.view === 'gm' ? 'Positioning.NoneGm' : 'Positioning.NonePlayer')}</p>`; /* empty text: search, GM, player */
    const ic = (act, icon, title, id) => btn(act, `<i class="fas ${icon}"></i>`, `class="ic" data-id="${esc(id)}" title="${title}"`);
    return pool.map((b) => `<div class="card act" data-act="pan" data-id="${esc(b.id)}"><i class="fas ${ICON[kind(b)]}"></i><div><b>${esc(b.name)}</b><span class="hint">${L(`Positioning.Type.${kind(b)}`)}${b.ownerName ? `, ${L('Positioning.By', { name: esc(b.ownerName) })}` : ''}</span></div>
      <div class="row">${gm && this.view === 'gm' ? ic('edit', 'fa-edit', L('Positioning.Edit'), b.id) : ''}${gm || own(b) ? ic('del', 'fa-trash', L('Delete'), b.id) : ''}</div></div>`).join(''); /* edit GM only, delete GM or owner */
  }

  bind(root) {
    super.bind(root);
    root.addEventListener('input', (ev) => { if (ev.target.name === 'q') { this.q = ev.target.value.trim().toLowerCase(); root.querySelector('[data-keep="list"]').innerHTML = this.rows(); } }); /* in: q input, out: list only */
    root.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.name === 'name') this.act('save'); }); /* in: Enter on name, out: save */
  }

  async mark(scene, gm) {
    if (!scene) return ui.notifications.warn(L('Positioning.NoScene')); /* guards: warn and exit */
    if (!game.users.activeGM) return ui.notifications.warn(L('Positioning.NoGm')); /* in: no GM, out: warn */
    if (!gm && read(scene).filter(own).length >= CAP) return ui.notifications.warn(L('Positioning.Cap', { cap: CAP })); /* in: player at cap, out: warn */
    await this.minimize(); const at = await pick(); await this.maximize();
    if (!at) return ui.notifications.info(L('Positioning.Cancelled')); /* in: cancelled, out: info */
    this.draft = { ...at, type: gm ? 'poi' : 'player', name: '' }; this.render(); /* GM poi, else player */
  }

  /* Draft to beacon: edit or push. */
  save(scene, gm, list) {
    const name = this.val('name').trim(), d = this.draft;
    if (!name) return ui.notifications.warn(L('Positioning.NeedName')); /* in: no name, out: warn */
    if (!game.users.activeGM) return ui.notifications.warn(L('Positioning.NoGm')); /* in: no GM, out: warn */
    const type = gm ? this.val('type') || d.type : 'player', cur = d.id && list.find((x) => x.id === d.id); /* chosen type, else player */
    if (cur) Object.assign(cur, { name, type }); else list.push({ id: newId(), name, type, x: d.x, y: d.y, ownerUserId: gm ? null : game.user.id, ownerName: gm ? null : game.user.name }); /* in: edit, out: update, else push */
    write(scene, list); this.draft = null; this.render();
    ui.notifications.info(L(cur ? 'Positioning.Updated' : 'Positioning.Placed', { name })); /* edited: Updated, else Placed */
  }

  async act(a, ds) {
    const scene = canvas.scene, gm = game.user.isGM, list = read(scene), b = list.find((x) => x.id === ds.id);
    const acts = {
      view: () => { this.view = this.view === 'gm' ? 'player' : 'gm'; this.render(); }, /* toggle GM and player */
      mark: () => this.mark(scene, gm),
      cancel: () => { this.draft = null; this.render(); },
      save: () => this.save(scene, gm, list),
      pan: async () => { if (!b) return; const g = canvas.grid.size; await this.minimize(); canvas.animatePan({ x: b.x + g / 2, y: b.y + g / 2, scale: 1.5, duration: PAN }); ui.notifications.info(L('Positioning.Viewing', { name: b.name })); }, /* in: no beacon, out: exit */
      edit: () => { if (b && gm) { this.draft = { ...b }; this.render(); } }, /* in: GM and beacon, out: draft */
      del: async () => { if (b && (gm || own(b)) && await confirm(L('Positioning.Title'), L('Positioning.DeleteAsk', { name: b.name }))) write(scene, list.filter((x) => x.id !== b.id)); }, /* in: allowed and confirmed, out: write */
    };
    return acts[a]?.();
  }
}

let app = null;
Hooks.on('updateScene', (scene, change) => { if (app?.rendered && foundry.utils.hasProperty(change, `flags.${MODULE_ID}.${FLAG}`)) app.render(); }); /* in: flag change, out: rerender */
Hooks.on('canvasReady', () => { if (app?.rendered) { app.draft = null; app.render(); } }); /* draft coords die with the scene */
export const tool = { id: 'dungeon-positioning', title: 'VMT.Positioning.Title', hint: 'VMT.Positioning.Hint', icon: 'fa-map-marker-alt', group: 'VMT.Group.Scenes', gm: false, open: () => (app ??= new PositioningApp()).render(true) };
