/* Tool registry and the sidebar dock strip. */
import { L, esc, on } from './core.js';

const tools = new Map(), T = (k) => game.i18n.localize(k); /* plain strings pass through */
const KEY = 'vmt-dock-open';
let dock = null;

/* Needs id, title, open(); rest defaults. */
export function register(t) {
  if (!t?.id || !t.open) throw new Error('VMT: a tool needs id and open()');
  tools.set(t.id, { icon: 'fa-wrench', group: 'VMT.Group.Tools', hint: '', gm: true, ...t });
  if (game.ready) renderDock();
  return t.id;
}

export const usable = () => [...tools.values()].filter((t) => game.user.isGM || !t.gm).sort((a, b) => T(a.group).localeCompare(T(b.group)) || T(a.title).localeCompare(T(b.title)));
export const open = (id) => { const t = tools.get(id); if (!t) return ui.notifications.warn(L('NoSuchTool', { id })); if (t.gm && !game.user.isGM) return ui.notifications.warn(L('GmOnly')); return t.open(); };

const expanded = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }; /* folded until first click */
const place = () => { if (dock) dock.style.right = `${(document.getElementById('sidebar')?.offsetWidth ?? 300) + 12}px`; }; /* hugs the sidebar, collapsed or not */

export function toggle(force) {
  const next = force ?? !expanded();
  try { localStorage.setItem(KEY, next ? '1' : '0'); } catch {}
  renderDock();
}

/* One icon per usable tool, toolbox icon folds. */
export function renderDock() {
  if (!dock) {
    dock = Object.assign(document.createElement('div'), { id: 'vmt-dock' });
    document.body.append(dock);
    on(dock, 'click', '.vmt-tool', (el) => (el.dataset.id ? open(el.dataset.id) : toggle()));
    Hooks.on('collapseSidebar', () => setTimeout(place, 350));
    window.addEventListener('resize', place);
  }
  const list = usable(), show = expanded();
  dock.hidden = !list.length;
  dock.innerHTML = `<button type="button" class="vmt-tool head ${show ? 'on' : ''}" data-tooltip="${L('Title')}"><i class="fas fa-toolbox"></i></button>`
    + (show ? list.map((t) => `<button type="button" class="vmt-tool" data-id="${esc(t.id)}" data-tooltip="${esc(T(t.title))}${t.hint ? `: ${esc(T(t.hint))}` : ''}"><i class="fas ${esc(t.icon)}"></i></button>`).join('') : '');
  place();
}
