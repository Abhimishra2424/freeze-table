# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`freeze-table` — a published npm package (no app, no framework). A single React
component: a virtualized list table with frozen columns, built on react-table v7 with
zero UI-library dependencies. `src/` is a small module tree behind one exported
component — see "File layout".

## Commands

```bash
npm run build     # rimraf dist + rollup -c → dist/freeze-table.{esm,cjs}.js
npm test          # build + smoke + golden + unit + dom — run this before calling anything done
npm run smoke     # node scripts/smoke.js — server-renders dist/*.cjs.js and asserts markup
npm run golden    # byte-compares 30 SSR snapshots against scripts/__golden__/
npm run test:unit # bundles scripts/unit.js and runs the src/lib checks (no React)
npm run test:dom  # scripts/dom.cjs — mounts the bundle in jsdom and drives it
npm run demo      # bundles example/demo.jsx → example/demo.bundle.js
npm run release   # loads .env, then npm publish (which runs prepublishOnly → build)
```

- **`npm run smoke` and `npm run golden` test the BUILT bundle, not `src/`.** Always
  `npm run build` first (or just `npm test`, which does), or you are asserting against a
  stale `dist/`. There is no test framework and no linter — the four suites are plain node
  scripts, and jsdom is the only test dependency. Verifying a change means: `npm test`,
  then `npm run demo` and open `example/index.html` from the filesystem (it bundles React
  in, so no server is needed).
- Smoke assertions are string matches against the SSR output (`html.includes('left:59px')`).
  A layout change that shifts an offset breaks them legitimately — recompute the expected
  value from the column widths rather than loosening the assertion.
- **Golden snapshots are the refactor net.** `scripts/golden.js` renders 30 configurations
  and compares the whole markup byte-for-byte. A change that is meant to move code around
  without changing output must leave every file untouched; a deliberate behaviour change
  means `npm run golden:update` and *reading the diff* before committing it.
- Rows never appear in the smoke or golden output: they render only once the row band has
  been measured, and there is nothing to measure on the server. That half — windowing,
  typed cells, keyboard navigation, the toolbar menus, the layout round-trip — is covered
  by `npm run test:dom`, which mounts the built bundle in jsdom over a **fake layout
  engine** (jsdom reports every offsetHeight as 0, so `scripts/dom.cjs` stubs sizes per
  element role). It also stubs `requestAnimationFrame` to run inline, which is why the
  windowing assertions are deterministic — and why a test must not exercise the reorder
  drag, whose rAF loop would spin. The drags remain demo-only.
- **A token change rewrites all 30 golden snapshots.** That is expected — every element
  paints through `var()` now. Read the diff for the GEOMETRY (`left:`, `right:`,
  `min-width:`, `top:`): those must be byte-identical, and any change to one is a real
  regression hiding in the churn.
- `npm run test:unit` covers `src/lib/`: the freeze offsets, the pin caps,
  `reconcileOrder`, the formatters, `normalizeColumn`, and the token/slot registries — the
  theme tests assert the three token maps agree, which is the check that catches a token
  added to one map and forgotten in another.
- Assertions that format a number must pass an explicit locale or compare against
  `toLocaleString`. A hard-coded `'1,252,500.00'` passes in en-US and fails on an en-IN
  machine, where the same number groups as `12,52,500.00`. It bundles through rollup
  because `src/` is ESM inside a CommonJS package. Pure logic worth testing belongs in
  `src/lib/`, not in a hook.
- `dist/` is gitignored but is what `main`/`module` point at; `prepublishOnly` rebuilds it.
  `example/` and `scripts/` are gitignored from the npm tarball but tracked in git.
- **Publish with `npm run release`, not bare `npm publish`.** `.npmrc` (gitignored) reads
  the token indirectly as `${NPM_TOKEN}`, and nothing loads `.env` on its own — a bare
  `npm publish` resolves that to nothing and fails with a 401. The `release` script sources
  `.env` first. Bump `package.json` in the release commit, as always.

## Architecture

### The one invariant everything else follows from

`.ft-wrap` is the **single scrollport for both axes**. Frozen columns are plain CSS
`position: sticky` (`left:` / `right:` = cumulative width of the frozen columns before /
beyond them), so **nothing runs in JS per scroll frame**. Sticky resolves against the
nearest scroll container, so:

- Rows are **windowed by hand** (`firstIdx`/`lastIdx`, `OVERSCAN = 6`, absolutely
  positioned inside a full-height container) instead of with react-window — a
  virtualization library's own `overflow` div would become the sticky scrollport for the
  body cells and the freeze would break.
