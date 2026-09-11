/* Light Adjuster: bulk edit lights on viewed scene. */
import { MODULE_ID, L, esc, btn, opt, confirm, VmtApp, store } from '../core.js';

const CURVE = { 0: 0.85, 3: 0.80, 4: 0.70, 5: 0.55, 6: 0.40, 6.5: 0.30, 8: 0.15, 9: 0, 17.5: 0.10, 18: 0, 18.5: 0.25, 19: 0.35, 19.5: 0.50, 21: 0.70, 21.5: 0.75, 23: 0.80, 24: 0.85 }; /* hour to darkness keyframes */
const FILTERS = ['color', 'tag', 'name', 'selected', 'all'], MODES = ['time', 'raw'], CHKS = ['chkColor', 'chkDim', 'chkBright', 'chkAlpha', 'chkAnim'];
const ANIM = ['torch', 'pulse', 'chroma', 'wave', 'fog', 'sunburst', 'dome', 'emanation', 'hexa', 'ghost', 'energy', 'vortex', 'witchwave', 'rainbowswirl', 'radialrainbow', 'fairy'];
const cfg = store(MODULE_ID, 'lightAdjuster', { curve: CURVE });
const log = (...a) => console.log('VMT Lights |', ...a);

const normColor = (c) => { c = String(c ?? '').trim().toLowerCase(); return c && !c.startsWith('#') ? `#${c}` : c; };
const lightColor = (d) => d.config?.color ?? d.config?.tintColor ?? d.tintColor ?? d.color ?? d._source?.config?.color ?? d._source?.color; /* every Foundry shape */
const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const tagOf = (d) => d.getFlag(MODULE_ID, 'tag');
const lights = () => Array.from(canvas.scene?.lights ?? []);
const selectedIds = () => new Set((canvas.lighting?.controlled ?? []).map((p) => p.id));

/* "7:00 PM" to 19.0, null when unparsable */
function timeToHour(s) {
  const m = String(s ?? '').match(/(\d+):(\d+)\s*(AM|PM)/i);
  return m ? parseInt(m[1]) % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0) + parseInt(m[2]) / 60 : null;
}

/* Linear interpolation over the stored curve */
function hourToDark(hour) {
  const curve = cfg.get().curve ?? CURVE, keys = Object.keys(curve).map(Number).sort((a, b) => a - b);
  let lo = keys[0], hi = keys.at(-1);
  for (let i = 0; i < keys.length - 1; i++) if (hour >= keys[i] && hour <= keys[i + 1]) { lo = keys[i]; hi = keys[i + 1]; break; }
  return curve[lo] + (curve[hi] - curve[lo]) * (hi > lo ? (hour - lo) / (hi - lo) : 0);
}

/* Filtered lights, shared by preview and apply */
function match(filter, f) {
  const sel = selectedIds(), by = {
    color: (d) => normColor(lightColor(d)) === normColor(f.colorVal),
    tag: (d) => tagOf(d) === f.tagFilter.trim(),
    name: (d) => (d.name ?? '').toLowerCase().includes(f.nameFilter.trim().toLowerCase()),
    selected: (d) => sel.has(d.id),
    all: () => true,
  };
  return lights().filter(by[filter]);
}

class LightsApp extends VmtApp {
  static DEFAULT_OPTIONS = { id: 'vmt-light-adjuster', window: { title: 'VMT.Lights.Title' }, position: { width: 600, height: 640 } };

  constructor(...args) {
    super(...args);
    this.filter = 'color'; this.mode = 'time';
    this.f = { colorVal: '#ff8040', tagFilter: '', nameFilter: '', onTime: '7:00 PM', offTime: '6:30 AM', minDark: 0.5, maxDark: 1, chkColor: false, newColor: '#ffaa00', chkDim: false, dim: 20, chkBright: false, bright: 10, chkAlpha: false, alpha: 0.5, chkAnim: false, anim: '', chkTag: true, tagName: '' };
  }

