/* Actor Backup: seed items that rebuild an actor. */
export default (vmt) => {
  const { App, store, adapter, ui: { esc, on, btn, opt, wait, confirm, i18n } } = vmt, L = i18n('VMTP');
  const MODULE_ID = 'victory-multipurpose-tools-pf1e', FLAG = 'seed', TAG = 'VMTP ActorBackup |', EXCLUDED_TYPES = ['spell'], FALLBACK_IMG = 'icons/magic/time/hourglass-yellow-green.webp';
  const log = (...a) => console.log(TAG, ...a), warn = (...a) => console.warn(TAG, ...a);
  const snap = (item) => item?.flags?.[MODULE_ID]?.[FLAG]?.snapshot ?? null;
  const stamp = (iso) => String(iso).slice(0, 16).replace('T', ' ');
  const targeted = () => [...new Set([...game.user.targets].map((t) => t.actor).filter(Boolean))]; // linked dupes collapse
  const seeds = () => game.items.filter((i) => snap(i)).sort((a, b) => a.name.localeCompare(b.name));

  /* Snapshot v1: items by source UUID, blob fallback. */
  async function buildSnapshot(actor) {
    const qtyPath = adapter.get().quantity ?? 'system.quantity', kept = actor.items.filter((i) => !EXCLUDED_TYPES.includes(i.type)), items = [];
    for (const item of kept) {
      const uuid = item.flags?.core?.sourceId || item.flags?.pf1?.sourceUUID || null, base = { name: item.name, type: item.type, qty: foundry.utils.getProperty(item, qtyPath) ?? 1 };
      if (uuid && await fromUuid(uuid).catch(() => null)) items.push({ mode: 'uuid', uuid, ...base, classLvl: item.type === 'class' ? (item.system?.level ?? 1) : null });
      else { const data = item.toObject(); delete data._id; items.push({ mode: 'blob', ...base, data }); }
    }
    const abilities = Object.fromEntries(Object.entries(actor.system.abilities ?? {}).map(([k, v]) => [k, v.value ?? 10]));
    return { version: 1, createdAt: new Date().toISOString(), actorName: actor.name, actorType: actor.type, tokenImg: actor.prototypeToken?.texture?.src ?? '', portraitImg: actor.img ?? '', abilities, hpMax: actor.system.attributes?.hp?.max ?? 0, biography: actor.system.details?.biography?.value ?? '', items, excludedSpells: actor.items.size - kept.length };
  }

  /* Wipe and rebuild; self contained, rides inside seeds. */
  const rebuild = async (actor, snapshot, keepId) => {
    await actor.deleteEmbeddedDocuments('Item', actor.items.filter((i) => i.id !== keepId).map((i) => i.id));

    const u = {};
    for (const [k, v] of Object.entries(snapshot.abilities ?? {})) u['system.abilities.' + k + '.value'] = v;
    if (snapshot.hpMax) { u['system.attributes.hp.max'] = snapshot.hpMax; u['system.attributes.hp.value'] = snapshot.hpMax; }
    if (snapshot.portraitImg) u.img = snapshot.portraitImg;
    if (snapshot.tokenImg) u['prototypeToken.texture.src'] = snapshot.tokenImg;
    if (snapshot.biography) u['system.details.biography.value'] = snapshot.biography;
    if (snapshot.actorName) { u.name = snapshot.actorName; u['prototypeToken.name'] = snapshot.actorName; }
    await actor.update(u);

    try {
      for (const scene of game.scenes) for (const t of scene.tokens.filter((t) => t.actorId === actor.id)) {
        const tu = {};
        if (snapshot.actorName) tu.name = snapshot.actorName;
        if (snapshot.tokenImg) tu['texture.src'] = snapshot.tokenImg;
        if (Object.keys(tu).length) await t.update(tu);
      }
    } catch (e) { console.warn('VMTP ActorBackup | token sweep:', e); }

    const prep = async (e) => {
      const src = e.mode === 'uuid' ? await fromUuid(e.uuid).catch(() => null) : null, d = e.mode === 'uuid' ? src?.toObject() : e.mode === 'blob' ? foundry.utils.deepClone(e.data) : null;
      if (!d) return null;
      delete d._id;
      if (e.qty && d.system?.quantity !== undefined) d.system.quantity = e.qty;
      if (e.mode === 'uuid' && e.type === 'class' && e.classLvl !== null) d.system.level = e.classLvl;
      return d;
    };
    const isParent = (e) => ['race', 'class'].includes(e.type), all = snapshot.items ?? [], failed = [], before = new Set(actor.items.map((i) => i.id)), parentIds = new Set();
    const add = async (e, ids) => { const d = await prep(e); if (!d) return failed.push(e.name); try { for (const p of await actor.createEmbeddedDocuments('Item', [d])) ids?.add(p.id); } catch { failed.push(e.name); } };
    for (const e of all.filter(isParent)) await add(e, parentIds);

    for (let last = -1, calm = 0, i = 0; i < 20 && calm < 2; i++) { // settle until autogen quiets, cap 10s
      await new Promise((r) => setTimeout(r, 500));
      if (actor.items.size === last) calm++; else { calm = 0; last = actor.items.size; }
    }
    const autoGen = actor.items.filter((i) => !before.has(i.id) && !parentIds.has(i.id)).map((i) => i.id); // strip spares fresh parents
    if (autoGen.length) await actor.deleteEmbeddedDocuments('Item', autoGen);
    for (const e of all.filter((e) => !isParent(e))) await add(e);
    return failed;
  };

  /* pf1 on use script, self contained. */
  const RESTORE_SCRIPT = `(async () => {
  if (!item || !actor) return ui.notifications.error("Use this seed from an actor's inventory.");
  if (!game.user.isGM && !actor.isOwner) return ui.notifications.warn("Only the GM or this actor's owner can restore.");
  const snapshot = item.flags?.["${MODULE_ID}"]?.["${FLAG}"]?.snapshot ?? null;
  if (!snapshot?.version || !snapshot?.actorName) return ui.notifications.error("No valid snapshot on this seed.");
  if (actor.type !== snapshot.actorType) return ui.notifications.error("Seed is a " + snapshot.actorType + " snapshot; this actor is a " + actor.type + ".");
  const made = String(snapshot.createdAt).slice(0, 16).replace("T", " "), n = snapshot.items?.length ?? 0;
  const okGo = await foundry.applications.api.DialogV2.confirm({ window: { title: "Restore " + snapshot.actorName + "?" }, content: "<p><b>This will WIPE everything on " + actor.name + "</b> and rebuild them as <b>" + snapshot.actorName + "</b> from this seed (" + n + " items, made " + made + ").</p><p>Current HP, conditions, and spells are not part of a seed. The seed is consumed.</p>", rejectClose: false });
  if (!okGo) return;
  const failed = await (${rebuild})(actor, snapshot, item.id);
  await actor.deleteEmbeddedDocuments("Item", [item.id]).catch(() => {});
  ui.notifications.info("Restored " + snapshot.actorName + (failed.length ? " (" + failed.length + " item(s) failed, see console)" : "") + ".");
  if (failed.length) console.warn("VMTP ActorBackup | restore failed:", failed);
  ChatMessage.create({ content: "<p><b>Backup Seed used:</b> " + snapshot.actorName + " restored." + (failed.length ? " " + failed.length + " item(s) could not be restored." : "") + "</p>", whisper: ChatMessage.getWhisperRecipients("GM") });
})();`;

  /* Seed item; loot gear keeps the Use action. */
  function seedData(snapshot) {
    const { itemTypes } = adapter.get(), type = itemTypes.includes('loot') ? 'loot' : itemTypes[0], spells = snapshot.excludedSpells;
    const line = (label, v) => `<p style="margin:0 0 3px 0;"><strong>${label}:</strong> ${esc(v)}</p>`;
    const desc = `<div style="padding:10px;border:1px solid #888;border-radius:6px;"><h3 style="margin:0 0 6px 0;">${L('ActorBackup.DescTitle')}</h3>${line(L('ActorBackup.DescActor'), `${snapshot.actorName} (${snapshot.actorType})`)}${line(L('ActorBackup.DescCreated'), stamp(snapshot.createdAt))}${line(L('ActorBackup.DescItems'), `${snapshot.items.length}${spells ? ` (+${spells} ${L('ActorBackup.DescSpells')})` : ''}`)}<p style="margin:0;font-size:0.85em;">${L('ActorBackup.DescUse')}</p></div>`;
    return { name: L('ActorBackup.SeedName', { name: snapshot.actorName }), type, img: snapshot.portraitImg || FALLBACK_IMG, flags: { [MODULE_ID]: { [FLAG]: { snapshot } } },
      system: { ...(type === 'loot' ? { subType: 'gear' } : {}), scriptCalls: [{ _id: foundry.utils.randomID(), name: L('ActorBackup.ScriptName'), type: 'script', value: RESTORE_SCRIPT, category: 'use', hidden: false }], description: { value: desc } } };
  }

  /* One seed per actor, read back verified. */
  async function backup(actors) {
    const made = [], failed = [], names = (a) => a.map((m) => m.actor).join(', ');
    for (const actor of actors) {
      try {
        const snapshot = await buildSnapshot(actor), seed = await Item.create(seedData(snapshot)), verify = seed ? game.items.get(seed.id) : null;
        if (!snap(verify)) { failed.push({ actor: actor.name, reason: 'seed failed read back verify' }); continue; }
        made.push({ actor: actor.name, seed: verify.name, items: snapshot.items.length, excludedSpells: snapshot.excludedSpells });
      } catch (e) { failed.push({ actor: actor.name, reason: e?.message ?? String(e) }); warn('backup failed for', actor.name, e); }
    }

    if (made.length) ui.notifications.info(L('ActorBackup.Backed', { names: names(made) }));
    if (failed.length) ui.notifications.warn(L('ActorBackup.BackupFail', { names: names(failed) }));
    log('backup', { made, failed });
  }

  /* Same routine the seed carries; world seed stays. */
  async function restore(seed, actor) {
    const s = snap(seed), items = s?.items?.length ?? 0;
    if (!s?.version || !s?.actorName) return ui.notifications.error(L('ActorBackup.BadSeed'));
    if (actor.type !== s.actorType) return ui.notifications.error(L('ActorBackup.TypeMismatch', { seed: s.actorType, actor: actor.type }));
    if (!await confirm(L('ActorBackup.Title'), L('ActorBackup.RestoreAsk', { actor: esc(actor.name), name: esc(s.actorName), items, created: stamp(s.createdAt) }))) return;

    const failed = await rebuild(actor, s, null), bad = failed.length;
    ui.notifications.info(L('ActorBackup.Restored', { name: s.actorName }) + (bad ? L('ActorBackup.RestoredBad', { n: bad }) : ''));
    if (bad) warn('restore failed:', failed);
    try { await ChatMessage.create({ content: `<p><b>${L('ActorBackup.Chat', { name: esc(s.actorName) })}</b>${bad ? ` ${L('ActorBackup.ChatBad', { n: bad })}` : ''}</p>`, whisper: ChatMessage.getWhisperRecipients('GM') }); }
    catch (e) { warn('report not sent:', e); }
  }

  class ActorBackupApp extends App {
    static DEFAULT_OPTIONS = { id: 'vmtp-actor-backup', window: { title: 'VMTP.ActorBackup.Title' }, position: { width: 520, height: 600 } };

    constructor(...args) { super(...args); this.busy = false; }

    html() {
      const dis = this.busy ? 'disabled' : '', actors = targeted(), list = seeds();
      const card = (a) => `<div class="card"><b>${esc(a.name)}</b><span class="hint">${L('ActorBackup.Meta', { type: a.type, items: a.items.size })}</span></div>`;
      const seedCard = (i) => { const s = snap(i); return `<div class="card row"><div class="grow"><b>${esc(i.name)}</b><span class="hint">${L('ActorBackup.SeedMeta', { actor: s.actorName, type: s.actorType, created: stamp(s.createdAt), items: s.items?.length ?? 0 })}${s.excludedSpells ? `, ${L('ActorBackup.SeedSpells', { n: s.excludedSpells })}` : ''}</span></div>${btn('restore', `<i class="fas fa-rotate-left"></i> ${L('ActorBackup.Restore')}`, `class="red" data-id="${esc(i.id)}" ${dis}`)}</div>`; };
      return `<div class="row"><h3>${L('ActorBackup.Targets')}</h3>${btn('refresh', `<i class="fas fa-sync"></i> ${L('ActorBackup.Refresh')}`, `class="end" ${dis}`)}</div>
        <div class="list targets" data-keep="targets">${actors.map(card).join('') || `<p class="empty">${L('ActorBackup.NoTargets')}</p>`}</div>
        <div class="row">${btn('backup', `<i class="fas fa-box-archive"></i> ${L('ActorBackup.Backup')}`, `class="gold" ${dis}`)}<span class="hint">${L('ActorBackup.BackupNote')}</span></div>
        <h3>${L('ActorBackup.Seeds')}</h3>
        <div class="list" data-keep="seeds">${list.map(seedCard).join('') || `<p class="empty">${L('ActorBackup.NoSeeds')}</p>`}</div>
        <p class="hint">${L('ActorBackup.RestoreNote')}</p>`;
    }

    async act(a, ds) {
      if (this.busy) return ui.notifications.warn(L('ActorBackup.Busy'));
      const actors = targeted(), acts = {
        refresh: () => this.render(),
        backup: () => (actors.length ? this.run(() => backup(actors)) : ui.notifications.warn(L('ActorBackup.NoTargets'))),
        restore: () => { const seed = game.items.get(ds.id); if (!seed) return ui.notifications.warn(L('ActorBackup.SeedGone')); if (actors.length !== 1) return ui.notifications.warn(L('ActorBackup.RestoreNeedOne')); return this.run(() => restore(seed, actors[0])); },
      };
      return acts[a]?.();
    }

    async run(fn) {
      this.busy = true; this.render();
      try { await fn(); }
      catch (e) { warn('run failed:', e); ui.notifications.error(L('ActorBackup.RunFail', { error: e?.message ?? String(e) })); }
      this.busy = false; this.render();
    }
  }

  let app = null;
  return { id: 'actor-backup', title: 'VMTP.ActorBackup.Title', hint: 'VMTP.ActorBackup.Hint', icon: 'fa-box-archive', group: 'VMT.Group.Actors', gm: true, open: () => (app ??= new ActorBackupApp()).render(true) };
};
