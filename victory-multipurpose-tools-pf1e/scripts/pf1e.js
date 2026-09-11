/* PF1e pack: describes pf1, registers its tools. */
import skillStamp from './tools/skillStamp.js';
import actorBackup from './tools/actorBackup.js';
import hostileReset from './tools/hostileReset.js';
import identifyAll from './tools/identifyAll.js';
import inspectInventory from './tools/inspectInventory.js';
import transferInventory from './tools/transferInventory.js';
import purgeInventory from './tools/purgeInventory.js';
import lootSearch from './tools/lootSearch.js';
import compendiumLooter from './tools/compendiumLooter.js';
import actorStamp from './tools/actorStamp.js';

export const MODULE_ID = 'victory-multipurpose-tools-pf1e';
const TOOLS = [skillStamp, actorBackup, hostileReset, identifyAll, inspectInventory, transferInventory, purgeInventory, lootSearch, compendiumLooter, actorStamp];

/* What pf1 calls things, read via vmt.adapter. */
export const PF1 = {
  system: 'pf1',
  physical: ['weapon', 'equipment', 'armor', 'loot', 'consumable', 'item', 'goods', 'ammunition', 'container', 'treasure'],
  stackable: ['weapon', 'equipment', 'consumable', 'loot', 'container', 'ammunition'],
  features: ['feat', 'class', 'race', 'buff', 'spell', 'attack', 'aura'],
  currency: { path: 'system.currency', coins: ['pp', 'gp', 'sp', 'cp'] },
  quantity: 'system.quantity',
  identified: 'system.identified',
};

Hooks.on('vmt.ready', (vmt) => {
  vmt.adapter.set(PF1);
  for (const make of TOOLS) vmt.register(make(vmt));
});
