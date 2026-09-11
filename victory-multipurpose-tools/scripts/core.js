/* Shared plumbing for every tool and every extension. */
export const MODULE_ID = 'victory-multipurpose-tools';
export const i18n = (prefix) => (k, data) => data ? game.i18n.format(`${prefix}.${k}`, data) : game.i18n.localize(`${prefix}.${k}`);
export const L = i18n('VMT');
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const on = (root, evt, sel, fn) => root.addEventListener(evt, (ev) => { const t = ev.target.closest(sel); if (t && root.contains(t)) fn(t, ev); }); /* delegated listener */
export const btn = (act, inner, extra = '') => `<button type="button" data-act="${act}" ${extra}>${inner}</button>`;
export const opt = (pairs, cur) => pairs.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const { ApplicationV2, DialogV2 } = foundry.applications.api;
export const confirm = (title, body) => DialogV2.confirm({ window: { title }, content: `<p>${body}</p>`, rejectClose: false });

/* Base window: html() in, [data-act] to act(). */
export class VmtApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = { classes: ['vmt'], window: { resizable: true, minimizable: true } };
  async _renderHTML() { return this.html(); }
  _replaceHTML(html, content) {
    const keep = [...content.querySelectorAll('[data-keep]')].map((el) => [el.dataset.keep, el.scrollTop]);
    content.innerHTML = html;
    for (const [k, top] of keep) { const el = content.querySelector(`[data-keep="${k}"]`); if (el) el.scrollTop = top; }
  }
  _onFirstRender() { this.bind(this.element); } /* frame persists, content swaps */
  bind(root) { on(root, 'click', '[data-act]', (el) => this.act(el.dataset.act, el.dataset, el)); }
  html() { return ''; }
  act() {}
  val(name) { return this.element.querySelector(`[name="${name}"]`)?.value ?? ''; }
  form() { const o = {}; for (const el of this.element.querySelectorAll('[name]')) o[el.name] = el.type === 'checkbox' ? el.checked : el.value; return o; } /* every named field */
}

/* World setting per tool, registered on first touch. */
export function store(moduleId, key, def) {
  const reg = () => { if (!game.settings.settings.has(`${moduleId}.${key}`)) game.settings.register(moduleId, key, { scope: 'world', config: false, type: Object, default: def }); };
  const get = () => { reg(); return foundry.utils.deepClone(game.settings.get(moduleId, key)); };
  const set = (v) => { reg(); return game.settings.set(moduleId, key, v); };
  return { get, set, update: async (fn) => { const v = get(); fn(v); await set(v); return v; } };
}

/* Socket relay, emit reaches every client, sender included. */
const handlers = new Map();
export const dispatch = ({ name, data } = {}) => handlers.get(name)?.(data);
export const socket = { on: (name, fn) => handlers.set(name, fn), emit: (name, data) => { game.socket.emit(`module.${MODULE_ID}`, { name, data }); dispatch({ name, data }); } };