- The body cannot get its own `overflow-y` (an element that scrolls in y is a scroll
  container in x too). That is why the native scrollbars are hidden (`.ft-nobar`) and
  redrawn as overlay tracks/thumbs positioned imperatively from the same rAF-throttled
  scroll handler that drives the windowing.

Anything that introduces a nested scroll container inside `.ft-wrap` will silently break
column freezing. Treat that as the first thing to check when the pinned block "slides away".

### File layout

- `src/FreezeTable.js` — the `forwardRef` shell: reads the props, calls the hooks below in
  order, renders the four child components. It holds no logic of its own; anything that
  grows past a few lines here belongs in a hook.
- `src/lib/columnTypes.js` — the `type` / `footer` / `format` shorthands: the date and
  number formatters, one entry per column type, and `normalizeColumns`, which expands a
  caller's config into what react-table gets. Two rules hold it together: **anything the
  caller wrote explicitly wins**, and a column using no shorthand is returned with its
  IDENTITY intact (cloning every column would break the memo chain downstream).
- `src/lib/props.js` — `resolveHeight`, and anywhere else a prop needs interpreting.
- `src/lib/columns.js` — **pure** column maths, no React and no DOM: `colIdOf`,
  `colWidthOf`, `reconcileOrder`, `applyLayout`, the pin caps, `stickyOffsets`, and the
  shared constants (`OVERSCAN`, `DRAG_SLOP`, `PIN_MIN_SCROLLABLE`, `ELLIPSIS`). This is
  the only file with unit tests, so put new logic here whenever it can be expressed as a
  function of its arguments.
- `src/hooks/` — one concern each, called from the shell in this order:
  `useLayoutStorage` (the `pinStorageKey` reads/writes) → `useColumnLayout` (widths,
  hidden set, order → `cols`) → `usePinning` (the two freeze counts and their caps) →
  `useTableColumns` (`cols` + `__strip`/`__actions` → what react-table receives) →
  `useMeasurements` → `useTableScroll` → `useOverlayScrollbars` → `useRowNavigation` →
  `useColumnDrag` → `useTableHandle` (the whole imperative ref API). Plus
  `useStabilityWarning`, a dev-only console warning when `columns` / `data` arrive as a
  new array with the same contents several renders running.
- `src/components/` — `TableHead`, `TableBody` (+ the memoized `VirtualRow`), `TableFoot`,
  `OverlayBars`, `Toolbar` (the built-in Columns / Freeze menus), and `defaults.js` (the
  default cell and filter renderers).
- `src/lib/theme.js` — the design tokens: `LIGHT` (every token, fully resolved — it is
  also the inline `var()` fallback table, so no entry may itself be a `var()`), `LADDER`
  (which tokens derive from which core one), `DARK` (a PARTIAL override — never re-state
  a derived token there or the ladder stops reaching it), `v()` and `themeCss()`.
- `src/lib/stylesheet.js` — the injected `<style>` text, built from the token maps. Pure
  data with no React import, so `rollup.config.mjs` can emit it as `dist/freeze-table.css`
  too. Only put things here that an inline style cannot express: keyframes, `:hover` /
  `:focus` / `::placeholder`, `[aria-checked]`, the frozen-column shadow selectors.
- `src/lib/slots.js` — `cx` (class merge; returns `undefined`, never `''`),
  `resolveClassNames`, `resolveComponents`, and `skin()`, the `unstyled` gate.
- `src/internal-ui.js` — inline-SVG replacements for the Semantic UI pieces the component
  originally used (sort/pin/inbox/search icons, filter input, spinner) plus the menu atoms,
  `injectStyles` and `useIsoLayoutEffect`. Everything it exports is also the DEFAULT for a
  `components` slot (`DEFAULT_COMPONENTS`), so each one's props are a public contract.
- `src/index.js` — re-exports, including the `CommonTable` alias.
- `index.d.ts` — **hand-written and not generated**. Every prop/ref change must be mirrored
  here or consumers silently lose typing.

### The shorthand layer (1.0)

`type`, `footer`, `format` and the `width`-implies-`minWidth` rule are all one thing:
sugar over the config that already existed. Three rules keep it from becoming a second,
competing API —

- **Explicit wins.** A `type` only fills in keys the caller left out. `{ type: 'currency',
  align: 'left' }` is a left-aligned currency column, not a conflict. The one exception is
  deliberate: an explicit `width` overrides the type's `minWidth` floor, because
  `{ type: 'date', width: 60 }` has to mean 60.
