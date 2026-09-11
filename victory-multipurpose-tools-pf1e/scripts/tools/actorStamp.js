/* Actor Stamp: feats, traits, gear, gold onto actors. */
export default (vmt) => {
  const { App, store, adapter, ui: { esc, on, btn, opt, wait, confirm, i18n } } = vmt, L = i18n('VMTP');
  const PACK = 'victory-multipurpose-tools-pf1e', FOLDER = '_Stamps_', FLAG = 'stamps', BANNER = 'vmtp-stamp-banner', NO_STAMP_TYPES = new Set(['class', 'race']);
  const { path: CUR, coins: COINS } = adapter.get().currency, ALT = CUR.replace(/currency$/, 'altCurrency');
  const log = (m, err) => (err ? console.error(`VMTP ActorStamp | ${m}`, err) : console.log(`VMTP ActorStamp | ${m}`));
  const note = (k, d, warn) => ui.notifications[warn ? 'warn' : 'info'](L(`ActorStamp.${k}`, d));
  const byName = (x, y) => x.name.localeCompare(y.name);
  const folder = () => game.folders.find((f) => f.type === 'Actor' && f.name === FOLDER) ?? null;
  const isProfile = (a) => !!a?.folder && a.folder.id === folder()?.id;
  const profiles = () => game.actors.filter(isProfile).sort(byName);
  const pcs = () => game.actors.filter((a) => a.type === 'character' && a.hasPlayerOwner && !isProfile(a)).sort(byName);
  const isNpcStamp = (a) => a.type === 'npc' || /NPC/i.test(a.name);
  const names = (list) => list.map((i) => i.name).join(', ');
  const prop = (doc, path) => foundry.utils.getProperty(doc, path);

  async function ensureFolder() {
    if (folder()) return folder();
    try { const f = await Folder.create({ name: FOLDER, type: 'Actor', color: '#ffcc33' }); note('FolderMade', { folder: FOLDER }); return f; } catch (err) { log('Folder create failed', err); return null; }
  }

  /* Sheet frame plus banner, replaced every render. */
  function decorate(actor) {
    const raw = actor.sheet?.element, el = raw instanceof HTMLElement ? raw : raw?.[0];
    if (!el) return;
    el.style.cssText += 'border:2px solid #ffcc33;box-shadow:0 0 14px rgba(255,204,51,0.45);border-radius:6px;';
    el.querySelector(`.${BANNER}`)?.remove();
    const b = document.createElement('div');
    b.className = BANNER; b.title = L('ActorStamp.BannerTip');
    b.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:8px;flex:0 0 30px;height:30px;box-sizing:border-box;width:100%;overflow:hidden;white-space:nowrap;padding:2px 8px;background:linear-gradient(90deg,#3a2f0a,#1a1a1a);color:#ffcc33;border-bottom:1px solid #ffcc33;font-family:Signika,sans-serif;';
    b.innerHTML = `<b style="flex:0 0 auto;font-size:12px;">${L('ActorStamp.Title')}</b><span style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:11px;opacity:0.8;">${esc(L('ActorStamp.BannerSub', { name: actor.name }))}</span>${btn('save', `<i class="fas fa-save"></i> ${L('ActorStamp.SaveStamp')}`, 'style="flex:0 0 auto;width:auto;max-width:130px;margin:0;padding:2px 10px;background:#ffcc33;color:#1a1a1a;border:none;border-radius:4px;font-weight:bold;font-size:12px;line-height:1.4;cursor:pointer;"')}`;
    b.querySelector('[data-act]').addEventListener('click', () => saveFlow(actor));
    (el.querySelector('.window-header') ?? el.firstElementChild)?.insertAdjacentElement('afterend', b);
  }
  async function saveFlow(actor) {
    await actor.sheet.close();
    if (await confirm(L('ActorStamp.SavedTitle'), esc(L('ActorStamp.Saved', { name: actor.name })))) openApp(actor.id);
  }
  async function openSheet(actor) { await actor.sheet.render(true); await wait(150); decorate(actor); } /* hook decorates, this covers open sheets */
  for (const h of ['renderActorSheet', 'renderActorSheetV2']) Hooks.on(h, (sheet) => { try { if (isProfile(sheet.actor)) decorate(sheet.actor); } catch (err) { log('Sheet frame failed', err); } });

  class ActorStampApp extends App {
    static DEFAULT_OPTIONS = { id: 'vmtp-actor-stamp', window: { title: 'VMTP.ActorStamp.Title' }, position: { width: 660, height: 580 } };

    constructor(...args) { super(...args); this.sel = null; this.mode = 'selected'; this.pc = ''; this.plan = null; this.last = null; ensureFolder().then((f) => f && this.rendered && this.render()); }

    stamp() { return profiles().find((a) => a.id === this.sel) ?? null; }
    select(id) { this.sel = id; this.plan = null; this.render(); }
    read() { this.mode = this.element.querySelector('[name="mode"]:checked')?.value ?? this.mode; this.pc = this.val('pc') || this.pc; } /* radios need the checked one */

    html() {
      const list = profiles(), stamp = this.stamp(), npc = stamp ? isNpcStamp(stamp) : false, p = this.plan;
      const li = (a) => `<li data-act="pick" data-id="${a.id}" class="${a.id === this.sel ? 'sel' : ''}"><span>${esc(a.name)}</span></li>`;
      const radio = (v, key, dis) => `<label class="check"><input type="radio" name="mode" value="${v}" ${this.mode === v ? 'checked' : ''} ${dis ? 'disabled' : ''}>${L(`ActorStamp.${key}`)}</label>`;
      const row = (t) => `<div class="card"><b>${esc(t.target.name)}</b>
          ${t.adds.length ? `<div>${esc(L('ActorStamp.Adds', { list: names(t.adds) }))}</div>` : ''}
          ${t.removals.length ? `<div class="warn">${esc(L('ActorStamp.Removes', { list: names(t.removals) }))}</div>` : ''}
          ${t.grantGold ? `<div class="gold">${esc(L('ActorStamp.Gold', { gold: p.goldStr }))}</div>` : p.goldStr ? `<div class="muted">${L('ActorStamp.GoldDone')}</div>` : ''}
          ${!t.adds.length && !t.removals.length && !t.grantGold ? `<div class="muted">${L('ActorStamp.Nothing')}</div>` : ''}</div>`;
      return `<div class="cols"><div class="main">
          <div class="row">${btn('open', `<i class="fas fa-folder-open"></i> ${L('ActorStamp.Open')}`)}${btn('delete', `<i class="fas fa-trash"></i> ${L('ActorStamp.Delete')}`, 'class="red"')}<span class="muted end">${L('ActorStamp.OnFile', { n: list.length, folder: FOLDER })}</span></div>
          <h3>${L('ActorStamp.Stamp')}</h3>
          <p class="hint">${stamp ? L(npc ? 'ActorStamp.LaneNpc' : 'ActorStamp.LanePc') : L('ActorStamp.PickFirst')}</p>
          <div class="grid2"><div class="modes">${radio('selected', 'ModeSelected')}${radio('pc', 'ModePc', npc)}</div>
            <label>${L('ActorStamp.Pc')}<select name="pc" ${npc ? 'disabled' : ''}>${opt(pcs().map((a) => [a.id, a.name]), this.pc)}</select></label></div>
          <div class="row">${btn('review', `<i class="fas fa-stamp"></i> ${L('ActorStamp.Review')}`, 'class="gold"')}${this.last ? `<span class="muted">${esc(this.last)}</span>` : ''}</div>
          ${p ? `<h3>${esc(L('ActorStamp.Summary', { name: p.stamp.name, n: p.rows.length }))}</h3>
            <div class="list" data-keep="plan">${p.rows.map(row).join('')}
              ${p.skipped ? `<p class="warn">${esc(L('ActorStamp.Skipped', { list: p.skipped }))}</p>` : ''}
              ${p.refused.length ? `<p class="warn">${esc(L('ActorStamp.Refused', { list: p.refused.join(', ') }))}</p>` : ''}</div>
            <div class="row">${btn('apply', `<i class="fas fa-stamp"></i> ${L('ActorStamp.Apply')}`, 'class="gold"')}${btn('cancel', L('ActorStamp.Cancel'))}</div>` : ''}
        </div><aside class="rail"><h3>${L('ActorStamp.Stamps')}</h3>
          <ul class="names" data-keep="stamps">${list.map(li).join('') || `<li class="muted">${L('ActorStamp.NoStamps')}</li>`}</ul>
          <input type="text" name="newName" placeholder="${L('ActorStamp.NewName')}">
          ${btn('create', `<i class="fas fa-file"></i> ${L('ActorStamp.Create')}`)}${btn('createNpc', `<i class="fas fa-user"></i> ${L('ActorStamp.CreateNpc')}`)}
          <p class="hint">${L('ActorStamp.NpcHint')}</p>
        </aside></div>`;
    }

    async act(a, ds) {
      this.read();
      const stamp = this.stamp(), need = () => note('PickFirst', {}, true);
      const acts = {
        pick: () => this.select(ds.id),
        create: () => this.create(false),
        createNpc: () => this.create(true),
        open: () => (stamp ? openSheet(stamp) : need()),
        delete: async () => { if (!stamp) return need(); await stamp.deleteDialog(); this.plan = null; this.render(); }, /* Foundry's own confirm guards */
        review: () => (stamp ? this.review(stamp) : need()),
        apply: () => this.apply(),
        cancel: () => { this.plan = null; note('Cancelled'); this.render(); },
      };
      return acts[a]?.();
    }

    async create(npc) {
      let name = this.val('newName').trim();
      if (!name) return note('NeedName', {}, true);
      if (npc && !/^NPC\b/i.test(name)) name = `NPC ${name}`;
      const f = await ensureFolder();
      if (!f) return;
      try { const actor = await Actor.create({ name, type: npc ? 'npc' : 'character', folder: f.id }); this.sel = actor.id; this.plan = null; this.render(); await openSheet(actor); } catch (err) { log(`Create failed for ${name}`, err); }
    }

    /* Lane rule, then per target adds, removals, gold. */
    review(stamp) {
      const npc = isNpcStamp(stamp), targets = [], refused = [];
      if (this.mode === 'pc' && !npc) { const pc = game.actors.get(this.pc); if (pc) targets.push(pc); }
      else {
        const seen = new Set();
        for (const t of canvas.tokens.controlled) {
          const a = t.actor;
          if (!a || isProfile(a) || seen.has(a.uuid)) continue;
          seen.add(a.uuid);
          if (npc ? !a.hasPlayerOwner : a.type === 'character') targets.push(a); else refused.push(`${a.name} (${npc ? L('ActorStamp.Owned') : a.type})`);
        }
      }
      if (!targets.length) return ui.notifications.warn(L('ActorStamp.NoTargets') + (refused.length ? ` ${L('ActorStamp.Refused', { list: refused.join(', ') })}` : ''));

      const stampable = stamp.items.filter((i) => !NO_STAMP_TYPES.has(i.type)), skipped = stamp.items.filter((i) => NO_STAMP_TYPES.has(i.type)).map((i) => `${i.name} (${i.type})`).join(', ');
      const gold = {};
      for (const c of COINS) { const v = Number(prop(stamp, `${CUR}.${c}`)) || 0; if (v > 0) gold[c] = v; }
      const goldStr = Object.entries(gold).map(([c, v]) => `${v} ${c}`).join(', ');
      const rows = targets.map((target) => {
        const flag = foundry.utils.deepClone(target.getFlag(PACK, FLAG)?.[stamp.id] ?? { items: {}, goldGranted: false });
        const adds = stampable.filter((pi) => !(flag.items[pi.id] && target.items.get(flag.items[pi.id])));
        const removals = Object.entries(flag.items).filter(([pid, tid]) => !stamp.items.get(pid) && target.items.get(tid)).map(([pid, tid]) => ({ pid, tid, name: target.items.get(tid).name }));
        return { target, flag, adds, removals, grantGold: !flag.goldGranted && !!goldStr };
      });
      this.plan = { stamp, rows, skipped, refused, gold, goldStr };
      this.render();
    }

    /* Explicit creates, flagged removals, additive coin paths only. */
    async apply() {
      const p = this.plan;
      if (!p) return;
      let touched = 0, failures = 0, added = 0, removed = 0, deliveries = 0;
      for (const t of p.rows) {
        try {
          const { target, flag } = t, updates = {};
          if (t.adds.length) {
            const made = await target.createEmbeddedDocuments('Item', t.adds.map((i) => { const d = i.toObject(); delete d._id; return d; }), { renderSheet: false });
            if ((made?.length ?? 0) !== t.adds.length) throw new Error(`expected ${t.adds.length} creations, got ${made?.length ?? 0}`);
            made.forEach((doc, i) => { flag.items[t.adds[i].id] = doc.id; });
            added += made.length;
          }

          if (t.removals.length) { await target.deleteEmbeddedDocuments('Item', t.removals.map((r) => r.tid)); for (const r of t.removals) delete flag.items[r.pid]; removed += t.removals.length; }

          if (t.grantGold) {
            const alt = prop(target, ALT), base = alt ? ALT : CUR, have = alt ?? prop(target, CUR) ?? {}; /* weightless when the system has it */
            if (!alt) log(`No weightless currency on ${target.name}, delivering to carried coin`);
            for (const [c, v] of Object.entries(p.gold)) updates[`${base}.${c}`] = (Number(have[c]) || 0) + v;
            flag.goldGranted = true; deliveries++;
          }

          updates[`flags.${PACK}.${FLAG}.${p.stamp.id}`] = flag;
          await target.update(updates);
          touched++;
        } catch (err) { failures++; log(`Stamp failed on ${t.target.name}`, err); }
      }

      const summary = L('ActorStamp.Done', { name: p.stamp.name, touched, total: p.rows.length, added, removed, gold: deliveries }) + (failures ? ` ${L('ActorStamp.Failed', { n: failures })}` : '');
      log(summary); ui.notifications[failures ? 'warn' : 'info'](summary);
      try { await ChatMessage.create({ content: `<h3>${L('ActorStamp.Title')}</h3><p>${esc(summary)}</p>`, whisper: [game.user.id] }); } catch (err) { log('Chat report failed', err); }
      this.last = summary; this.plan = null; this.render();
    }
  }

  let app = null;
  const openApp = (id) => { (app ??= new ActorStampApp()).render(true); if (id) app.select(id); };
  return { id: 'actor-stamp', title: 'VMTP.ActorStamp.Title', hint: 'VMTP.ActorStamp.Hint', icon: 'fa-stamp', group: 'VMTP.Group.Stamps', gm: true, open: () => (app ??= new ActorStampApp()).render(true) };
};
