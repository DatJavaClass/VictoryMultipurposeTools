/* Socket, keybinding, dock, module API, built in tools. */
import { MODULE_ID, i18n, esc, on, btn, opt, wait, confirm, VmtApp, store, socket, dispatch } from './core.js';
import { register, open, usable, toggle, renderDock } from './registry.js';
import { tool as tokenFinder } from './tools/tokenFinder.js';
import { tool as marquee, show as marqueeShow } from './tools/marquee.js';
import { tool as itemUpdate } from './tools/itemUpdate.js';
import { tool as actorRepair } from './tools/actorRepair.js';
import { tool as searchDelete } from './tools/searchDelete.js';
import { tool as positioning, importJournal as importPositioning } from './tools/dungeonPositioning.js';
import { tool as lights } from './tools/lightAdjuster.js';
import { tool as linkage } from './tools/linkageRepair.js';

const TOOLS = [tokenFinder, marquee, itemUpdate, actorRepair, searchDelete, positioning, lights, linkage];

/* System adapter: system packs describe, tools read. */
const adapter = { data: null, get: () => (adapter.data ??= { system: game.system.id, itemTypes: [...(game.documentTypes?.Item ?? [])].filter((t) => t !== 'base'), physical: [], currency: null }), set: (a) => Object.assign(adapter.get(), a) };

Hooks.once('init', () => {
  game.socket.on(`module.${MODULE_ID}`, dispatch);
  game.keybindings.register(MODULE_ID, 'toolbox', { name: 'VMT.Toggle', editable: [], onDown: () => { toggle(); return true; } });
});

/* API surface, see README Hooking in. */
Hooks.once('ready', () => {
  TOOLS.forEach(register);
  const api = { register, open, toggle, tools: usable, adapter, socket, store, App: VmtApp, ui: { esc, on, btn, opt, wait, confirm, i18n }, marquee: (d) => socket.emit('marquee', d), marqueeLocal: marqueeShow, importPositioning };
  game.modules.get(MODULE_ID).api = api;
  Hooks.callAll('vmt.ready', api);
  renderDock();
});
