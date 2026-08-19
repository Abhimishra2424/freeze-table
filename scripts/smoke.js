/* Smoke test: render the built bundle with react-dom/server and assert the shape of
   the output. No jsdom, so the body is empty (rows need a measured height) — this
   checks the imports, the react-table wiring, the header, the sticky footer and the
   pinned-column offsets. Run with `npm run smoke` after `npm run build`. */
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { FreezeTable, CommonTable, ELLIPSIS } = require('../dist/freeze-table.cjs.js');

// React reports invalid style values, key warnings and the like through console.error
// during render. They are collected rather than printed so the run can ASSERT there
// were none: an `undefined` slipping into a column def resolves to a NaN width and only
// ever showed up as one of these lines. (0.7.0 shipped exactly that on the Action
// column.)
const consoleError = console.error.bind(console);
const reactWarnings = [];
console.error = (...args) => reactWarnings.push(args.map(String).join(' ').split('\n')[0]);

const fail = (msg) => {
  consoleError('FAIL: ' + msg);
  process.exitCode = 1;
};
const ok = (msg) => console.log('ok  - ' + msg);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

const columns = [
  { Header: '#', id: 'sl', width: 45, minWidth: 45, align: 'right', pinned: true, disableFilters: true, disableSortBy: true, Cell: ({ row, rows }) => rows.indexOf(row) + 1 },
  { Header: 'Name', accessor: 'name', width: 200, minWidth: 200, pinned: true, Footer: (info) => 'Count : ' + info.rows.length },
  { Header: 'City', accessor: 'city', width: 160, minWidth: 160 },
  { Header: 'Amount', accessor: 'amount', width: 120, minWidth: 120, align: 'right', pinned: 'right', Footer: (info) => info.rows.reduce((s, r) => s + Number(r.values.amount || 0), 0).toFixed(2) },
];

const data = [
  { id: 'a', name: 'Ramesh Kumar', city: 'Patna', amount: 1200 },
  { id: 'b', name: 'Sunita Devi', city: 'Ranchi', amount: 800.5 },
  { id: 'c', name: 'Imran Ali', city: 'Kolkata', amount: 45 },
];

const Actions = ({ object }) => React.createElement('span', null, 'edit:' + object.id);

const html = renderToStaticMarkup(
  React.createElement(FreezeTable, {
    columns,
    data,
    Actions,
    height: 400,
    rowStripColor: (r) => (r.amount < 100 ? '#e03e3e' : null),
    rowStripTitle: () => 'Low value',
    pinStorageKey: 'smoke',
  })
);

