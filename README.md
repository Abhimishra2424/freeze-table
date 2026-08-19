# freeze-table

A virtualized React list table for **wide, dense, data-entry style screens** — the kind
with twenty columns, thousands of rows, per-column search boxes, frozen leading columns
and a totals row pinned to the bottom.

Built on [`react-table`](https://github.com/TanStack/table/tree/v7) **v7**, which is bundled
in. No peer install, no UI library, no CSS file to import, no theme to configure — every visual is an inline style and the
handful of glyphs it needs (sort arrows, pin marker, spinner, empty-state icon) are inline
SVG.

```bash
npm i freeze-table
```

That is the whole install. `react-table` v7 is bundled in (see
[Compatibility](#13-demo-build-compatibility)), so React is the only peer dependency.

```jsx
import { FreezeTable } from 'freeze-table';

<FreezeTable columns={columns} data={rows} height={560} />
```

---

## Why

Most grids either give you a plain HTML table that dies at 2,000 rows, or a full
datagrid framework with its own theming system. This one sits in between: it does
exactly what an accounting / ERP list screen needs, in ~900 lines you can read.

- **One scrollport, both axes.** Header, body and footer are children of the same wide
  inner div, so horizontal scrolling moves them together — columns never drift apart.
- **Frozen columns are real `position: sticky`.** Nothing runs in JS per scroll frame,
  so the frozen block does not shake or lag behind the rest of the row.
- **Rows are windowed by hand** (~15 lines) rather than by a virtualization library —
  which is precisely what keeps the single scrollport, and therefore the sticky freeze,
  possible.
- **Keyboard first.** ↑/↓/Home/End/Enter work on mount, without the user clicking in.
- **Selection repaints imperatively**, so arrow-key navigation does not re-render every
  visible row.

---

## Table of contents

1. [Quick start](#1-quick-start)
2. [Layout and scroll model](#2-layout-and-scroll-model)
3. [Column config](#3-column-config)
4. [Props](#4-props)
5. [Imperative ref API](#5-imperative-ref-api)
6. [Keyboard navigation and body states](#6-keyboard-navigation-and-body-states)
7. [Footer totals](#7-footer-totals)
8. [Frozen (pinned) columns](#8-frozen-pinned-columns)
9. [Per-row status colouring](#9-per-row-status-colouring)
10. [Restoring position on re-entry](#10-restoring-position-on-re-entry)
11. [Styling hooks](#11-styling-hooks)
12. [Gotchas](#12-gotchas)
13. [Demo, build, compatibility](#13-demo-build-compatibility)

---

## 1. Quick start

```jsx
import React, { useMemo, useRef } from 'react';
import { FreezeTable, ELLIPSIS } from 'freeze-table';

const COLUMNS = [
  { Header: '#', id: 'sl', width: 50, minWidth: 50, align: 'right', pinned: true,
    disableFilters: true, disableSortBy: true,
    Cell: ({ row, rows }) => rows.indexOf(row) + 1 },

  { Header: 'Customer Name', accessor: 'name', width: 200, minWidth: 200, pinned: true,
    Cell: ({ value }) => <div style={ELLIPSIS} title={value}>{value}</div>,
    Footer: (info) => `Count : ${info.rows.length}` },

  { Header: 'Amount', accessor: 'amount', width: 140, minWidth: 140, align: 'right',
    Footer: (info) => info.rows
      .reduce((s, r) => s + Number(r.values.amount || 0), 0)
      .toLocaleString('en-IN', { minimumFractionDigits: 2 }) },
];

export default function CustomerList({ byId, fetched, openRow }) {
  const tableRef = useRef(null);
  const columns = useMemo(() => COLUMNS, []);
  const data = useMemo(() => Object.values(byId), [byId]);

  return (
    <FreezeTable
      ref={tableRef}
      columns={columns}
      data={data}
      height={560}
      loading={!fetched}
      dataFetched={fetched}
      pinStorageKey="customer-list"
      onRowEnter={(row) => openRow(row)}
    />
  );
}
```

Both `columns` and `data` should be memoized — see [Gotchas](#12-gotchas).

### Exports

| Export        | What it is                                                       |
|---------------|------------------------------------------------------------------|
| `FreezeTable`   | The component (also the default export)                          |
| `CommonTable` | Alias of `FreezeTable`, for projects migrating off a local copy     |
| `ELLIPSIS`    | Shared single-line-ellipsis style object for custom `Cell`s       |

TypeScript definitions ship with the package (`index.d.ts`) — `FreezeTableProps`,
`FreezeTableColumn`, `FreezeTableHandle` are all exported as types.

---

## 2. Layout and scroll model

```
ft-root  (position: relative, the `height` you pass)
├── ft-wrap  (overflow: auto, native bars hidden) ← THE scrollport for BOTH axes
│   └── inner div (minWidth: totalColumnsWidth, flex column, minHeight 100%)
│       ├── ft-head   (position: sticky; top: 0)     ← labels + sort + search boxes
│       ├── body      (position: relative, height = rows * rowHeight)
│       │   └── ft-row (position: absolute, top = index * rowHeight) → ft-td cells
│       └── ft-foot   (position: sticky; bottom: 0)  ← optional totals row
├── ft-track ft-track-v  (inset by the header/footer heights) ← overlay vertical bar
└── ft-track ft-track-h                                       ← overlay horizontal bar
```

- **`height` is the TOTAL height** (header + body + footer), not the body height. The
  band left for rows is measured with a `ResizeObserver`, so rows fill the gap exactly —
  no clipped last row, no second scrollbar on the page.
- There is exactly **one vertical and one horizontal scrollbar**, both on `ft-wrap`.
- Only the rows in `[firstIdx .. lastIdx]` (viewport ± 6) are mounted; each is absolutely
  positioned inside a container of the full content height, so the native scrollbar still
  represents the whole list.
- The header/footer stay put because they are `sticky`, not because anything is
  repositioned in JS.

### Why the scrollbars are drawn, not native

`ft-wrap` covers the header and the footer as well as the rows, so its native vertical
scrollbar ran the **full height of the table** — a thumb sitting beside the header reads
as wrong, since the header does not scroll.

Moving that bar onto the body is not possible while the columns freeze: an element that
scrolls in y is a scroll container in x too, so the body would become the sticky
scrollport for the pinned cells and they would slide away with the rest of the row (this
is exactly the react-window problem the component was rewritten to escape).

So the native bars are hidden and redrawn as overlays — the vertical track inset by the
measured header and footer heights, so it spans the rows only. Both bars are drawn
rather than just the vertical one because Firefox's `scrollbar-width` takes no axis, and
drawing both keeps them identical across browsers. Wheel, trackpad, keyboard and
touch scrolling all remain fully native; the thumbs are positioned from the same
rAF-throttled handler that drives the windowing, so nothing extra re-renders. Dragging a
thumb temporarily suspends row snapping, which would otherwise make the drag feel
sticky.

---

## 3. Column config

```js
{
  Header,           // string | node. A plain string is best (a pin menu can list it)
  accessor,         // field key, or (row) => value (an accessor fn also needs `id`)
  id,               // required when accessor is a fn or absent
  Cell,             // optional renderer; default prints the raw value with ellipsis + title
  width,            // px (default 1 — i.e. effectively minWidth)
  minWidth,         // px (default 90) — an unconfigured column is 90px wide
  maxWidth,         // px
  align,            // 'left' | 'center' | 'right' — header, cells and footer
  disableFilters,   // hide this column's search box
  disableSortBy,    // no sorting on this column
  Footer,           // string | node | fn(tableInstance) — see §7
  noPadding,        // drop the default cell/header padding
  pinned,           // DEFAULT freeze state: true / 'left' / 'right' — see §8
  Filter,           // custom filter UI (e.g. a dropdown for an enum column)
  filter,           // custom react-table filter fn (rows, columnIds, filterValue)
}
```

### Widths are pixels, not flex weights

react-table computes `totalWidth = min(max(minWidth, width), maxWidth)`, and
`useFlexLayout` only emits a real `flex-grow` when `column.canResize` is set — which only
`useResizeColumns` does, and this component does not use it. So every cell renders
`flex: 0 0 auto` at `totalWidth` px, and **nothing stretches to fill leftover space**.

Give real pixel values. A `width` below `minWidth` is silently ignored
(`width: 2.4, minWidth: 200` → a 200px column).

### What `Cell` receives

`Cell` gets the **table instance spread**, so:

- custom props you pass to the table are readable — `userList` is forwarded:
  `Cell: ({ value, userList }) => ...`
- core instance fields are available too — e.g. a display-order serial column:
  `Cell: ({ row, rows }) => rows.indexOf(row) + 1`. Using `rows` (the filtered + sorted
  set) keeps the numbering 1..N after any sort or filter; `row.index` alone would shuffle.

Only `userList` is forwarded, so a `Cell` cannot reach an arbitrary callback. Export the
columns as a **factory** taking the callback and memoize it in the caller:

```js
const columns = useMemo(() => makeColumns(openPopup), []);
```

### Auto-appended columns

- **`__strip`** — prepended when `rowStripColor` is given: the narrow status-bar column
  (`stripWidth`, default 14px). Unsortable, unfilterable, auto-freezes with the pinned run.
- **`__actions`** — appended when `Actions` is given: the right-side Action column
  (`minWidth: actionWidth`, default 110). Renders
  `<Actions object={row.original} fn={fn} />` — note there is **no row index**. Freezes
  with the right block whenever `rightPinCount > 0`.

### Date columns

Format in the `Cell`, and give date-time columns `minWidth: 150` so `DD-MM-YYYY HH:mm:ss`
is not clipped:

```js
{ Header: 'Created', accessor: 'created_at', width: 150, minWidth: 150,
  Cell: ({ value }) => <div style={ELLIPSIS}>{fmt(value)}</div> }
```

---

## 4. Props

| Prop                | Default               | Meaning                                                              |
|---------------------|-----------------------|----------------------------------------------------------------------|
| `columns`           | (required)            | Column config array. **Memoize it**                                  |
| `data`              | (required)            | Row array. **Memoize it**                                            |
| `height`            | `500`                 | **Total** table height in px (header + body + footer)                |
| `rowHeight`         | `44`                  | Row height px (a dense list uses `35`)                               |
| `fontSize`          | `12`                  | Drives cells, header labels and footer (dense: `11`)                 |
| `Actions`           | —                     | Component for the auto-appended Action column                        |
| `fn`                | —                     | Passed straight through to `Actions` as its `fn` prop                |
| `actionWidth`       | `110`                 | Action column min width px                                           |
| `userList`          | —                     | Forwarded onto the table instance → readable in every `Cell`         |
| `sortable`          | `true`                | Master switch for sorting                                            |
| `searchable`        | `true`                | Master switch for the per-column search boxes                        |
| `loading`           | `false`               | Spinner + `loadingText` instead of the body                          |
| `dataFetched`       | `true`                | Gate for the empty state — **always wire both** (§6)                 |
| `emptyText`         | `'No records found'`  | Empty-state copy                                                     |
| `loadingText`       | `'Fetching records…'` | Loading-state copy                                                   |
| `footerLeft`        | `null`                | Static left-aligned footer label (prefer a column `Footer` — §7)     |
| `showFooter`        | auto                  | Override footer visibility                                           |
| `rowNavigation`     | `true`                | Keyboard row navigation (§6)                                         |
| `rowSnap`           | `false`               | Settle vertical scrolling on a row boundary once it stops (§6)       |
| `onRowSelect`       | —                     | `(rowData, index)` on every selection change                         |
| `onRowEnter`        | —                     | `(rowData, index)` on Enter — "open this row"                        |
| `selectedBg`        | `'#d3e5f8'`           | Selected-row highlight colour                                        |
| `rowIdKey`          | `'id'`                | Field `initialSelectedId` matches against                            |
| `initialSelectedId` | `null`                | Re-select + scroll to this row once, after the rows load             |
| `initialScrollLeft` | `0`                   | Restore horizontal scroll once, after the rows load                  |
| `rowStripColor`     | —                     | `(rowData) => color \| null` — coloured status bar column (§9)       |
| `rowStripTitle`     | —                     | `(rowData) => string` — hover tooltip on the strip cell              |
| `rowStyle`          | —                     | `(rowData) => ({ backgroundColor?, color? })` — full-row tint (§9)   |
| `stripWidth`        | `14`                  | Strip column width px                                                |
| `pinStorageKey`     | —                     | Persist the freeze boundary in `localStorage["ctPin:<key>"]` (§8)    |
| `className`         | —                     | Extra class on the root element                                      |
| `style`             | —                     | Extra inline styles merged onto the root element                     |

---

## 5. Imperative ref API

```jsx
const tableRef = useRef(null);
<FreezeTable ref={tableRef} … />
```

| Method             | Meaning                                                                    |
|--------------------|----------------------------------------------------------------------------|
| `focus()`          | Re-focus the table container — e.g. return focus to the selected row after a modal closes |
| `getScrollLeft()`  | Current horizontal offset — stash it before navigating away (§10)          |
| `selectRow(i)`     | Select + scroll to + focus row `i`                                          |
| `getPinCount()`    | Current **effective** (viewpoft-capped) freeze boundary; 0 = none          |
| `getMaxPinCount()` | Largest boundary the current viewport allows                               |
| `setPinCount(n)`   | Set the left freeze boundary (persisted when `pinStorageKey` is set)       |
| `getRightPinCount()` | Current **effective** right-hand boundary (0 = none)                      |
| `getMaxRightPinCount()` | Largest right-hand boundary the current viewport allows                |
| `setRightPinCount(n)` | Freeze the **last** N caller columns against the right edge              |

`selectRow(0)` is the one you reach for on a list that **re-fetches on a Search click**:
the table is already mounted, so the mount-time focus effect will not fire again and
focus would otherwise stay on the Search button, leaving the arrow keys dead until the
user clicks the table.

---

## 6. Keyboard navigation and body states

- The first render selects and highlights row 0 and **focuses the table**, so the arrows
  work immediately.
- **↑ / ↓** move the selection (auto-scrolling it into view), **Home / End** jump to the
  first / last row, **click** selects, **Enter** fires `onRowEnter`.
- Typing inside an `INPUT` / `TEXTAREA` / `SELECT` is never hijacked, so the per-column
  search boxes behave normally.
- The selection highlight is painted **imperatively**: rows are a `React.memo` that reads
  the selected index from a ref, and an effect updates only the affected DOM nodes. Without
  this, every keypress re-rendered every visible row — visibly laggy on icon-heavy lists.
- Selection is **index-based**: after a sort the highlight stays at the same *position*
  (a different logical row). Track ids yourself via `onRowSelect` if you need otherwise.
- Turn the whole thing off with `rowNavigation={false}`.

### Row-boundary scroll snapping (`rowSnap`, off by default)

Because `ft-wrap` is the single scrollport and the header is `sticky` inside it, rows
scroll *under* the header, so a freely-scrolled list leaves a partial row along the
header's bottom edge. `rowSnap` settles the scroll on a row boundary instead, the way a
spreadsheet does, so the topmost row is always whole.

**It is off by default**, because snapping and continuous scrolling genuinely trade
against each other: every wheel notch gets re-settled onto a row, and that reads as the
list catching and stuttering rather than gliding. Free scrolling feels better to most
people than a guaranteed whole top row; turn it on if your screen is dense enough for
the partial row to matter.

When enabled it is CSS — `scroll-snap-type: y proximity` plus `scroll-snap-align: start`
on each row, with `scroll-padding-top` set to the measured header height so a snapped row
lands just *below* the header rather than at the hidden top of the scrollport. Snapping
is suspended while the wheel is turning and restored ~160 ms after it stops, so the
scroll glides and settles once at the end instead of catching on every notch. Dragging a
scrollbar thumb suspends it too. The horizontal axis is never snapped.

`proximity`, not `mandatory`: rows are windowed, so snap targets appear and disappear as
you scroll, and mandatory snapping fights both that and programmatic scrolls.

**Body states**, in order: `loading` → spinner; `rows.length === 0 && dataFetched` → the
soft empty state; otherwise the list.

> **Gotcha:** `dataFetched` defaults to `true` and `loading` to `false`, so passing
> neither flashes "No records found" before the first fetch ever returns. Wire both from
> your own fetch flag:
> ```jsx
> <FreezeTable loading={!fetched} dataFetched={fetched} … />
> ```

---

## 7. Footer totals

Any column can define `Footer` (string, node, or a function). A footer **function**
receives the table instance, so `info.rows` are the **filtered** rows — totals and counts
update live as the user types in a column search box:

```js
Footer: (info) => `Voucher Count : ${info.rows.length}`

Footer: (info) => info.rows
  .reduce((s, r) => s + Number(r.values.debit || 0), 0)
  .toLocaleString('en-IN', { minimumFractionDigits: 2 })
```

Use `align: 'right'` on amount columns so the total lines up under the values.

`footerLeft` renders a single left-aligned label, but it is a static overlay **outside**
react-table — it cannot see the filtered rows. For a live record count, use a `Footer`
function on the first data column instead.

The footer appears automatically when any column has a `Footer` or `footerLeft` is set;
override with `showFooter`.

---

## 8. Frozen (pinned) columns

Columns freeze against **either edge**, and each side is described by a single number:

| Side | Column config | The count | Rides along |
|---|---|---|---|
| Left  | `pinned: true` / `pinned: 'left'` | `pinCount` — how many **leading** columns | the status strip |
| Right | `pinned: 'right'`                 | `rightPinCount` — how many **trailing** columns | the Action column |

Freezing only makes sense as a run against its own edge — a frozen column in the middle
would have its neighbours scroll out from under it — so only a **leading** run counts on
the left and only a **trailing** run on the right. A flag after the first unflagged
column (or, on the right, before the last one) is ignored.

- The auto-appended columns join the block on their own side: the status strip freezes
  left whenever `pinCount > 0`, the Action column freezes right whenever
  `rightPinCount > 0`. Either would otherwise be stranded outside its own block.
- The user changes the boundaries at runtime through `setPinCount(n)` and
  `setRightPinCount(n)` on the ref (0 = no freezing on that side). With `pinStorageKey`
  set, both choices persist — `localStorage["ctPin:<key>"]` and `["ctPinR:<key>"]` — and
  **beat the config flags** on the next mount.
- Each boundary column shows a small blue pin in its header: the last frozen column on
  the left, the first on the right. That is the only indicator on purpose — an icon on
  every frozen column ate header width and truncated the labels.
- The left block casts a shadow to its right once the table is scrolled; the right block
  casts one to its left until the scroll reaches the end.

**Viewport cap.** The frozen blocks are hard-capped so at least 250px of viewport is
always left for the scrolling columns (`getMaxPinCount()` / `getMaxRightPinCount()`). The
right block is measured first and the left one funded from what remains, so the two caps
cannot both claim the same viewport. A stored-but-too-large boundary is clamped at
render, so a persisted over-wide choice self-corrects. Freezing wider than the viewport
would leave no room to actually read the scrolling columns.

### The "Pin Columns" menu is yours to render

The component deliberately renders no picker. Put a dropdown next to your other toolbar
buttons listing `No pin` plus every column ("pin up to here" semantics), read
`getPinCount()` when the menu opens, and disable entries past `getMaxPinCount()`. The
right-hand block works the same way through `getRightPinCount()` / `setRightPinCount()`:

```jsx
const openPinMenu = () => {
  setCurrent(tableRef.current.getPinCount());
  setMax(tableRef.current.getMaxPinCount());
  setOpen(true);
};

const pickPin = (n) => {
  tableRef.current.setPinCount(n);
  tableRef.current.focus();   // hand the arrow keys back to the rows
  setOpen(false);
};
```

If your list also has single-letter keyboard shortcuts, include the menu-open state in
their guard so they do not fire while the menu is up.

### How the freeze works

Plain CSS `position: sticky` on the header, body and footer cells of every frozen
column — `left: <total width of the frozen columns before it>` for the left block, and
the mirror image, `right: <total width of the frozen columns beyond it>`, for the right. **Nothing runs in JS per
scroll frame** — that is the entire point. An earlier design counter-translated every
frozen cell from the scroll handler, and because JS repositions them a frame *after* the
compositor has already scrolled the rest, the frozen block visibly shook during
horizontal scroll.

Sticky only works because `ft-wrap` is the single scrollport for both axes — which is why
the rows are windowed by hand rather than by a virtualization library whose own
`overflow` container would become the sticky scrollport for the body cells and break the
freeze.

Frozen body cells use `background: inherit`, so they track the row's selection / hover /
status background with no extra bookkeeping. The last frozen column gets a right-hand
shadow once the table is scrolled.

---

## 9. Per-row status colouring

Two independent, optional props for lists where a row carries a state (cancelled, failed
to post, …). Both take the raw row object and should be pure functions.

**`rowStripColor(rowData) => color | null`** prepends a narrow column drawing a coloured
bar at the left edge of the row. Return a falsy value for rows with no state. It is a
*real* column, so it stays aligned with the header and scrolls with the row.

> **Pick a saturated colour.** A pale tint that reads fine across a whole row
> (`#ffe6e6`) is invisible in a 4px bar.

**`rowStyle(rowData) => ({ backgroundColor?, color? })`** tints the whole row. A returned
`backgroundColor` **wins over the selection and hover highlights** — a status colour must
never be masked by the blue selected-row background (row 0 is auto-selected on mount,
which would otherwise hide its status the instant the list loads). Rows returning no
`backgroundColor` highlight as normal.

Prefer the strip when the tint would be loud (a whole orange row is hard to read); use
both only when the row colour is itself the requirement.

```jsx
const STRIP = { Cancelled: '#e03e3e', Pending: '#e8912d', Posted: '#2aa76a' };

<FreezeTable
  rowStripColor={(r) => STRIP[r.status] || null}
  rowStripTitle={(r) => r.status}
  rowStyle={(r) => (r.status === 'Cancelled' ? { color: '#a11' } : undefined)}
/>
```

---

## 10. Restoring position on re-entry

When the list unmounts on navigation (list → edit → back), both scroll axes reset. Restore
them with the pair below — each is applied **once**, after the rows load:

- `initialSelectedId` (+ `rowIdKey`) → vertical scroll + re-highlights the row
- `initialScrollLeft` → horizontal scroll (without it a wide table always snaps back to
  column 1)

Stash both in **module-scope variables** — they survive the unmount:

```jsx
let lastSelectedId = null;
let lastScrollLeft = 0;

export default function List() {
  const tableRef = useRef(null);

  const goToEdit = (row) => {
    lastSelectedId = row.id;
    lastScrollLeft = tableRef.current ? tableRef.current.getScrollLeft() : 0;
    navigateToEdit(row.id);
  };

  return (
    <FreezeTable
      ref={tableRef}
      initialSelectedId={lastSelectedId}
      initialScrollLeft={lastScrollLeft}
      onRowSelect={(row) => { lastSelectedId = row.id; }}
      onRowEnter={goToEdit}
    />
  );
}
```

Both restore effects intentionally have **no dependency array** — they retry on each
render until the rows and the measured body height exist, then latch via a ref.

---

## 11. Styling hooks

There is **no stylesheet to import**. Every visual is an inline style; the one injected
`<style>` tag carries only what inline styles cannot express (keyframes, `:focus`,
`::placeholder`, the frozen-column shadow selector).

The class names exist as stable hooks for the component's own imperative repaint and for
your tests:

| Class / attribute      | On                             | Used for                                |
|------------------------|--------------------------------|-----------------------------------------|
| `.ft-root`             | root element                   | positioning context for the overlay bars |
| `.ft-wrap`             | scroller                       | scroll owner, focus target              |
| `.ft-track-v` / `-h`   | overlay scrollbar tracks       | restyle the bars                        |
| `.ft-thumb`            | scrollbar thumb                | restyle the bars                        |
| `.ft-head` / `.ft-th`  | header row / cell              | —                                       |
| `.ft-th-label`         | header label row               | sort toggle click area                  |
| `.ft-th-filter`        | search-box wrapper             | —                                       |
| `.ft-row` / `.ft-td`   | row / body cell                | selection repaint                       |
| `.ft-foot` / `.ft-tf`  | footer row / cell              | —                                       |
| `data-ct-index`        | `.ft-row`                      | row index (selection repaint)           |
| `data-ct-bg`           | `.ft-row`                      | the row's base background               |
| `data-ct-custom`       | `.ft-row`                      | `'1'` when `rowStyle` returned a bg      |
| `data-ct-pin`          | header / body / footer cell    | `'1'` on frozen cells                   |
| `data-ct-pin-last`     | same                           | `'1'` on the boundary column            |

Every element also carries the legacy `ct-*` twin of its class (`ft-row ct-row`), so a
project migrating off a local copy keeps any existing selectors working.

Key values, if you want to re-theme by forking:

- header: white, `borderBottom: 1px solid #e3e8ee`, bold labels
- row: white, `borderBottom: 1px solid #edf0f3`; hover `#eef4fb`; selected `#d3e5f8`
- footer: `#f4f5f7`, `borderTop: 1px solid #e3e8ee`, bold
- cell padding `0 12px`, header `7px 12px 9px`, footer `8px 12px`

---

## 12. Gotchas

1. **Memoize `data`.** react-table's `autoResetSortBy` / `autoResetFilters` are already
   disabled inside the component (otherwise every `Object.values(byId)` recreation
   silently cleared the sort, making a header click appear to do nothing), but an
   un-memoized array still causes needless row churn.
2. **Memoize `columns`** — and when a `Cell` needs a callback, export the columns as a
   factory: `const columns = useMemo(() => makeColumns(onOpen), [])`.
3. **Wire `loading` and `dataFetched` together**, or the empty state flashes before the
   first fetch.
4. **Row menus must escape the row's `overflow: hidden`.** Use a portal-based popup, not
   an inline dropdown, or the menu will be clipped by its row.
5. **Sorting is three-state** — ascending → descending → unsorted.
6. `Header` is best kept a plain string: a "pin up to here" menu in your toolbar has to
   render it as a label.
7. Custom `Filter` dropdowns that render their menu in a portal need a real CSS rule for
   the menu font size — inline styles cannot reach portalled nodes.

---

## 13. Demo, build, compatibility

```bash
npm install
npm run build     # dist/freeze-table.esm.js + dist/freeze-table.cjs.js
npm run smoke     # server-render the built bundle and assert its shape
npm run demo      # bundles example/ — then open example/index.html in a browser
```

The demo renders 2,000 rows × 18 columns with frozen columns, footer totals, status
strips and the loading / empty states, and bundles React in, so `example/index.html`
opens straight from the filesystem with no server.

**The only peer dependency is `react >= 16.8`** (hooks + `forwardRef`). React 16, 17, 18
and 19 all work — the component is function-based and uses no legacy lifecycle APIs.

**`react-table` v7 is bundled into the build** rather than required as a peer. It only
ships CommonJS/UMD builds, and its peer range — frozen, since the v7 line is archived —
stops at React 18, so on a React 19 app npm declines to install it and the consumer's
build fails with `Can't resolve 'react-table'`. Bundling makes `npm i freeze-table`
sufficient on every React version. If your app also uses react-table directly, that is
fine: v7 is a set of plain hooks with no shared context, so a second copy cannot
conflict.

> react-table **v8** (`@tanstack/react-table`) is a completely different API and is not
> involved here.

Server-side rendering is safe: layout effects degrade to `useEffect` on the server and
the style tag is only injected in the browser. The body renders empty until the client
measures it, which is the correct behaviour for a virtualized list.

## License

MIT.

This package bundles [react-table](https://github.com/TanStack/table/tree/v7) v7,
MIT License, Copyright (c) 2016 Tanner Linsley. Its notice is reproduced in `LICENSE`
and in the banner of every built file.
