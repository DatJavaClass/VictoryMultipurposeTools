/* Token Finder: search all scenes, jump to hit. */
import { L, esc, btn, wait, VmtApp } from '../core.js';

const scan = (needle) => { const n = needle.toLowerCase(), out = []; for (const scene of game.scenes) for (const token of scene.tokens) if ((token.name ?? '').toLowerCase().includes(n)) out.push({ scene, token }); return out; };

/* Activate or view, then pan to center. */
async function jump({ scene, token }) {
  if (scene.id !== game.scenes.active?.id) { await scene.activate(); await wait(800); }
  else if (scene.id !== canvas.scene?.id) { await scene.view(); await wait(400); }
  const g = canvas.scene?.grid?.size ?? 100;
  canvas.animatePan({ x: token.x + token.width * g / 2, y: token.y + token.height * g / 2, scale: 1, duration: 600 });
}

class TokenFinderApp extends VmtApp {
  static DEFAULT_OPTIONS = { id: 'vmt-token-finder', window: { title: 'VMT.TokenFinder.Title' }, position: { width: 480, height: 440 } };

  constructor(...args) { super(...args); this.needle = ''; this.hits = null; }

  html() {
    const badge = (scene) => (scene.id === game.scenes.active?.id ? `<span class="badge live">${L('TokenFinder.Active')}</span>` : '') + (scene.id === canvas.scene?.id ? `<span class="badge viewed">${L('TokenFinder.Viewed')}</span>` : '');
    const rows = (this.hits ?? []).map(({ scene, token }, i) => `<div class="card"><div class="row"><b>${esc(token.name)}</b><span class="muted">${esc(scene.name)} x:${Math.round(token.x)} y:${Math.round(token.y)}</span>${badge(scene)}${btn('jump', `<i class="fas fa-location-arrow"></i> ${L('TokenFinder.Jump')}`, `data-idx="${i}" class="end"`)}</div></div>`).join('');
    return `<div class="row"><input type="text" name="needle" placeholder="${L('TokenFinder.Placeholder')}" value="${esc(this.needle)}">${btn('find', `<i class="fas fa-search"></i> ${L('TokenFinder.Find')}`, 'class="gold"')}</div>
      <div class="list" data-keep="list">${this.hits === null ? `<p class="empty">${L('TokenFinder.Start')}</p>` : rows || `<p class="empty">${L('TokenFinder.None', { needle: this.needle })}</p>`}</div>`;
  }

  bind(root) { super.bind(root); root.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.name === 'needle') this.act('find'); }); }

  async act(a, ds) {
    if (a === 'find') { this.needle = this.val('needle').trim(); this.hits = this.needle ? scan(this.needle) : null; return this.render(); }
    if (a === 'jump') return jump(this.hits[ds.idx]);
  }
}

let app = null;
export const tool = { id: 'token-finder', title: 'VMT.TokenFinder.Title', hint: 'VMT.TokenFinder.Hint', icon: 'fa-search-location', group: 'VMT.Group.Scenes', gm: true, open: () => (app ??= new TokenFinderApp()).render(true) };
