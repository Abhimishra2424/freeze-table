/* Smoke test: render the built bundle with react-dom/server and assert the shape of
   the output. No jsdom, so the body is empty (rows need a measured height) — this
   checks the imports, the react-table wiring, the header, the sticky footer and the
   pinned-column offsets. Run with `npm run smoke` after `npm run build`. */
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { FreezeTable, CommonTable, ELLIPSIS } = require('../dist/freeze-table.cjs.js');

const fail = (msg) => {
  console.error('FAIL: ' + msg);
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

const empty = renderToStaticMarkup(React.createElement(FreezeTable, { columns, data: [], dataFetched: true }));
assert(empty.includes('No records found'), 'empty state renders');
const busy = renderToStaticMarkup(React.createElement(FreezeTable, { columns, data: [], loading: true }));
assert(busy.includes('ft-spinner') && busy.includes('Fetching records'), 'loading state renders');

if (process.exitCode) console.error('\nsmoke test FAILED');
else console.log('\nall smoke checks passed');
