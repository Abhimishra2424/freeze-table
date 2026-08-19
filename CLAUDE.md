# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`freeze-table` — a published npm package (no app, no framework). A single React
component: a virtualized list table with frozen columns, built on react-table v7 with
zero UI-library dependencies. The whole implementation is three files under `src/`.

## Commands

```bash
npm run build     # rimraf dist + rollup -c → dist/freeze-table.{esm,cjs}.js
npm run smoke     # node scripts/smoke.js — server-renders dist/*.cjs.js and asserts markup
npm run demo      # bundles example/demo.jsx → example/demo.bundle.js
npm run release   # loads .env, then npm publish (which runs prepublishOnly → build)
```

- **`npm run smoke` tests the BUILT bundle, not `src/`.** Always `npm run build` first,
  or you are asserting against a stale `dist/`. This is the only test suite — there is no
  jest/vitest, no jsdom, no linter. Verifying a change means: build, smoke, then
  `npm run demo` and open `example/index.html` from the filesystem (it bundles React in,
  so no server is needed).
- Smoke assertions are string matches against the SSR output (`html.includes('left:59px')`).
  A layout change that shifts an offset breaks them legitimately — recompute the expected
  value from the column widths rather than loosening the assertion.
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

- `src/FreezeTable.js` — the entire component (~1200 lines, one `forwardRef` function).
- `src/internal-ui.js` — inline-SVG replacements for the Semantic UI pieces the component
  originally used (sort/pin/inbox/search icons, filter input, spinner), plus `injectStyles`
  (one idempotent `<style>` tag carrying only what inline styles cannot express: keyframes,
  `:focus`, `::placeholder`, the frozen-column shadow selectors) and `useIsoLayoutEffect`.
- `src/index.js` — re-exports, including the `CommonTable` alias.
- `index.d.ts` — **hand-written and not generated**. Every prop/ref change must be mirrored
  here or consumers silently lose typing.

### Pinning model

Freezing is expressed as **two counts**, not per-column flags: N leading columns frozen
left, M trailing columns frozen right. Only a leading/trailing run can freeze — a frozen
middle column would have its neighbours scroll out from under it.

- `pinned: true | 'left' | 'right'` in the column config only seeds the **defaults**
  (`defaultPinCount` / `defaultRightPinCount`).
- The user's choice lives in state, is set via the ref (`setLeftPinCount` /
  `setRightPinCount`), and persists to `localStorage` under `ctPin:<key>` / `ctPinR:<key>`
  when `pinStorageKey` is given. The pin *menu* is the caller's to render.
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
in state and is applied on top, and the *menu* is the caller's to render (`getColumnList()`
feeds it).

- All three are keyed by `colIdOf(c)` (explicit `id`, else a string accessor). A column
  with an accessor function and no id cannot be hidden, resized or moved (it rides along
  under a positional `__col<i>` key so the order list stays complete).
- The `layout` memo (hidden dropped, resized widths applied, user order applied) is derived
  from the `columns` prop right at the top of the component and yields `cols` +
  `actionPos`. **Everything downstream reads `cols`, never `columns`** — pin defaults, pin
  caps, `pinIndex`, the sticky offsets. Only the layout-state block and `getColumnList()`
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
- Styling is inline; there is no stylesheet for consumers to import. New visuals go inline
  unless they need a selector/pseudo-class/keyframe, which goes in `STYLESHEET`.
- README.md is the full user manual (13 sections) and is the package's main documentation —
  update the relevant section with any behaviour or prop change.
- Commits are one per release: `vX.Y.Z — <what changed, lowercase>`, bumping
  `package.json` in the same commit.
