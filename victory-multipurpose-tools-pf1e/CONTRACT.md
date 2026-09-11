# PF1e pack contract

Everything in the base contract applies (`../victory-multipurpose-tools/CONTRACT.md`). This file is only what differs for a pack that lives outside the toolbox module.

## Shape

+ A pack never imports from the toolbox's files. It receives the toolbox API on the `vmt.ready` hook and hands it to each tool. `scripts/pf1e.js` does that once; a tool file never touches hooks or registration.
+ One file per tool at `scripts/tools/<camelCase>.js` with a default export factory:

```js
export default (vmt) => {
  const { App, store, socket, adapter, ui: { esc, on, btn, opt, wait, confirm, i18n } } = vmt, L = i18n('VMTP');
  class XApp extends App { static DEFAULT_OPTIONS = { id: 'vmtp-<kebab>', window: { title: 'VMTP.X.Title' }, position: { width, height } }; /* html(), act(), bind() as in the base contract */ }
  let app = null;
  return { id: '<kebab>', title: 'VMTP.X.Title', hint: 'VMTP.X.Hint', icon: 'fa-...', group: 'VMTP.Group.<Inventory|Skills|Stamps>' or 'VMT.Group.<Actors|Items|Scenes|Table|World|Compendiums>', gm, open: () => (app ??= new XApp()).render(true) };
};
```

+ The window ids and lang keys use the `vmtp` and `VMTP` prefixes. Groups may reuse the toolbox's `VMT.Group.*` keys.
+ Storage is `store('victory-multipurpose-tools-pf1e', '<toolKey>', defaults)`. Actor and item flags go under the pack id.
+ pf1 names come from `adapter.get()`: `physical`, `stackable`, `features`, `currency.path`, `currency.coins`, `quantity`, `identified`. A tool reads those instead of carrying its own list, so the pack is the one place pf1 is spelled out.

## Style

+ Any extra CSS goes in `styles/parts/<camelCase>.css` scoped under `#vmtp-<kebab>`. The toolbox's shared classes are already loaded.
+ Console lines are prefixed `VMTP <Tool> |`.