assert(typeof FreezeTable === 'function' || typeof FreezeTable === 'object', 'FreezeTable is exported');
assert(CommonTable === FreezeTable, 'CommonTable alias points at FreezeTable');
assert(ELLIPSIS && ELLIPSIS.textOverflow === 'ellipsis', 'ELLIPSIS style is exported');
assert(html.includes('ft-wrap'), 'outer scroller renders');
assert(html.includes('ct-wrap'), 'legacy ct-* class kept for drop-in compat');
assert(html.includes('>Name<') && html.includes('>City<') && html.includes('>Amount<'), 'all headers render');
assert(html.includes('>Action<'), 'Action column is auto-appended');
assert((html.match(/ft-th /g) || []).length === 6, 'header cell count = 4 columns + strip + action');
assert(html.includes('position:sticky;top:0'), 'header is sticky');
assert(html.includes('bottom:0'), 'footer is sticky');
assert(html.includes('Count : 3'), 'footer function sees the rows');
assert(html.includes('2045.50'), 'footer total is computed from filtered rows');
// Pinned run = strip (14px) + '#' (45px) + Name (200px): left offsets 0, 14, 59.
assert(html.includes('left:14px'), 'second pinned column gets its cumulative sticky offset');
assert(html.includes('left:59px'), 'third pinned column gets its cumulative sticky offset');
assert((html.match(/data-ct-pin="1"/g) || []).length >= 3, 'pinned columns are flagged');
assert(html.includes('data-ct-pin-last="1"'), 'freeze boundary is marked');
// Right block = Amount (120px) + the auto-joining Action column (110px), so Amount sits
// 110px in from the right edge and Action sits flush against it.
assert(html.includes('right:110px'), 'right-pinned column is offset by the Action column width');
// React drops the unit for a zero-valued style, so this is `right:0`, not `right:0px`.
assert(/right:0[;"]/.test(html), 'the Action column freezes flush with the right edge');
assert(html.includes('data-ct-pin-right-first="1"'), 'right freeze boundary is marked');
assert(html.includes('<svg'), 'inline SVG icons render (no Semantic UI)');
assert(!/semantic/i.test(html), 'no semantic-ui markup in the output');

// Action column frozen on its own, with no data column pinned right.
const actionsOnly = renderToStaticMarkup(
  React.createElement(FreezeTable, {
    columns: columns.map((c) => ({ ...c, pinned: c.pinned === 'right' ? undefined : c.pinned })),
    data,
    Actions,
    pinActions: true,
  })
);
assert(/right:0[;"]/.test(actionsOnly), 'pinActions freezes the Action column on its own');
assert(actionsOnly.includes('data-ct-pin-right-first="1"'), 'the Action column becomes the right boundary');
assert(!actionsOnly.includes('right:110px'), 'no data column is dragged into the right block');

// ----- Column resizing -----
// One grip per header EXCEPT the status strip: 4 caller columns + the Action column.
assert((html.match(/ft-resizer/g) || []).length === 5, 'every column but the status strip gets a resize grip');
const noResize = renderToStaticMarkup(React.createElement(FreezeTable, { columns, data, Actions, resizable: false }));
assert(!noResize.includes('ft-resizer'), 'resizable:false drops the grips');
const someResize = renderToStaticMarkup(
  React.createElement(FreezeTable, {
    columns: columns.map((c) => (c.accessor === 'city' ? { ...c, disableResizing: true } : c)),
    data,
    Actions,
  })
);
assert((someResize.match(/ft-resizer/g) || []).length === 4, 'disableResizing drops that column\'s grip');

// ----- Column order -----
// The Action column takes part in the ordering like any other column; `actionIndex`
// says where it starts out (the user drags it from there).
const actionFirst = renderToStaticMarkup(
  React.createElement(FreezeTable, { columns, data, Actions, actionIndex: 'first' })
);
assert(
  actionFirst.indexOf('>Action<') < actionFirst.indexOf('>Name<'),
  'actionIndex:"first" renders the Action column ahead of the caller columns'
);
assert(html.indexOf('>Action<') > html.indexOf('>Amount<'), 'the default position is still last');
assert(html.includes('data-ct-col="sl"'), 'headers carry their column id for the reorder drag');
// Action column dragged to the front of a LEFT-frozen run: it freezes with that run
// instead of the right-hand one. Left block = strip (14px) + Action (110px) + '#' (45px)
// + Name (200px), so the offsets run 0, 14, 124, 169.
const actionPinnedLeft = renderToStaticMarkup(
  React.createElement(FreezeTable, {
    columns,
    data,
    Actions,
    actionIndex: 0,
    rowStripColor: () => '#e03e3e',
  })
);
assert(actionPinnedLeft.includes('left:14px'), 'the Action column takes the strip-width offset');
assert(actionPinnedLeft.includes('left:124px') && actionPinnedLeft.includes('left:169px'),
  'a left-frozen Action column widens the left block and shifts the columns after it');
assert(/right:0[;"]/.test(actionPinnedLeft), 'the right-pinned data column now sits flush right');
assert(!actionPinnedLeft.includes('right:110px'), 'the Action column no longer rides with the right block');
// In the middle of the scrolling columns it cannot freeze at all — a frozen run has to
// stay contiguous — so pinActions is ignored there.
const actionMiddle = renderToStaticMarkup(
  React.createElement(FreezeTable, {
    columns: columns.map((c) => ({ ...c, pinned: c.pinned === 'right' ? undefined : c.pinned })),
    data,
    Actions,
    actionIndex: 2,
    pinActions: true,
  })
);
assert(actionMiddle.indexOf('>Action<') > actionMiddle.indexOf('>Name<')
  && actionMiddle.indexOf('>Action<') < actionMiddle.indexOf('>City<'),
  'actionIndex places the Action column between two caller columns');
assert(!actionMiddle.includes('data-ct-pin-right-first'), 'pinActions is ignored in the middle of the table');

// ----- Column visibility -----
// Hiding the pinned 'Name' column leaves the pinned run as strip (14px) + '#' (45px),
// so the third offset (59px) must be gone and 'City' must slide into its place.
const hidden = renderToStaticMarkup(
  React.createElement(FreezeTable, {
    columns: columns.map((c) => (c.accessor === 'name' ? { ...c, hidden: true } : c)),
    data,
    Actions,
    rowStripColor: () => '#e03e3e',
  })
);
assert(!hidden.includes('>Name<'), 'a column with hidden:true is not rendered');
assert(hidden.includes('>City<'), 'the remaining columns still render');
assert((hidden.match(/ft-th /g) || []).length === 5, 'the hidden column is gone from the header row');
assert(hidden.includes('left:14px') && !hidden.includes('left:59px'), 'hiding a pinned column re-flows the freeze offsets');
assert(!hidden.includes('Count : 3'), "the hidden column's footer goes with it");
const locked = renderToStaticMarkup(
  React.createElement(FreezeTable, {
    columns: columns.map((c) => (c.accessor === 'name' ? { ...c, hidden: true, hideable: false } : c)),
    data,
  })
);
assert(locked.includes('>Name<'), 'hideable:false keeps a column visible even if hidden:true');
const allHidden = renderToStaticMarkup(
  React.createElement(FreezeTable, { columns: columns.map((c) => ({ ...c, hidden: true })), data })
);
assert(allHidden.includes('>Name<') && allHidden.includes('>City<'), 'hiding every column falls back to showing them all');

const empty = renderToStaticMarkup(React.createElement(FreezeTable, { columns, data: [], dataFetched: true }));
assert(empty.includes('No records found'), 'empty state renders');
const busy = renderToStaticMarkup(React.createElement(FreezeTable, { columns, data: [], loading: true }));
assert(busy.includes('ft-spinner') && busy.includes('Fetching records'), 'loading state renders');

console.error = consoleError;
assert(
  reactWarnings.length === 0,
  'React logged no warnings while rendering' + (reactWarnings.length ? ':\n      ' + reactWarnings.join('\n      ') : '')
);

if (process.exitCode) console.error('\nsmoke test FAILED');
else console.log('\nall smoke checks passed');