  html() {
    const f = this.f, tags = [...new Set(lights().map(tagOf).filter(Boolean))].sort(), dis = (chk) => (f[chk] ? '' : 'disabled');
    const pick = (act, pre, keys, cur) => `<div class="row">${keys.map((k) => btn(act, L(`Lights.${pre}.${k}`), `data-v="${k}" class="${k === cur ? 'gold' : ''}"`)).join('')}</div>`;
    const field = (name, label, type, extra = '') => `<label>${L(`Lights.${label}`)}<input type="${type}" name="${name}" value="${esc(f[name])}" ${extra}></label>`;
    const gate = (chk, label, inner) => `<label><span class="row"><input type="checkbox" name="${chk}" ${f[chk] ? 'checked' : ''}>${L(`Lights.${label}`)}</span>${inner}</label>`;
    const panels = {
      color: field('colorVal', 'HexColor', 'text', `placeholder="${L('Lights.HexPh')}"`),
      tag: field('tagFilter', 'TagName', 'text', `list="vmt-light-tags" placeholder="${esc(tags[0] ?? L('Lights.TagPh'))}"`) + `<p class="hint">${tags.length ? L('Lights.FoundTags', { tags: esc(tags.join(', ')) }) : L('Lights.NoTags')}</p>`,
      name: field('nameFilter', 'NameContains', 'text', `placeholder="${L('Lights.NamePh')}"`),
      selected: `<p class="hint">${L('Lights.SelectedInfo')}</p>`,
      all: `<p class="hint warn">${L('Lights.AllWarn')}</p>`,
    };
    const dark = this.mode === 'time'
      ? `<div class="grid2">${field('onTime', 'OnAt', 'text', `placeholder="${L('Lights.OnPh')}"`)}${field('offTime', 'OffAt', 'text', `placeholder="${L('Lights.OffPh')}"`)}</div><p class="hint" data-prev="dark">${this.calc()}</p>`
      : `<div class="grid2">${field('minDark', 'MinDark', 'number', 'min="0" max="1" step="0.05"')}${field('maxDark', 'MaxDark', 'number', 'min="0" max="1" step="0.05"')}</div>`;
    const props = gate('chkColor', 'Color', `<input type="color" name="newColor" value="${esc(f.newColor)}" ${dis('chkColor')}>`)
      + gate('chkDim', 'Dim', `<input type="number" name="dim" value="${esc(f.dim)}" min="0" step="5" ${dis('chkDim')}>`)
      + gate('chkBright', 'Bright', `<input type="number" name="bright" value="${esc(f.bright)}" min="0" step="5" ${dis('chkBright')}>`)
      + gate('chkAlpha', 'Alpha', `<input type="number" name="alpha" value="${esc(f.alpha)}" min="0" max="1" step="0.05" ${dis('chkAlpha')}>`)
      + gate('chkAnim', 'Animation', `<select name="anim" ${dis('chkAnim')}>${opt([['', L('Lights.Anim.none')], ...ANIM.map((k) => [k, L(`Lights.Anim.${k}`)])], f.anim)}</select>`);
    return `<div class="main" data-keep="main">
        <h3>${L('Lights.FilterHead')}</h3>${pick('filter', 'Filter', FILTERS, this.filter)}${panels[this.filter]}<p class="hint" data-prev="match">${this.count()}</p>
        <h3>${L('Lights.DarkHead')}</h3>${pick('mode', 'Mode', MODES, this.mode)}${dark}
        <h3>${L('Lights.PropsHead')} <span class="muted">${L('Lights.PropsSub')}</span></h3><div class="grid2">${props}</div>
        <h3>${L('Lights.TagHead')}</h3>${gate('chkTag', 'TagLights', `<input type="text" name="tagName" list="vmt-light-tags" value="${esc(f.tagName)}" placeholder="${L('Lights.TagPh')}" ${dis('chkTag')}>`)}
        <datalist id="vmt-light-tags">${tags.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
      </div>
      <div class="row">${btn('apply', `<i class="fas fa-check"></i> ${L('Lights.Apply')}`, 'class="gold"')}<span class="muted">${L('Lights.ApplyHint')}</span></div>`;
  }

