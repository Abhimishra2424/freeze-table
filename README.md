# freeze-table

A virtualized React list table for **wide, dense, data-entry style screens** — the kind
with twenty columns, thousands of rows, per-column search boxes, frozen leading columns
and a totals row pinned to the bottom.

![freeze-table — 2,000 rows, 18 columns, three columns frozen left and one plus the Action column frozen right](https://raw.githubusercontent.com/Abhimishra2424/freeze-table/main/public/FreezeTable.png)

Built on [`react-table`](https://github.com/TanStack/table/tree/v7) **v7**, which is bundled
in. No peer install, no UI library, no CSS file to import, no theme to configure — every visual is an inline style and the
handful of glyphs it needs (sort arrows, pin marker, spinner, empty-state icon) are inline
SVG.

```bash
npm i freeze-table
```

That is the whole install. `react-table` v7 is bundled in (see
[Compatibility](#14-demo-build-compatibility)), so React is the only peer dependency.

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
- **The user's layout is theirs.** Freeze boundary, column widths, column order and
  hidden columns are all draggable / toggleable at runtime and survive a reload (one
  `pinStorageKey`). Even the Action column can be dragged out of the right-hand end.
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
9. [Column resizing, hiding and reordering](#9-column-resizing-hiding-and-reordering)
10. [Per-row status colouring](#10-per-row-status-colouring)
11. [Restoring position on re-entry](#11-restoring-position-on-re-entry)
12. [Styling hooks](#12-styling-hooks)
13. [Gotchas](#13-gotchas)
14. [Demo, build, compatibility](#14-demo-build-compatibility)

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

Both `columns` and `data` should be memoized — see [Gotchas](#13-gotchas).

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
  hidden,           // DEFAULT visibility: true = start hidden — see §9
  hideable,         // false = can never be hidden (a key column)
  disableResizing,  // no drag-to-resize grip on this column
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

A **dragged** width (§9) overwrites `width`, `minWidth` **and** `maxWidth` with the same
number, precisely so that expression collapses to it — the config's floor and ceiling are
the default, and an explicit drag outranks both.

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
- **`__actions`** — added when `Actions` is given: the Action column
  (`minWidth: actionWidth`, default 110). Renders
  `<Actions object={row.original} fn={fn} />` — note there is **no row index**. It starts
  at the right-hand end (`actionIndex`), but it is a real column: the user can drag it
  anywhere, and it freezes with whichever frozen run it ends up inside (§8, §9).

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
| `pinActions`        | `false`               | Freeze just the Action column against the edge it sits at (§8)       |
| `actionIndex`       | `'last'`              | Where the Action column **starts** — `'first'`, `'last'` or an index (§9) |
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
| `rowStripColor`     | —                     | `(rowData) => color \| null` — coloured status bar column (§10)       |
| `rowStripTitle`     | —                     | `(rowData) => string` — hover tooltip on the strip cell              |
| `rowStyle`          | —                     | `(rowData) => ({ backgroundColor?, color? })` — full-row tint (§10)   |
| `stripWidth`        | `14`                  | Strip column width px                                                |
| `pinStorageKey`     | —                     | Persist the freeze boundaries, column widths, hidden columns and column order in `localStorage` (§8, §9) |
| `resizable`         | `true`                | Drag-to-resize grip on every header's right edge (§9)                |
| `reorderable`       | `true`                | Drag a header sideways to move that column (§9)                      |
| `minColumnWidth`    | `48`                  | Floor for a drag-resized column, px (§9)                             |
| `onColumnResize`    | —                     | `(id, width, widths)` — `width` is `null` on a reset (§9)            |
| `onColumnVisibilityChange` | —              | `(hiddenIds)` whenever a column is hidden or shown (§9)              |
| `onColumnOrderChange` | —                   | `(order)` whenever the column order changes (§9)                     |
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
| `getScrollLeft()`  | Current horizontal offset — stash it before navigating away (§11)          |
| `selectRow(i)`     | Select + scroll to + focus row `i`                                          |
| `getLeftPinCount()` | Current **effective** (viewport-capped) left boundary; 0 = none            |
| `getMaxLeftPinCount()` | Largest left boundary the viewport allows — disable menu entries beyond it |
| `setLeftPinCount(n)` | Freeze the **first** N caller columns against the left edge               |
| `getRightPinCount()` | Current **effective** right boundary; 0 = none                            |
| `getMaxRightPinCount()` | Largest right boundary the viewport allows                             |
| `setRightPinCount(n)` | Freeze the **last** N caller columns against the right edge              |
| `getColumnWidths()` | User-resized widths only, as an `id -> px` map (§9)                        |
| `setColumnWidth(id, px)` | Set one column's width (clamped to `minColumnWidth`)                  |
| `resetColumnWidths(id?)` | Clear one override, or **all** of them when called with no argument   |
| `getHiddenColumns()` | Ids of the currently hidden columns                                      |
| `setHiddenColumns(ids)` | Replace the hidden set (`hideable: false` ids are ignored)             |
| `toggleColumn(id, visible?)` | Hide/show one column — omit `visible` to flip it                 |
| `showAllColumns()` | Un-hide everything                                                         |
| `getColumnOrder()` | The current order as a flat list of ids — display order, hidden columns included, `'__actions'` among them (§9) |
| `setColumnOrder(ids)` | Replace the order; ids you leave out are slotted back in beside their configured neighbours. `null` restores the config order |
| `moveColumn(id, i)` | Move one column to position `i` of `getColumnOrder()`                     |
| `resetColumnOrder()` | Back to the order of your `columns` array                                |
| `getColumnList()`  | `[{ id, index, position, header, hidden, hideable, resizable, movable, width }]` — everything a column menu needs, in **display order**, Action column included |

Both boundaries persist when `pinStorageKey` is set. `getPinCount` / `getMaxPinCount` /
`setPinCount` are the pre-0.6 names for the three left-hand methods — they still work,
but nothing in those names said which edge they meant, hence the rename.

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

Both counts speak in terms of the columns **currently on screen**: a hidden column (§9)
is not counted, so "first 3" with the second column hidden freezes the 1st, 3rd and 4th
of your `columns` array.

- The status strip freezes left whenever `pinCount > 0` — it sits left of everything and
  would otherwise be stranded outside the block.
- The Action column freezes with **whichever run it lies inside**. Left at its default
  position that means the right-hand one, exactly as before; drag it (§9) in front of a
  left-frozen run and it freezes there instead; park it in the middle of the scrolling
  columns and it cannot freeze at all, because a frozen run has to stay contiguous.
- **To freeze only the row's actions**, pass `pinActions` and leave `rightPinCount` at
  0. Keeping the row controls reachable without scrolling back is the commonest reason
  to want anything frozen on the right, and it should not force a data column along with
  it (this too follows the column wherever it sits, and is ignored in the middle):

  ```jsx
  <FreezeTable columns={columns} data={rows} Actions={RowActions} pinActions />
  ```
- The user changes the boundaries at runtime through `setLeftPinCount(n)` and
  `setRightPinCount(n)` on the ref (0 = no freezing on that side). With `pinStorageKey`
  set, both choices persist — `localStorage["ctPin:<key>"]` and `["ctPinR:<key>"]` — and
  **beat the config flags** on the next mount.
- Each boundary column shows a small blue pin in its header: the last frozen column on
  the left, the first on the right. That is the only indicator on purpose — an icon on
  every frozen column ate header width and truncated the labels.
- The left block casts a shadow to its right once the table is scrolled; the right block
  casts one to its left until the scroll reaches the end.

**Viewport cap.** The frozen blocks are hard-capped so at least 250px of viewport is
always left for the scrolling columns (`getMaxLeftPinCount()` / `getMaxRightPinCount()`). The
right block is measured first and the left one funded from what remains, so the two caps
cannot both claim the same viewport. A stored-but-too-large boundary is clamped at
render, so a persisted over-wide choice self-corrects. Freezing wider than the viewport
would leave no room to actually read the scrolling columns.

### The "Pin Columns" menu is yours to render

The component deliberately renders no picker. Put a dropdown next to your other toolbar
buttons listing `No pin` plus every column ("pin up to here" semantics), read
`getLeftPinCount()` when the menu opens, and disable entries past `getMaxLeftPinCount()`.
The right-hand block works the same way through `getRightPinCount()` /
`setRightPinCount()`:

```jsx
const openPinMenu = () => {
  setCurrent(tableRef.current.getLeftPinCount());
  setMax(tableRef.current.getMaxLeftPinCount());
  setOpen(true);
};

const pickPin = (n) => {
  tableRef.current.setLeftPinCount(n);
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

## 9. Column resizing, hiding and reordering

Three more per-user layout choices, built the same way as the freeze boundary (§8): the
column config carries the **default**, the user's choice lives in the table's own state,
and the caller drives it through the ref. All three persist under `pinStorageKey`.

### Resizing

Every header except the status strip carries a **drag grip** on its right edge — invisible
until you hover it, then a thin blue line. Drag it to resize; **double-click** it to drop
the override and go back to the configured width.

```jsx
<FreezeTable
  columns={columns}
  data={rows}
  resizable            // default true — pass false to switch every grip off
  minColumnWidth={48}  // the drag cannot go below this
  pinStorageKey="sales-invoice-list"          // widths survive a reload
  onColumnResize={(id, width) => log(id, width)}
/>
```

- Per column: `disableResizing: true` drops that column's grip.
- The **Action column** is resizable too — a dragged width replaces the `actionWidth` prop
  for that list.
- The drag paints a **guide line** and commits the width once, on release. It deliberately
  does not resize live: the column defs are what the memoized rows hang off, so a per-frame
  width would re-render every visible row sixty times a second. This is also what Excel and
  Sheets do.
- A resized frozen column widens the frozen block, so the pin cap (§8) may quietly reduce
  the effective freeze count — the frozen block never gets to eat the viewport.

### Hiding

```jsx
// column config: the DEFAULT only
{ Header: 'Engine No', accessor: 'engine', width: 140, minWidth: 140, hidden: true }
{ Header: 'Invoice No', accessor: 'invoice', width: 150, minWidth: 150, hideable: false }
```

```jsx
tableRef.current.toggleColumn('engine');        // flip one column
tableRef.current.toggleColumn('engine', true);  // or say which way
tableRef.current.setHiddenColumns(['engine', 'vin']);
tableRef.current.showAllColumns();
```

The **menu is yours to render**, exactly like the pin menu. `getColumnList()` gives you
one entry per caller column — `{ id, index, header, hidden, hideable, resizable, width }`
— so the menu never has to re-derive any of it from your column config:

```jsx
{tableRef.current?.getColumnList().map((c) => (
  <label key={c.id}>
    <input
      type="checkbox"
      checked={!c.hidden}
      disabled={!c.hideable}
      onChange={() => {
        tableRef.current.toggleColumn(c.id);
        forceUpdate();          // the table owns the state; re-render your menu
      }}
    />
    {c.header || c.id}
  </label>
))}
```

Things worth knowing:

- A hidden column is **gone from the layout**, not merely invisible: the freeze counts and
  the sticky offsets are computed from the visible columns only. Pin "first 3" with the
  second column hidden and you freeze the 1st, 3rd and 4th.
- Its **filter and sort stop applying** while it is hidden, and come back when it is shown
  again (react-table keeps the state, and skips sort/filter entries whose column is not
  currently mounted).
- Its **footer total goes with it** — hide the Amount column and the footer loses that cell.
- A column needs an `id` (or a string `accessor`) to be hidden or resized — a column with
  only an accessor **function** cannot be addressed. react-table demands an `id` for those
  columns anyway.
- `hideable: false` locks a column visible even against `hidden: true`, and hiding *every*
  column falls back to showing them all — a blank table has no header to un-hide from.

### Reordering

**Drag a header sideways** to move that column. The drag arms only after a few pixels, so
an ordinary click still sorts; while it is armed the header dims and a blue line shows
where the column will land, and the order is committed on release. Dragging near either
edge of the table auto-scrolls, so a column can be carried across a table far wider than
the screen.

The **Action column moves like any other column** — `actionIndex` only says where it
starts:

```jsx
<FreezeTable
  columns={columns}
  data={rows}
  Actions={RowActions}
  actionIndex="first"      // 'last' (default) | 'first' | an index into `columns`
  reorderable              // default true — pass false to lock every header
  pinStorageKey="sales-invoice-list"
  onColumnOrderChange={(order) => log(order)}
/>
```

- Per column: `disableReordering: true` locks that one in place.
- The status strip is never movable — it belongs to the row, not to your columns.
- Reordering is a **mouse gesture**. On a touch screen, dragging a header sideways is how
  the table is panned, and hijacking it would leave a wide table unscrollable.
- A moved column keeps its sort, its filter and its width; what changes is where it sits,
  which is also what the freeze counts and the sticky offsets are computed from. Drag a
  column into the frozen run and it is frozen.

Driving it from a menu instead — `getColumnList()` comes back in display order, with a
`position` (the index `moveColumn` takes) and a `movable` flag, and includes the Action
column:

```jsx
{tableRef.current?.getColumnList().map((c, i, list) => (
  <div key={c.id}>
    {c.header || c.id}
    <button disabled={!c.movable || i === 0}
            onClick={() => { tableRef.current.moveColumn(c.id, c.position - 1); forceUpdate(); }}>↑</button>
    <button disabled={!c.movable || i === list.length - 1}
            onClick={() => { tableRef.current.moveColumn(c.id, c.position + 1); forceUpdate(); }}>↓</button>
  </div>
))}
```

`getColumnOrder()` / `setColumnOrder(ids)` deal in the whole list at once, and
`resetColumnOrder()` goes back to your `columns` array. A stored order is **merged** with
the current config rather than trusted wholesale: ids the config no longer has are
dropped, and a column you have since added lands next to the neighbour you configured it
after — not dumped at the end as though the user had moved it there.

### What gets persisted

With `pinStorageKey="sales-invoice-list"`:

| Key                              | Holds                                    |
|----------------------------------|------------------------------------------|
| `ctPin:sales-invoice-list`       | left freeze count                        |
| `ctPinR:sales-invoice-list`      | right freeze count                       |
| `ctW:sales-invoice-list`         | `{"<columnId>": <px>}` — resized columns only |
| `ctHide:sales-invoice-list`      | `["<columnId>", …]` — hidden columns     |
| `ctOrd:sales-invoice-list`       | `["<columnId>", …]` — the column order, `"__actions"` included |

Without the key nothing is stored and every choice lasts until unmount.

---

## 10. Per-row status colouring

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

## 11. Restoring position on re-entry

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

## 12. Styling hooks

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
| `.ft-resizer`          | grip on the header's right edge | the hover line (§9)                    |
| `.ft-resize-guide`     | root element                   | the line that follows a resize drag      |
| `.ft-drop-line`        | root element                   | where a dragged column will land (§9)    |
| `.ft-th-dragging`      | `.ft-th` being dragged         | the dimmed header during a reorder       |
| `.ft-row` / `.ft-td`   | row / body cell                | selection repaint                       |
| `.ft-foot` / `.ft-tf`  | footer row / cell              | —                                       |
| `data-ct-col`          | `.ft-th`                       | the column's id (reorder drop targets)  |
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

## 13. Gotchas

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
6. `Header` is best kept a plain string: a "pin up to here" or column menu in your
   toolbar has to render it as a label.
7. **A header press is two gestures.** Click = sort, drag sideways = reorder, drag the
   right edge = resize. If you put an interactive control inside a `Header`, give it its
   own `onPointerDown` stopPropagation, or dragging it will move the column.
8. Custom `Filter` dropdowns that render their menu in a portal need a real CSS rule for
   the menu font size — inline styles cannot reach portalled nodes.

---

## 14. Demo, build, compatibility

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
