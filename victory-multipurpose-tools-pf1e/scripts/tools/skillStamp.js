/* Skill Stamp: custom pf1 skills stamped onto actors. */
export default (vmt) => {
  const { App, store, adapter, ui: { esc, on, btn, opt, wait, confirm, i18n } } = vmt, L = i18n('VMTP');
  const MODULE_ID = 'victory-multipurpose-tools-pf1e', FLAG = 'skillKeys', ABL = ['str', 'dex', 'con', 'int', 'wis', 'cha'], TYPES = ['character', 'npc'];
  const SCOPES = { selected: 'ScopeSelected', pcs: 'ScopePcs', npcs: 'ScopeNpcs', all: 'ScopeAll' }, BLANK = { name: '', key: '', ability: 'int', rt: false, acp: false };
  const skills = store(MODULE_ID, 'skillStamp', { skills: [] });
  const log = (m, err) => (err ? console.error(`VMTP SkillStamp | ${m}`, err) : console.log(`VMTP SkillStamp | ${m}`));
  const cleanKey = (s) => String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const ablLabel = (k) => game.i18n.localize(pf1?.config?.abilitiesShort?.[k] ?? k);
  const yn = (b) => L(b ? 'SkillStamp.Yes' : 'SkillStamp.No');
  const scopeLabel = (s) => L(`SkillStamp.${SCOPES[s]}`);
  const skillData = (d) => ({ name: d.name, ability: d.ability, rank: 0, notes: '', mod: 0, rt: d.rt, cs: false, acp: d.acp, background: false, subSkills: {} }); /* full pf1 skill shape */
  const coreKeys = () => { const c = new Set(Object.keys(pf1?.config?.skills ?? {})); if (!c.size) ui.notifications.error(L('SkillStamp.NoCore')); return c.size ? c : null; }; /* hard blacklist, read fresh */
  const uniq = (list) => { const seen = new Set(); return list.filter((a) => a && TYPES.includes(a.type) && !seen.has(a.uuid) && seen.add(a.uuid)); };
  const targetsFor = (scope) => (scope === 'selected' ? uniq(canvas.tokens.controlled.map((t) => t.actor)) : game.actors.filter((a) => (scope === 'all' ? TYPES : [scope === 'pcs' ? 'character' : 'npc']).includes(a.type)));

  /* Reconcile: per key writes, "-=" removals, flag refreshed. */
  async function stamp(targets, list, scope, CORE) {
    const byKey = new Map(list.map((s) => [s.key, s])), n = { added: 0, updated: 0, removed: 0, failed: 0 };
    for (const actor of targets) {
      try {
        const u = {}, cur = actor.system?.skills ?? {}, managed = actor.getFlag(MODULE_ID, FLAG) ?? [];
        for (const d of list) {
          if (CORE.has(d.key)) continue; // never touch core, ever
          const c = cur[d.key], p = `system.skills.${d.key}`;
          if (!c) { u[p] = skillData(d); n.added++; continue; }
          const diff = [['name', d.name], ['ability', d.ability], ['rt', d.rt], ['acp', d.acp]].filter(([f, v]) => c[f] !== v); // rank and notes untouched
          for (const [f, v] of diff) u[`${p}.${f}`] = v;
          if (diff.length) n.updated++;
        }

        for (const k of managed) if (!byKey.has(k) && cur[k] && !CORE.has(k)) { u[`system.skills.-=${k}`] = null; n.removed++; } // managed, unlisted, present, not core
        u[`flags.${MODULE_ID}.${FLAG}`] = [...byKey.keys()];
        await actor.update(u);
      } catch (err) { n.failed++; log(`Stamp failed on ${actor.name}`, err); }
    }

    const summary = L('SkillStamp.Summary', { n: targets.length, scope: scopeLabel(scope), ...n }) + (n.failed ? ` ${L('SkillStamp.FailedHint', { n: n.failed })}` : '');
    log(summary);
    ui.notifications[n.failed ? 'warn' : 'info'](summary);
    try { await ChatMessage.create({ content: `<h3>${L('SkillStamp.Report')}</h3><p>${esc(summary)}</p><p><b>${L('SkillStamp.ReportSkills')}:</b> ${esc(list.map((s) => s.name).join(', ') || L('SkillStamp.ReportNone'))}</p>`, whisper: [game.user.id] }); } catch (err) { log('Chat report failed', err); }
    return summary;
  }

  class SkillStampApp extends App {
    static DEFAULT_OPTIONS = { id: 'vmtp-skill-stamp', window: { title: 'VMTP.SkillStamp.Title' }, position: { width: 540, height: 640 } };

    constructor(...args) { super(...args); this.edit = null; this.scope = 'selected'; this.msg = ''; } /* edit = key loaded in form */

    html() {
      const list = skills.get().skills, e = list.find((s) => s.key === this.edit) ?? BLANK;
      const ic = (act, icon, key, title) => btn(act, `<i class="fas ${icon}"></i>`, `class="ic" data-key="${esc(key)}" title="${L(`SkillStamp.${title}`)}"`);
      const row = (s) => `<li><span><b>${esc(s.name)}</b> (${esc(s.key)}) ${L('SkillStamp.Row', { ability: ablLabel(s.ability), rt: yn(s.rt), acp: yn(s.acp) })}</span>${ic('edit', 'fa-pen', s.key, 'Edit')}${ic('del', 'fa-trash', s.key, 'Delete')}</li>`;
      return `<h3>${L('SkillStamp.Define')}</h3>
        <div class="grid2"><label>${L('SkillStamp.Name')}<input type="text" name="name" value="${esc(e.name)}" placeholder="${L('SkillStamp.NamePlaceholder')}"></label>
          <label>${L('SkillStamp.Key')}<input type="text" name="key" value="${esc(e.key)}" placeholder="${L('SkillStamp.KeyPlaceholder')}" ${this.edit ? 'readonly' : ''}></label>
          <label>${L('SkillStamp.Ability')}<select name="ability">${opt(ABL.map((k) => [k, ablLabel(k)]), e.ability)}</select></label>
          <div class="row"><label class="check"><input type="checkbox" name="rt" ${e.rt ? 'checked' : ''}>${L('SkillStamp.RT')}</label><label class="check"><input type="checkbox" name="acp" ${e.acp ? 'checked' : ''}>${L('SkillStamp.ACP')}</label></div></div>
        <div class="row">${btn('commit', `<i class="fas fa-check"></i> ${L(this.edit ? 'SkillStamp.Update' : 'SkillStamp.Commit')}`, 'class="gold"')}${this.edit ? btn('cancel', L('SkillStamp.Cancel')) : ''}<span class="muted">${esc(this.msg)}</span></div>
        <h3>${L('SkillStamp.List')}</h3>
        <ul class="names" data-keep="skills">${list.map(row).join('') || `<li class="muted">${L('SkillStamp.NoSkills')}</li>`}</ul>
        <p class="hint">${L('SkillStamp.ListHint')}</p>
        <h3>${L('SkillStamp.Stamp')}</h3>
        <div class="row"><label>${L('SkillStamp.Scope')}<select name="scope">${opt(Object.keys(SCOPES).map((s) => [s, scopeLabel(s)]), this.scope)}</select></label>${btn('stamp', `<i class="fas fa-stamp"></i> ${L('SkillStamp.Stamp')}`, 'class="gold"')}</div>
        <p class="hint">${L('SkillStamp.StampHint')}</p>`;
    }

    /* Key suggested from first word until hand edited. */
    bind(root) {
      super.bind(root);
      on(root, 'input', '[name="name"]', (el) => { const k = root.querySelector('[name="key"]'); if (!this.edit && !k.dataset.touched) k.value = cleanKey(el.value.split(/\s+/)[0]).slice(0, 8); });
      on(root, 'input', '[name="key"]', (el) => { el.dataset.touched = '1'; });
    }

    async act(a, ds) {
      const acts = {
        commit: () => this.commit(),
        cancel: () => { this.edit = null; this.msg = ''; this.render(); },
        edit: () => { this.edit = ds.key; this.msg = ''; this.render(); },
        del: async () => {
          if (!(await confirm(L('SkillStamp.Title'), L('SkillStamp.DeleteAsk', { key: ds.key })))) return;
          try { await skills.update((d) => { d.skills = d.skills.filter((s) => s.key !== ds.key); }); this.msg = L('SkillStamp.Deleted', { key: ds.key }); log(`Deleted ${ds.key}`); } catch (err) { this.msg = L('SkillStamp.SaveFail', { error: err.message }); log('Delete failed', err); }
          if (this.edit === ds.key) this.edit = null;
          this.render();
        },
        stamp: () => this.stamp(),
      };
      return acts[a]?.();
    }

    /* Add or update by key, core keys refused. */
    async commit() {
      const f = this.form(), name = f.name.trim(), key = cleanKey(this.edit ?? f.key), d = { name, key, ability: f.ability, rt: !!f.rt, acp: !!f.acp }, CORE = coreKeys();
      if (!CORE) return;
      const bad = !name ? 'NeedName' : !key ? 'NeedKey' : CORE.has(key) ? 'CoreKey' : null;
      if (bad) return ui.notifications.warn(L(`SkillStamp.${bad}`, { key }));
      try {
        let was;
        await skills.update((s) => { was = s.skills.findIndex((x) => x.key === key); if (was >= 0) s.skills[was] = d; else s.skills.push(d); });
        this.msg = L(was >= 0 ? 'SkillStamp.Updated' : 'SkillStamp.Saved', { name }); this.edit = null; log(`Committed ${key}`);
      } catch (err) { this.msg = L('SkillStamp.SaveFail', { error: err.message }); log('Commit failed', err); }
      this.render();
    }

    /* Confirm, then reconcile every actor in scope. */
    async stamp() {
      const scope = this.scope = this.val('scope') || 'selected', list = skills.get().skills, targets = targetsFor(scope), CORE = coreKeys();
      if (!CORE) return;
      if (!targets.length) return ui.notifications.warn(L('SkillStamp.NoTargets'));
      if (!(await confirm(L('SkillStamp.Title'), L('SkillStamp.StampAsk', { n: targets.length, skills: list.length, scope: scopeLabel(scope) })))) return;
      this.msg = await stamp(targets, list, scope, CORE);
      this.render();
    }
  }

  let app = null;
  return { id: 'skill-stamp', title: 'VMTP.SkillStamp.Title', hint: 'VMTP.SkillStamp.Hint', icon: 'fa-stamp', group: 'VMTP.Group.Skills', gm: true, open: () => (app ??= new SkillStampApp()).render(true) };
};