  sync() { Object.assign(this.f, this.form()); } /* fields survive rerender */
  count() { return L(`Lights.Match.${this.filter}`, { n: match(this.filter, this.f).length }); }
  calc() { const off = timeToHour(this.f.offTime); return timeToHour(this.f.onTime) === null || off === null ? L('Lights.BadTime') : L('Lights.Calc', { min: hourToDark(off).toFixed(2) }); }
  preview() { const put = (k, v) => { const el = this.element.querySelector(`[data-prev="${k}"]`); if (el) el.textContent = v; }; put('match', this.count()); if (this.mode === 'time') put('dark', this.calc()); }

  bind(root) {
    super.bind(root);
    root.addEventListener('input', () => { this.sync(); this.preview(); });
    root.addEventListener('change', (ev) => { const chk = ev.target, t = chk.type === 'checkbox' && chk.closest('label')?.querySelector('input:not([type=checkbox]), select'); if (t) t.disabled = !chk.checked; }); /* checkbox gates its field */
  }

  act(a, ds) {
    this.sync();
    if (a === 'apply') return this.apply();
    if (a === 'filter') this.filter = ds.v;
    if (a === 'mode') this.mode = ds.v;
    return this.render();
  }

  async apply() {
    const f = this.f, hits = match(this.filter, f);
    if (!canvas?.scene) return ui.notifications.warn(L('Lights.NoScene'));
    if (!hits.length) return ui.notifications.warn(L('Lights.NoMatch', { filter: L(`Lights.Filter.${this.filter}`) }));
    if (this.filter === 'all' && !(await confirm(L('Lights.Title'), L('Lights.AllAsk', { n: hits.length })))) return ui.notifications.info(L('Lights.Cancelled'));
    log(`${hits.length} lights matched (filter: ${this.filter})`);

    let min, max = 1;
    if (this.mode === 'time') { const off = timeToHour(f.offTime); if (timeToHour(f.onTime) === null || off === null) return ui.notifications.error(L('Lights.BadTime')); min = clamp01(hourToDark(off)); log(`Time mode: on at ${f.onTime}, darkness min ${min.toFixed(2)}`); }
    else { min = clamp01(f.minDark); max = clamp01(f.maxDark); }

    const set = {}, tag = f.chkTag ? f.tagName.trim() : '', props = CHKS.filter((k) => f[k]).length;
    if (f.chkColor) set['config.color'] = f.newColor;
    if (f.chkDim) set['config.dim'] = parseFloat(f.dim);
    if (f.chkBright) set['config.bright'] = parseFloat(f.bright);
    if (f.chkAlpha) set['config.alpha'] = parseFloat(f.alpha);
    if (f.chkAnim) { if (f.anim) set['config.animation.type'] = f.anim; else set['config.animation'] = { type: null, speed: 2, intensity: 2, reverse: false }; }
    if (tag) set[`flags.${MODULE_ID}.tag`] = tag;
    const updates = hits.map((d) => ({ _id: d.id, 'config.darkness.min': min, 'config.darkness.max': max, 'darkness.min': min, 'darkness.max': max, ...set })); /* root darkness = legacy path */

    try { await canvas.scene.updateEmbeddedDocuments('AmbientLight', updates); }
    catch (err) { console.error('VMT Lights |', err); return ui.notifications.error(L('Lights.Failed')); }
    ui.notifications.info(L('Lights.Done', { n: hits.length, min: min.toFixed(2), max: max.toFixed(2) }) + (props ? L('Lights.DoneProps', { n: props }) : '') + (tag ? L('Lights.DoneTag', { tag }) : ''));
    log(`Done. ${hits.length} lights updated.`);
    this.render();
  }
}

let app = null;
export const tool = { id: 'light-adjuster', title: 'VMT.Lights.Title', hint: 'VMT.Lights.Hint', icon: 'fa-lightbulb', group: 'VMT.Group.Scenes', gm: true, open: () => (canvas?.scene ? (app ??= new LightsApp()).render(true) : ui.notifications.warn(L('Lights.NoScene'))) };
