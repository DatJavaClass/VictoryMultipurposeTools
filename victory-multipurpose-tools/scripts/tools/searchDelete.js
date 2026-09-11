/* Search and Delete: search, review, mass delete. */
import { MODULE_ID, L, esc, btn, opt, VmtApp } from '../core.js';

const LOOTER = 'compendium-looter', INFO = { actor: 'InfoActor', item: 'InfoItem', other: 'InfoOther' };
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const isUUID = (s) => /^[A-Za-z0-9]+\.[A-Za-z0-9.]+$/.test(s.trim());
const tail = (term) => term.split('.').pop();
const hit = (name, term, mode) => (mode === 'exact' ? norm(name) === norm(term) : norm(name).includes(norm(term)));
const log = (m, err) => (err ? console.error(`VMT SearchDelete | ${m}`, err) : console.log(`VMT SearchDelete | ${m}`));
const api = () => game.modules.get(MODULE_ID)?.api;
const hasLooter = () => !!api()?.tools().some((t) => t.id === LOOTER);
const itemTypes = () => [...(game.documentTypes?.Item ?? [])].filter((t) => t !== 'base');
const typeLabel = (t) => game.i18n.localize(CONFIG.Item?.typeLabels?.[t] ?? t);
const typeName = (t) => (INFO[t] ? L(`SearchDelete.Type${t[0].toUpperCase()}${t.slice(1)}`) : typeLabel(t));
const onScene = () => canvas.tokens?.placeables.filter((t) => t.actor).map((t) => ({ token: t, actor: t.actor })) ?? [];
const label = (m) => (m.item ? L('SearchDelete.ItemOn', { name: m.item.name, type: m.item.type, actor: m.actor.name }) : L('SearchDelete.ActorLabel', { name: m.actor.name, type: m.actor.type ?? '?', id: m.actor.id.slice(-6) }));

/* World actors per term, paired with tokens. */
function findActors(term, mode, scene) {
  const list = isUUID(term) ? game.actors.filter((a) => a.uuid === term || a.id === tail(term)) : game.actors.filter((a) => hit(a.name, term, mode));
  return list.map((actor) => ({ actor, token: scene.find((s) => s.actor.id === actor.id)?.token ?? null }));
}

/* Scene actor items per term, optional type. */
function findItems(term, mode, scene, type) {
  const out = [], byId = isUUID(term);
  for (const { token, actor } of scene) for (const item of actor.items) {
    if (type && item.type !== type) continue;
    if (byId ? [item.uuid, item.flags?.core?.sourceId, item._stats?.compendiumSource].includes(term) || item.id === tail(term) : hit(item.name, term, mode)) out.push({ item, actor, token });
  }
  return out;
}

class SearchDeleteApp extends VmtApp {
  static DEFAULT_OPTIONS = { id: 'vmt-search-delete', window: { title: 'VMT.SearchDelete.Title', controls: [{ icon: 'fas fa-box-open', label: 'VMT.SearchDelete.Crawler', action: 'crawler' }] }, position: { width: 600, height: 660 }, actions: { crawler: () => api()?.open(LOOTER) } };

  constructor(...args) { super(...args); this.f = { type: 'actor', scope: 'both', terms: '', match: 'exact', leaveOne: false }; this.groups = null; this.last = null; }

  _initializeApplicationOptions(options) { const o = super._initializeApplicationOptions(options); if (!hasLooter()) o.window.controls = []; return o; } /* header button only with the looter */