- **Identity is preserved.** `normalizeColumns` returns the SAME array (and the same
  column objects) when nothing needed expanding — the whole memo chain hangs off that
  identity.
- **Nothing is only reachable through a shorthand.** Every one of them expands to config a
  caller could have written by hand, which is what keeps the escape hatch honest.

Same principle for the toolbar: it drives the ref API and nothing else. If a menu can do
something the ref cannot, that is a bug in the split.

### Pinning model

Freezing is expressed as **two counts**, not per-column flags: N leading columns frozen
left, M trailing columns frozen right. Only a leading/trailing run can freeze — a frozen
middle column would have its neighbours scroll out from under it.

- `pinned: true | 'left' | 'right'` in the column config only seeds the **defaults**
  (`defaultPinCount` / `defaultRightPinCount`).
- The user's choice lives in state, is set via the ref (`setLeftPinCount` /
  `setRightPinCount`), and persists to `localStorage` under `ctPin:<key>` / `ctPinR:<key>`
  when `pinStorageKey` is given. The pin *menu* is either the built-in toolbar's or the
  caller's — the component's state is the same either way.
- A hard cap (`maxPinCount` / `maxRightPinCount`) keeps `PIN_MIN_SCROLLABLE = 250px` of
  viewport for the scrolling columns. Right is budgeted first, then left gets the
  remainder. Getters report the **effective** (capped) count; `getMax…` exposes the cap so
  a menu can disable entries beyond it.
- The status-strip column auto-joins the left block; the Action column joins whichever
  block it currently sits inside (or freezes alone at its edge via `pinActions`) — see
  "Synthetic columns".
- The 0.6.0 rename left `getPinCount`/`getMaxPinCount`/`setPinCount` as working deprecated
  aliases for the left-edge methods. Keep them.

### Column widths, visibility and order (0.7.0 / 0.8.0)

Same shape as pinning: the column config is only the **default**, the user's choice lives
in state and is applied on top, and the *menu* is either the built-in toolbar's or the
caller's own (`getColumnList()` feeds both).

- All three are keyed by `colIdOf(c)` (explicit `id`, else a string accessor). A column
  with an accessor function and no id cannot be hidden, resized or moved (it rides along
  under a positional `__col<i>` key so the order list stays complete).
- `applyLayout()` (hidden dropped, resized widths applied, user order applied) is derived
  from the `columns` prop inside `useColumnLayout` and yields `cols` + `actionPos`.
  **Everything downstream reads `cols`, never `columns`** — pin defaults, pin caps,
  `pinIndex`, the sticky offsets. Only `useColumnLayout` itself and `getColumnList()`
  still look at the raw prop.
- A resize writes `width`/`minWidth`/`maxWidth` to the same number, because react-table
  renders `min(max(minWidth, width), maxWidth)`.
- Both drags paint a line and commit **once, on pointer-up**. Never make either live: the
  column defs feed `itemData`, so a per-frame width or order would re-render every visible
  row.
- The order is a complete list of ids (hidden columns included, `__actions` among them),
  and a stored one is always run through `reconcileOrder` against the config order rather
  than trusted — otherwise a column added to `columns` later would vanish or land at the
  end.
- A header press serves three gestures: click = sort, sideways drag = reorder (arms after
  `DRAG_SLOP`, then swallows the trailing click in the capture phase), right-edge drag =
  resize (its own handler stops propagation so it never starts a reorder).

### Synthetic columns

`allColumns` = optional `__strip` column (prepended when `rowStripColor` is set) +
caller columns (annotated with `pinIndex`, `pinned`, `pinnedRight`, `pinnedLast`,
`pinnedRightFirst`) + optional `__actions` column, spliced in at `actionPos` (its config
default is the `actionIndex` prop; the user can drag it anywhere). Caller columns carry
their index among the VISIBLE caller columns as `pinIndex`, so the pin UI can talk in
terms of the caller's own list (minus whatever is hidden).

Because `__actions` is movable, it no longer auto-joins the right block unconditionally:
it freezes with whichever run it lies INSIDE (`actionPos < leftCount`, or
`actionPos >= cols.length - rightCount`), and the pin caps only charge its width against
the budget of the run it is actually in. The `__strip` column is still unconditionally
part of the left block, and is never a reorder source or drop target.

### Performance rules that are load-bearing

- `VirtualRow` is `React.memo`'d and **must not** re-render on selection change. The
  selected index is read from `selectedIndexRef` for the initial paint, and the highlight
  is repainted **imperatively** by an effect walking `[data-ct-index]` nodes. Putting
  `selectedIndex` into `itemData` reintroduces the arrow-key lag this design exists to fix.
