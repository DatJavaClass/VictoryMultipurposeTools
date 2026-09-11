/* Marquee: fullscreen text announcement on every connected client. */
import { MODULE_ID, L, esc, btn, opt, confirm, VmtApp, store, socket } from '../core.js';

const SIZE = { small: '32px', medium: '48px', large: '64px', huge: '96px' }, SPEED = { slow: '30s', medium: '20s', fast: '10s', vfast: '5s' }, VPOS = { top: '20%', center: '50%', bottom: '80%' };
const GLOW = { subtle: '0 0 5px', medium: '0 0 10px, 0 0 20px, 0 0 30px', intense: '0 0 20px, 0 0 40px, 0 0 60px, 0 0 80px' };
const ANIM = ['scroll-horizontal', 'scroll-vertical', 'fade-center', 'zoom-burst', 'typewriter', 'wave'], DIR = ['left-to-right', 'right-to-left', 'top-to-bottom', 'bottom-to-top'], FONT = ['normal', 'bold', 'italic', 'outlined'];
const DEFAULT = { textColor: '#00ffcc', shadowColor: '#ff00ff', animationType: 'scroll-horizontal', speed: 'medium', direction: 'left-to-right', vPosition: 'center', textSize: 'medium', glowIntensity: 'medium', fontStyle: 'normal' };
const presets = store(MODULE_ID, 'marquee', { last: DEFAULT, saved: {} });

/* Overlay on this client, self removes. */
export function show(d) {
  d = { ...DEFAULT, ...d };
  const dur = SPEED[d.speed] ?? '20s', top = VPOS[d.vPosition] ?? '50%', center = `left:50%; top:${top}; transform:translate(-50%,-50%);`, rtl = d.direction === 'right-to-left', btt = d.direction === 'bottom-to-top';
  const glow = (GLOW[d.glowIntensity] ?? GLOW.medium).split(',').map((g) => `${g.trim()} ${d.shadowColor}`).join(', ') + (d.fontStyle === 'outlined' ? ', -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' : '');
  const anims = {
    'scroll-horizontal': [`@keyframes vmtM { from { transform: translateX(${rtl ? '100vw' : 'calc(-100% - 100vw)'}); } to { transform: translateX(${rtl ? 'calc(-100% - 100vw)' : '100vw'}); } }`, `animation: vmtM ${dur} linear; top:${top};`],
    'scroll-vertical': [`@keyframes vmtM { from { transform: translate(-50%, ${btt ? '100vh' : '-100%'}); } to { transform: translate(-50%, ${btt ? '-100%' : '100vh'}); } }`, `animation: vmtM ${dur} linear; left:50%;`],
    'fade-center': ['@keyframes vmtM { 0% { opacity:0; transform: translate(-50%,-50%) scale(0.5); } 20% { opacity:1; transform: translate(-50%,-50%) scale(1); } 80% { opacity:1; transform: translate(-50%,-50%) scale(1); } 100% { opacity:0; transform: translate(-50%,-50%) scale(1.2); } }', `animation: vmtM ${dur} ease-in-out; ${center}`],
    'zoom-burst': ['@keyframes vmtM { 0% { opacity:0; transform: translate(-50%,-50%) scale(0); } 10% { opacity:1; transform: translate(-50%,-50%) scale(1.2); } 20% { transform: translate(-50%,-50%) scale(1); } 80% { opacity:1; transform: translate(-50%,-50%) scale(1); } 90% { transform: translate(-50%,-50%) scale(1.2); } 100% { opacity:0; transform: translate(-50%,-50%) scale(0); } }', `animation: vmtM ${dur} ease-in-out; ${center}`],
    'typewriter': ['@keyframes vmtM { from { width: 0; } to { width: 100%; } }', `animation: vmtM ${dur} steps(${Math.max(1, d.text.length)}) forwards; ${center} overflow:hidden;`],
    'wave': ['@keyframes vmtM { from { left: -100%; } to { left: 100vw; } } @keyframes vmtW { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }', `animation: vmtM ${dur} linear, vmtW 2s ease-in-out infinite; top:${top};`],
  };
  const [keys, anim] = anims[d.animationType] ?? anims['scroll-horizontal'];
  const wrap = document.createElement('div'), css = document.createElement('style'), el = document.createElement('div');
  wrap.className = 'vmt-marquee'; wrap.style.cssText = 'position:fixed; inset:0; pointer-events:none; z-index:99999; overflow:hidden;';
  css.textContent = keys;
  el.style.cssText = `position:absolute; white-space:nowrap; font-family:'Signika',sans-serif; font-size:${SIZE[d.textSize] ?? '48px'}; font-weight:${['bold', 'outlined'].includes(d.fontStyle) ? 'bold' : 'normal'}; font-style:${d.fontStyle === 'italic' ? 'italic' : 'normal'}; color:${d.textColor}; text-shadow:${glow}; ${anim}`;
  el.textContent = d.text;
  wrap.append(css, el); document.body.append(wrap);
  setTimeout(() => wrap.remove(), parseFloat(dur) * 1000 + 500);
}
socket.on('marquee', show); /* every client, registered at load */

