# VMT port contract

How a macro becomes a VMT tool. Waves two and three follow this; so does anyone porting a tool of their own.

## Read before writing

1. `scripts/core.js`, `scripts/registry.js`, `scripts/tools/tokenFinder.js`, `scripts/tools/marquee.js`: the pattern.
2. `styles/vmt.css`: the shared classes. `lang/en.json`: the key style.
3. The Style section below. Binding.
4. The source macro you are porting, if there is one.

## Shape

+ One file per tool at `scripts/tools/<camelCase>.js`, an ES module importing from `../core.js`.
+ Export `tool`: `{ id, title: 'VMT.X.Title', hint: 'VMT.X.Hint', icon: 'fa-...', group: 'VMT.Group.<Scenes|Table|Actors|Items|World|Compendiums>', gm, open }`. `open` renders a singleton app (`(app ??= new XApp()).render(true)`).
+ `class XApp extends VmtApp` with `static DEFAULT_OPTIONS = { id: 'vmt-<kebab>', window: { title: 'VMT.X.Title' }, position: { width, height } }`. `html()` returns a string. `act(action, dataset, el)` handles every `[data-act]` click. `bind(root)` may add more listeners after `super.bind(root)`. Put `data-keep="name"` on any scroller.
+ Helpers from core: `L`, `esc`, `on`, `btn`, `opt`, `wait`, `confirm(title, body)`, `store`, `socket`, `MODULE_ID`. `this.val(name)` and `this.form()` read fields.
+ No jQuery. No `Dialog` v1. No `<script>` or `<style>` inside HTML strings. `DialogV2` from `foundry.applications.api` only for a true modal prompt.

## Storage

+ World data: `store(MODULE_ID, '<toolKey>', defaults)` with `get`, `set`, `update(fn)`. Never a journal.
+ Scene data: scene flags, `scene.setFlag(MODULE_ID, key, value)`.
+ A player who must write scene or world data emits through `socket.emit(name, data)`; the handler writes only when `game.user === game.users.activeGM`.
+ Every world specific default is wiped. Nothing from any particular world survives: no UUIDs, no journal names, no actor names, no place names.

## Words

+ Every user facing string goes through `L('X.Key')` with keys `VMT.X.*`, written to `lang/parts/<camelCase>.json` as a flat object. Include `VMT.X.Title` and `VMT.X.Hint`.
+ A key is never both a string and a parent of another key. `VMT.X.speed` and `VMT.X.speed.slow` cannot both exist.
+ No emoji anywhere. No em dashes. No box drawing or banner lines in console output; log plain lines prefixed `VMT <Tool> |`.
+ No author name. No world names.

## Style

+ Habits file rules apply: one line when readable, reuse logic, comments at most eight words and technical, `/* */` or a trailing `//` with one space after the delimiter, related logic blocked together with blank lines between blocks, same kind declarations on one line, try/catch around risky document writes, no readme block at the top beyond a one line purpose comment.
+ Shared CSS first. If a tool truly needs rules of its own, put them in `styles/parts/<camelCase>.css` scoped under `#vmt-<kebab>`. Never name a class `tab`, `tabs`, `active`, `icon`, `help`, or `item`; Foundry owns those.

## Parity

Keep every feature of the source unless the wave notes say otherwise. Keep every confirm the source had before a write. GM gating is `tool.gm`, not a check inside `open`.

## Done means

+ `node --check` passes on a `.mjs` copy of the file.
+ Every `L('...')` key in the file exists in the part file.
+ A grep for emoji and dashes comes back empty.
+ The report lists files written, anything dropped or changed and why, and anything that could not be made generic.