- The scroll listener is attached manually as `passive` (React's `onScroll` is non-passive).
- `autoResetSortBy` / `autoResetFilters` / `autoResetGlobalFilter` are disabled — callers
  routinely pass a freshly-built `data` array, and without this a header click sets then
  immediately clears the sort.

### Build

`rollup.config.mjs` **bundles react-table v7** (a custom `resolveId` plugin forces its
`react-table.production.min.js`) rather than declaring it a peer: v7 ships only CJS/UMD and
its archived peer range stops at React 18, so React 19 apps could not install it. React
itself stays external (`/^react($|\/)/`); the only peer dep is `react >= 16.8`. Its MIT
notice is reproduced in `LICENSE` and in the rollup `banner` — keep both if the bundling
changes. `rollup.demo.mjs` is a separate IIFE build that inlines React too.

## Conventions

- **Comments explain why, at length.** Most non-obvious blocks carry a paragraph on the
  failure mode that motivated them. Match that when touching this code; a change that
  removes a workaround should remove its comment, and a new workaround should explain
  what broke without it.
- Every element carries both the current `ft-*` class and its legacy `ct-*` twin
  (`className="ft-row ct-row"`), and data attributes stay `data-ct-*`, for projects
  migrating off a local `CommonTable`. Don't drop the twins.
- **The default token blocks live in `:where()`.** Do not "simplify" that away. The base
  block and a consumer's `.my-table` are both one class deep, and this sheet is injected
  at MOUNT — after every stylesheet the page loaded — so on a source-order tie the
  library wins and the consumer's theme is silently ignored, with nothing in the markup
  to explain it. `:where()` makes the defaults 0-0-0 so any consumer selector outranks
  them. `injectStyles` also inserts the element as `head.firstChild` for the same reason.
  Pinned by `scripts/dom.cjs` → "theme: consumer CSS outranks the defaults", which
  asserts it against the worst case (our sheet appended last).
- **A token that carries a font goes on `font-family`, never the `font` shorthand.** The
  shorthand needs a size, so `font: Inter, sans-serif` is invalid and the browser drops
  the declaration — and the default `inherit` is legal in both, so the bug survives every
  test that does not actually set the token. Same trap for any future shorthand token.
- **Every colour is a token, never a literal.** A new visual goes inline as
  `v('some-token')`, with the token added to `LIGHT` (+ `LADDER` if it derives from a core
  one, + `DARK` if the light value would be unreadable on a dark surface). A raw hex in a
  component file is a bug: an inline style beats a stylesheet, so a literal there is
  unreachable by any consumer. Things needing a selector/pseudo-class/keyframe go in
  `STYLESHEET` (lib/stylesheet.js), also as `v()`.
- **Engine vs skin.** Every style object mixes the two and only one is removable. Engine =
  `position: sticky` and its left/right offsets, the absolute row placement, the flex
  layout, `overflow`, `zIndex`, the measured widths, and the opaque background on a FROZEN
  cell (a transparent one shows the scrolling columns through it). Skin = everything else,
  and it goes through `skin(unstyled, {...})` at the call site. Keeping the split at each
  call site, not in a central list, is what stops the next visual landing on the wrong side.
- **New user-facing element → a `classNames` slot; new visual atom → a `components` slot.**
  Add the name to `CLASS_SLOTS` / `COMPONENT_SLOTS`, thread it, document the prop contract
  in the component's JSDoc and README §12, and mirror it in `index.d.ts`.
- **react-table mutates column objects.** `decorateColumn` does
  `Object.assign(column, {...defaultColumn, ...column})`, so whatever is stamped on a
  column the first time survives for the life of that object — a swapped-in `defaultColumn`
  member is never seen again. That is why `DEFAULT_COLUMN` is static and the replaceable
  `FilterInput` is read off the table instance (`ui`, forwarded like `userList`/`context`)
  rather than closed over. Same trap for anything else made replaceable later.
- README.md is the full user manual (15 sections) and is the package's main documentation —
  update the relevant section with any behaviour or prop change, and `index.d.ts` with it.
- **Additive, with the old spelling kept working.** 1.0 added `status`, `toolbar`,
  `context` and the layout API without removing `loading`/`dataFetched`, the pre-0.6 pin
  method names, or `CommonTable`. Keep doing that: a published package's old props are
  someone's working screen.
- Commits are one per release: `vX.Y.Z — <what changed, lowercase>`, bumping
  `package.json` in the same commit.