class MarqueeApp extends VmtApp {
  static DEFAULT_OPTIONS = { id: 'vmt-marquee', window: { title: 'VMT.Marquee.Title' }, position: { width: 640, height: 500 } };

  constructor(...args) { super(...args); this.cur = { ...DEFAULT, ...presets.get().last }; this.text = ''; }

  html() {
    const sel = (name, keys) => `<label>${L(`Marquee.Field.${name}`)}<select name="${name}">${opt(keys.map((k) => [k, L(`Marquee.${name}.${k}`)]), this.cur[name])}</select></label>`;
    const color = (name) => `<label>${L(`Marquee.Field.${name}`)}<input type="color" name="${name}" value="${esc(this.cur[name])}"></label>`;
    const saved = Object.keys(presets.get().saved).sort((a, b) => a.localeCompare(b));
    return `<div class="cols"><div class="main">
        <label>${L('Marquee.Text')}<textarea name="text" rows="2">${esc(this.text)}</textarea></label>
        <div class="grid2">${sel('animationType', ANIM)}${sel('speed', Object.keys(SPEED))}${sel('direction', DIR)}${sel('vPosition', Object.keys(VPOS))}${sel('textSize', Object.keys(SIZE))}${sel('glowIntensity', Object.keys(GLOW))}${sel('fontStyle', FONT)}${color('textColor')}${color('shadowColor')}</div>
        <div class="row">${btn('send', `<i class="fas fa-bullhorn"></i> ${L('Marquee.Send')}`, 'class="gold"')}${btn('preview', `<i class="fas fa-eye"></i> ${L('Marquee.Preview')}`)}<span class="muted">${L('Marquee.LastHint')}</span></div>
      </div><aside class="rail"><h3>${L('Marquee.Presets')}</h3>
        <ul class="names" data-keep="presets">${saved.map((n) => `<li data-act="load" data-name="${esc(n)}"><span>${esc(n)}</span>${btn('del', '<i class="fas fa-trash"></i>', `class="ic" data-name="${esc(n)}" title="${L('Delete')}"`)}</li>`).join('') || `<li class="muted">${L('Marquee.NoPresets')}</li>`}</ul>
        <div class="row"><input type="text" name="presetName" placeholder="${L('Marquee.PresetName')}">${btn('save', '<i class="fas fa-save"></i>', `class="ic" title="${L('Save')}"`)}</div>
      </aside></div>`;
  }

  /* Form to state; returns settings plus text. */
  read() { const f = this.form(); this.text = f.text; delete f.text; delete f.presetName; this.cur = f; return { ...f, text: this.text }; }

  async act(a, ds) {
    const d = this.read(), need = () => { ui.notifications.warn(L('Marquee.NoText')); return false; };
    const acts = {
      send: async () => { if (!d.text.trim()) return need(); await presets.update((p) => { p.last = this.cur; }); socket.emit('marquee', d); },
      preview: () => (d.text.trim() ? show(d) : need()),
      save: async () => { const n = this.val('presetName').trim(); if (!n) return ui.notifications.warn(L('Marquee.NeedName')); await presets.update((p) => { p.saved[n] = this.cur; }); this.render(); },
      load: () => { this.cur = { ...DEFAULT, ...presets.get().saved[ds.name] }; this.render(); },
      del: async () => { if (await confirm(L('Marquee.Title'), L('Marquee.DeleteAsk', { name: ds.name }))) { await presets.update((p) => { delete p.saved[ds.name]; }); this.render(); } },
    };
    return acts[a]?.();
  }
}

let app = null;
export const tool = { id: 'marquee', title: 'VMT.Marquee.Title', hint: 'VMT.Marquee.Hint', icon: 'fa-bullhorn', group: 'VMT.Group.Table', gm: true, open: () => (app ??= new MarqueeApp()).render(true) };
