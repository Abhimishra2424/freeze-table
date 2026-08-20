/* Golden snapshots: server-render a spread of configurations from the BUILT bundle and
   compare the markup byte-for-byte against the files in scripts/__golden__.

   The smoke test asserts a few dozen individual strings; this asserts the whole output.
   It exists for REFACTORS: a change that is supposed to move code around without
   changing what the component renders must leave every one of these files untouched, and
   anything that does shift shows up as a diff instead of slipping through because no
   assertion happened to name it.

     node scripts/golden.js            compare (fails on any drift)
     node scripts/golden.js --update   rewrite the files from the current build

   Run `npm run build` first — like the smoke test, this loads dist/, not src/. A
   deliberate behaviour change means re-running with --update and reading the diff. */
const fs = require('fs');
const path = require('path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { FreezeTable } = require('../dist/freeze-table.cjs.js');

const UPDATE = process.argv.includes('--update');
const DIR = path.join(__dirname, '__golden__');

// React reports bad style values / key problems through console.error during render.
// A snapshot run that produces warnings is a failure even when the markup matches.
const consoleError = console.error.bind(console);
const warnings = [];
console.error = (...args) => warnings.push(args.map(String).join(' ').split('\n')[0]);

const el = React.createElement;

const columns = [
  { Header: '#', id: 'sl', width: 45, minWidth: 45, align: 'right', pinned: true, disableFilters: true, disableSortBy: true, Cell: ({ row, rows }) => rows.indexOf(row) + 1 },
  { Header: 'Name', accessor: 'name', width: 200, minWidth: 200, pinned: true, Footer: (info) => 'Count : ' + info.rows.length },
  { Header: 'City', accessor: 'city', width: 160, minWidth: 160 },
  { Header: 'Status', accessor: 'status', width: 120, minWidth: 120, align: 'center' },
  { Header: 'Amount', accessor: 'amount', width: 120, minWidth: 120, align: 'right', pinned: 'right', Footer: (info) => info.rows.reduce((s, r) => s + Number(r.values.amount || 0), 0).toFixed(2) },
];

const data = [
  { id: 'a', name: 'Ramesh Kumar', city: 'Patna', status: 'Posted', amount: 1200 },
  { id: 'b', name: 'Sunita Devi', city: 'Ranchi', status: 'Draft', amount: 800.5 },
  { id: 'c', name: 'Imran Ali', city: 'Kolkata', status: 'Cancelled', amount: 45 },
];

const Actions = ({ object, fn }) => el('span', null, (fn ? fn.label : 'edit') + ':' + object.id);
const without = (pinned) => columns.map((c) => (c.pinned === pinned ? { ...c, pinned: undefined } : c));
const patch = (accessor, extra) => columns.map((c) => (c.accessor === accessor ? { ...c, ...extra } : c));

// One entry per snapshot file. Keep the names stable — they are the file names.
const CASES = {
  // The full arrangement: both freeze blocks, the status strip, an Action column,
  // per-column footers and a filter row.
  'full': { columns, data, Actions, fn: { label: 'open' }, height: 400, rowStripColor: (r) => (r.amount < 100 ? '#e03e3e' : null), rowStripTitle: () => 'Low value', pinStorageKey: 'golden' },
  // Nothing frozen, nothing synthetic — the plainest table the component renders.
  'plain': { columns: columns.map((c) => ({ ...c, pinned: undefined, Footer: undefined })), data },
  // Left block only / right block only, so a change to one set of sticky offsets cannot
  // hide inside the other.
  'pinned-left-only': { columns: without('right'), data },
  'pinned-right-only': { columns: columns.map((c) => (c.pinned === true ? { ...c, pinned: undefined } : c)), data },
  // The Action column: frozen alone at the right edge, dragged to the front of the left
  // block, and parked in the middle where it cannot freeze at all.
  'actions-pinned-alone': { columns: without('right'), data, Actions, pinActions: true },
  'actions-first': { columns, data, Actions, actionIndex: 'first', rowStripColor: () => '#e03e3e' },
  'actions-middle': { columns: without('right'), data, Actions, actionIndex: 2, pinActions: true },
  // Layout state coming from the column config rather than from the user.
  'hidden-column': { columns: patch('name', { hidden: true }), data, Actions, rowStripColor: () => '#e03e3e' },
  'hidden-but-locked': { columns: patch('name', { hidden: true, hideable: false }), data },
  'all-hidden': { columns: columns.map((c) => ({ ...c, hidden: true })), data },
  // Per-column and global switches that drop whole pieces of the header.
  'no-resize-no-reorder': { columns, data, Actions, resizable: false, reorderable: false },
  'no-sort-no-search': { columns, data, sortable: false, searchable: false },
  'disabled-per-column': { columns: patch('city', { disableResizing: true, disableReordering: true, disableSortBy: true, disableFilters: true }), data },
  // Body states.
  'empty': { columns, data: [], dataFetched: true },
  'empty-custom-text': { columns, data: [], dataFetched: true, emptyText: 'Koi record nahi mila' },
  'loading': { columns, data: [], loading: true },
  // Footer variants — the left label is absolutely positioned over the footer row.
  'footer-left': { columns, data, footerLeft: 'Totals' },
  'footer-forced-off': { columns, data, showFooter: false },
  // Sizing / behaviour props that reach the inline styles.
  'dense': { columns, data, Actions, rowHeight: 35, fontSize: 11, height: 300, actionWidth: 80 },
  'row-snap': { columns, data, rowSnap: true },
  'no-row-navigation': { columns, data, rowNavigation: false, selectedBg: '#ffe9a8' },
  'row-style': { columns, data, rowStyle: (r) => (r.status === 'Cancelled' ? { backgroundColor: '#fdecec', color: '#a11' } : undefined) },
  'class-and-style': { columns, data, className: 'my-list', style: { border: '2px solid red' } },
  // The `type` / `footer` shorthands: one line per column instead of a Cell and a
  // reduce. `width: 45` with no minWidth must render 45px wide, not react-table's 90.
  'typed-columns': {
    columns: [
      { type: 'serial', width: 45 },
      { Header: 'Name', accessor: 'name', width: 200, footer: 'count' },
      { Header: 'Created', accessor: 'created', type: 'datetime' },
      { Header: 'Due', accessor: 'due', type: 'date' },
      { Header: 'Active', accessor: 'active', type: 'boolean' },
      { Header: 'Qty', accessor: 'qty', type: 'number', width: 80, footer: 'sum' },
      { Header: 'Amount', accessor: 'amount', type: 'currency', width: 130, footer: 'sum' },
    ],
    data: data.map((r, i) => ({ ...r, created: '2026-03-0' + (i + 1) + ' 14:05:09', due: 1772409600000, active: i !== 1, qty: (i + 1) * 3 })),
    locale: 'en-IN',
    currencySymbol: '₹',
  },
  // `status` replaces the loading + dataFetched pair.
  'status-loading': { columns, data: [], status: 'loading' },
  'status-idle': { columns, data: [], status: 'idle' },
  // A height with a unit used to be parsed to a bare pixel number.
  'height-percent': { columns, data, height: '100%' },
  'height-fill': { columns, data, height: 'fill' },
  // The built-in toolbar. With one, the root becomes a flex column and the scrollport
  // takes the leftover height — without one the markup is unchanged, which is what every
  // other snapshot here is holding in place.
  'toolbar': { columns, data, Actions, toolbar: true, pinStorageKey: 'golden-tb' },
  'toolbar-config': { columns, data, toolbar: { pin: false, left: el('strong', null, 'Customers'), right: el('button', { type: 'button' }, 'Export') } },
};

const render = (props) => renderToStaticMarkup(el(FreezeTable, props));

if (UPDATE) fs.mkdirSync(DIR, { recursive: true });
let failed = 0;
let checked = 0;

Object.keys(CASES).forEach((name) => {
  const file = path.join(DIR, name + '.html');
  const html = render(CASES[name]);
  if (UPDATE) {
    fs.writeFileSync(file, html + '\n');
    console.log('wrote  - ' + name);
    return;
  }
  checked++;
  if (!fs.existsSync(file)) {
    failed++;
    consoleError('FAIL: ' + name + ' has no golden file — run `node scripts/golden.js --update`');
    return;
  }
  const expected = fs.readFileSync(file, 'utf8').replace(/\n$/, '');
  if (expected === html) {
    console.log('ok  - ' + name);
    return;
  }
  failed++;
  // Character-level position of the first divergence, with a window of context either
  // side: the markup is one enormous line, so a plain "differs" is useless.
  let i = 0;
  while (i < expected.length && i < html.length && expected[i] === html[i]) i++;
  const window_ = (s) => JSON.stringify(s.slice(Math.max(0, i - 60), i + 120));
  consoleError('FAIL: ' + name + ' differs at char ' + i);
  consoleError('  expected: ' + window_(expected));
  consoleError('  actual  : ' + window_(html));
});

// A golden file for a case that no longer exists is stale — most likely a case was
// renamed and the old snapshot was left behind, which would quietly stop being checked.
if (!UPDATE && fs.existsSync(DIR)) {
  fs.readdirSync(DIR)
    .filter((f) => f.endsWith('.html'))
    .forEach((f) => {
      if (!CASES[f.replace(/\.html$/, '')]) {
        failed++;
        consoleError('FAIL: ' + f + ' is a golden file with no matching case');
      }
    });
}

console.error = consoleError;
if (warnings.length) {
  failed++;
  console.error('FAIL: React logged warnings while rendering:\n      ' + warnings.join('\n      '));
}

if (UPDATE) {
  console.log('\ngolden files updated (' + Object.keys(CASES).length + ')');
} else if (failed) {
  process.exitCode = 1;
  console.error('\n' + failed + ' golden check(s) FAILED');
} else {
  console.log('\nall ' + checked + ' golden snapshots match');
}