  html() {
    const f = this.f, total = this.total(), types = [['actor', typeName('actor')], ['item', typeName('item')], ...itemTypes().map((t) => [t, typeLabel(t)]), ['other', typeName('other')]];
    const info = INFO[f.type] ? L(`SearchDelete.${INFO[f.type]}`) : L('SearchDelete.InfoTyped', { type: typeLabel(f.type) });
    const card = ({ term, matches }, i) => {
      const keep = f.leaveOne && matches.length > 1 && !isUUID(term);
      return `<div class="card ${matches.length > 1 ? 'multi' : ''}"><div class="row"><b>${esc(term)}</b><span class="muted">${matches.length ? L('SearchDelete.Matches', { n: matches.length }) : L('SearchDelete.NoMatch')}</span></div>
        <ul>${matches.map((m) => `<li>${esc(label(m))}${m.token && !m.item ? ` <span class="badge live">${L('SearchDelete.OnScene')}</span>` : ''}</li>`).join('')}</ul>
        ${keep ? `<label>${L('SearchDelete.Keep')}<select name="keep-${i}">${opt([...matches.map((m, j) => [String(j), label(m)]), ['all', L('SearchDelete.KeepAll')], ['skip', L('SearchDelete.KeepSkip')]], '0')}</select></label>` : ''}</div>`;
    };
    return `<div class="grid2"><label>${L('SearchDelete.Type')}<select name="type">${opt(types, f.type)}</select></label>
        ${f.type === 'actor' ? `<label>${L('SearchDelete.Scope')}<select name="scope">${opt([['token', L('SearchDelete.ScopeToken')], ['world', L('SearchDelete.ScopeWorld')], ['both', L('SearchDelete.ScopeBoth')]], f.scope)}</select></label>` : ''}</div>
      <p class="${f.type === 'other' ? 'warn' : 'hint'}">${info}</p>
      <label>${L('SearchDelete.Terms')}<textarea name="terms" rows="2" placeholder="${L('SearchDelete.TermsPlaceholder')}">${esc(f.terms)}</textarea></label>
      <p class="hint">${L('SearchDelete.TermsHint')}</p>
      <div class="grid2"><label>${L('SearchDelete.Match')}<select name="match">${opt([['exact', L('SearchDelete.MatchExact')], ['contains', L('SearchDelete.MatchContains')]], f.match)}</select></label>
        <label class="check"><input type="checkbox" name="leaveOne" ${f.leaveOne ? 'checked' : ''}>${L('SearchDelete.LeaveOne')}</label></div>
      <div class="row">${btn('scan', `<i class="fas fa-search"></i> ${L('SearchDelete.Scan')}`, 'class="gold"')}${btn('clear', L('SearchDelete.Clear'))}${this.last ? `<span class="muted">${L('SearchDelete.Done', this.last)}</span>` : ''}</div>
      <div class="list" data-keep="list">${this.groups === null ? `<p class="empty">${L('SearchDelete.Start')}</p>` : this.groups.map(card).join('')}</div>
      ${total ? `<div class="row">${btn('run', `<i class="fas fa-trash-alt"></i> ${L('SearchDelete.Delete', { n: total })}`, 'class="red"')}<span class="hint">${L('SearchDelete.Review')}</span></div>` : ''}`;
  }

  bind(root) { super.bind(root); root.addEventListener('change', (ev) => { if (ev.target.name === 'type') { this.read(); this.groups = null; this.render(); } }); }

  read() { const o = this.form(); for (const k in this.f) if (k in o) this.f[k] = o[k]; return o; } /* known fields to state */
  total() { return this.groups?.reduce((n, g) => n + g.matches.length, 0) ?? 0; }

  /* Leave One choices: keep index, all, skip. */
  final(form) { return this.groups.flatMap(({ matches }, i) => { const k = form[`keep-${i}`]; return k === 'skip' ? [] : k === undefined || k === 'all' ? matches : matches.filter((_, j) => j !== Number(k)); }); }

  async act(a) {
    const form = this.read();
    if (a === 'scan') return this.scan();
    if (a === 'clear') { this.groups = null; this.last = null; return this.render(); }
    if (a === 'run') return this.run(this.final(form));
  }

  scan() {
    const { type, terms, match } = this.f, list = terms.split(',').map((s) => s.trim()).filter(Boolean), scene = onScene();
    if (!list.length) return ui.notifications.warn(L('SearchDelete.NoTerms'));
    const find = (term) => (type === 'actor' ? findActors(term, match, scene) : findItems(term, match, scene, INFO[type] ? null : type));
    this.groups = list.map((term) => ({ term, matches: find(term) }));
    if (!this.total()) ui.notifications.info(L('SearchDelete.NoMatches'));
    this.render();
  }

  /* Deletes per type and scope, one try each. */
  async run(list) {
    const { type, scope } = this.f, terms = this.groups.map((g) => g.term).join(', ');
    if (!list.length) return ui.notifications.warn(L('SearchDelete.NothingLeft'));
    let deleted = 0, failed = 0;
    for (const m of list) {
      try {
        if (m.item) { await m.actor.deleteEmbeddedDocuments('Item', [m.item.id]); log(`Deleted item ${m.item.name} from ${m.actor.name}`); }
        else {
          if (scope !== 'world' && m.token) { await m.token.document.delete(); log(`Deleted token ${m.actor.name}`); }
          if (scope !== 'token') { await m.actor.delete(); log(`Deleted world actor ${m.actor.name}`); }
        }
        deleted++;
      } catch (err) { failed++; log(`Failed on ${label(m)}`, err); }
    }

    this.last = { deleted, failed }; this.groups = null;
    ui.notifications.info(L('SearchDelete.Done', this.last) + (failed ? ` ${L('SearchDelete.FailedHint')}` : ''));
    const row = (k, v) => `<p><b>${L(`SearchDelete.${k}`)}:</b> ${esc(v)}</p>`;
    try { await ChatMessage.create({ content: `<h3>${L('SearchDelete.Report')}</h3>${row('ReportType', typeName(type))}${row('ReportTerms', terms)}${row('ReportDeleted', deleted)}${failed ? row('ReportFailed', failed) : ''}`, whisper: ChatMessage.getWhisperRecipients('GM') }); } catch (err) { log('Chat report failed', err); }
    log(`Run complete. Deleted ${deleted}, failed ${failed}`);
    this.render();
  }
}

let app = null;
export const tool = { id: 'search-delete', title: 'VMT.SearchDelete.Title', hint: 'VMT.SearchDelete.Hint', icon: 'fa-trash-alt', group: 'VMT.Group.World', gm: true, open: () => (app ??= new SearchDeleteApp()).render(true) };
