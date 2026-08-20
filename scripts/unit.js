/* Unit tests for src/lib/columns.js — the pure column maths behind the freeze offsets,
   the pin caps and the order reconciliation. No React, no DOM: these are the parts most
   likely to break silently under a refactor, and they are exactly the parts a
   server-rendered snapshot cannot cover on its own (a cap only bites once the wrap has
   been measured, which never happens on the server).

   Bundled by rollup.test.mjs because src/ is ESM inside a CommonJS package. Run it with
   `npm run test:unit`. */
import {
  applyLayout,
  buildConfigOrder,
  colIdOf,
  colWidthOf,
  computeMaxLeftPinCount,
  computeMaxRightPinCount,
  countLeadingPinned,
  countTrailingPinned,
  orderKeyOf,
  reconcileOrder,
  rightBlockWidthOf,
  stickyOffsets,
} from '../src/lib/columns';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatDate, formatNumber, normalizeColumn, toDate } from '../src/lib/columnTypes';
import { resolveHeight } from '../src/lib/props';
import { CLASS_SLOTS, COMPONENT_SLOTS, cx, resolveClassNames, resolveComponents, skin } from '../src/lib/slots';
import { CORE_TOKENS, DARK, LADDER, LIGHT, resolveTokens, themeCss, tokenNames, tokenProp, v } from '../src/lib/theme';

let failed = 0;
let passed = 0;
const ok = (msg) => {
  passed++;
  console.log('ok  - ' + msg);
};
const fail = (msg, extra) => {
  failed++;
  console.error('FAIL: ' + msg + (extra ? '\n      ' + extra : ''));
};
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));
const eq = (actual, expected, msg) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  return a === b ? ok(msg) : fail(msg, 'expected ' + b + '\n      actual   ' + a);
};

const group = (name) => console.log('\n# ' + name);

// ---------------------------------------------------------------- column identity
group('colIdOf / orderKeyOf');
eq(colIdOf({ id: 'a', accessor: 'b' }), 'a', 'an explicit id wins over the accessor');
eq(colIdOf({ accessor: 'b' }), 'b', 'a string accessor is the id');
eq(colIdOf({ accessor: () => 1 }), undefined, 'an accessor function alone has no id');
eq(orderKeyOf({ accessor: () => 1 }, 3), '__col3', 'an unaddressable column still gets an order slot');

// ---------------------------------------------------------------- effective width
group('colWidthOf');
eq(colWidthOf({}), 90, 'an unconfigured column is react-table\'s 90px floor');
eq(colWidthOf({ width: 200 }), 200, 'width above the default floor is used as-is');
eq(colWidthOf({ width: 50 }), 90, 'width below the default floor is raised to it');
eq(colWidthOf({ width: 50, minWidth: 45 }), 50, 'an explicit minWidth lowers the floor');
eq(colWidthOf({ width: 2.4, minWidth: 200 }), 200, 'a width under minWidth is ignored');
eq(colWidthOf({ width: 500, maxWidth: 300 }), 300, 'maxWidth is the ceiling');
// This is the shape a drag writes: all three pinned to the same number, so the
// min/max expression collapses to exactly the dragged width.
eq(colWidthOf({ width: 137, minWidth: 137, maxWidth: 137 }), 137, 'a dragged width overrides both bounds');

// ---------------------------------------------------------------- order merging
group('reconcileOrder');
const cfg = ['a', 'b', 'c', 'd'];
eq(reconcileOrder(cfg, null), cfg, 'no stored order = the config order');
eq(reconcileOrder(cfg, []), cfg, 'an empty stored order = the config order');
eq(reconcileOrder(cfg, ['d', 'c', 'b', 'a']), ['d', 'c', 'b', 'a'], 'a complete stored order is kept');
eq(reconcileOrder(cfg, ['d', 'a']), ['d', 'a', 'b', 'c'], 'unmentioned columns follow their configured neighbour');
eq(reconcileOrder(cfg, ['x', 'd', 'a']), ['d', 'a', 'b', 'c'], 'an id the config no longer has is dropped');
eq(reconcileOrder(cfg, ['a', 'a', 'b']), ['a', 'b', 'c', 'd'], 'a duplicate id is ignored');
// The case the whole function exists for: a column added to `columns` AFTER a layout
// was saved must land where the config puts it, not at the end (which would look as
// though the user had dragged it there).
eq(reconcileOrder(['a', 'new', 'b', 'c'], ['c', 'b', 'a']), ['c', 'b', 'a', 'new'], 'a new column after its neighbour: last');
eq(reconcileOrder(['new', 'a', 'b'], ['b', 'a']), ['new', 'b', 'a'], 'a new FIRST column goes first, not last');
eq(reconcileOrder(['a', 'new', 'b'], ['b', 'a']), ['b', 'a', 'new'], 'a new middle column follows the neighbour it was configured after');

// ---------------------------------------------------------------- config order
group('buildConfigOrder');
const columns = [
  { Header: '#', id: 'sl', width: 45, minWidth: 45, pinned: true },
  { Header: 'Name', accessor: 'name', width: 200, minWidth: 200, pinned: true },
  { Header: 'City', accessor: 'city', width: 160, minWidth: 160 },
  { Header: 'Amount', accessor: 'amount', width: 120, minWidth: 120, pinned: 'right' },
];
eq(buildConfigOrder({ columns, hasActions: false }), ['sl', 'name', 'city', 'amount'], 'no Actions = just the caller columns');
eq(buildConfigOrder({ columns, hasActions: true, actionIndex: 'last' }), ['sl', 'name', 'city', 'amount', '__actions'], 'actionIndex "last"');
eq(buildConfigOrder({ columns, hasActions: true, actionIndex: 'first' }), ['__actions', 'sl', 'name', 'city', 'amount'], 'actionIndex "first"');
eq(buildConfigOrder({ columns, hasActions: true, actionIndex: 2 }), ['sl', 'name', '__actions', 'city', 'amount'], 'a numeric actionIndex');
eq(buildConfigOrder({ columns, hasActions: true, actionIndex: 99 }), ['sl', 'name', 'city', 'amount', '__actions'], 'an out-of-range actionIndex clamps to the end');
eq(buildConfigOrder({ columns, hasActions: true, actionIndex: null }), ['sl', 'name', 'city', 'amount', '__actions'], 'a null actionIndex defaults to last');

// ---------------------------------------------------------------- layout
group('applyLayout');
const lay = (extra) =>
  applyLayout({ columns, hiddenIds: [], colWidths: {}, order: buildConfigOrder({ columns, hasActions: false }), hasActions: false, ...extra });
eq(lay().cols.map(colIdOf), ['sl', 'name', 'city', 'amount'], 'nothing hidden or moved = the config order');
eq(lay().actionPos, -1, 'no Action column = no position');
eq(lay({ hiddenIds: ['name'] }).cols.map(colIdOf), ['sl', 'city', 'amount'], 'a hidden column is dropped');
eq(
  applyLayout({ columns, hiddenIds: [], colWidths: {}, order: ['amount', 'city', 'name', 'sl'], hasActions: false }).cols.map(colIdOf),
  ['amount', 'city', 'name', 'sl'],
  'the order is applied'
);
eq(lay({ colWidths: { city: 137 } }).cols[2], { ...columns[2], width: 137, minWidth: 137, maxWidth: 137 }, 'a resized column gets all three width bounds');
// hideable:false is a lock, not a default — a stored hidden set must not be able to
// take a key column away.
eq(
  applyLayout({
    columns: columns.map((c) => (c.accessor === 'name' ? { ...c, hideable: false } : c)),
    hiddenIds: ['name'],
    colWidths: {},
    order: buildConfigOrder({ columns, hasActions: false }),
    hasActions: false,
  }).cols.map(colIdOf),
  ['sl', 'name', 'city', 'amount'],
  'hideable:false survives being in the hidden set'
);
// Hiding literally everything would leave react-table with no header row to un-hide
// anything FROM, so the layout falls back to showing them all.
eq(
  applyLayout({ columns, hiddenIds: ['sl', 'name', 'city', 'amount'], colWidths: {}, order: [], hasActions: false }).cols.length,
  4,
  'hiding every column falls back to the full list'
);
const withActions = applyLayout({
  columns,
  hiddenIds: ['name'],
  colWidths: {},
  order: buildConfigOrder({ columns, hasActions: true, actionIndex: 2 }),
  hasActions: true,
});
eq(withActions.actionPos, 1, 'actionPos counts VISIBLE caller columns, so hiding one shifts it');

// ---------------------------------------------------------------- pin defaults
group('countLeadingPinned / countTrailingPinned');
eq(countLeadingPinned(columns), 2, 'the leading run of pinned columns');
eq(countTrailingPinned(columns), 1, 'the trailing run of right-pinned columns');
eq(countLeadingPinned([{ pinned: false }, { pinned: true }]), 0, 'a pinned column that is not part of the LEADING run does not count');
eq(countTrailingPinned([{ pinned: 'right' }, {}]), 0, 'nor one outside the TRAILING run');
eq(countLeadingPinned([{ pinned: 'right' }, { pinned: true }]), 0, "pinned:'right' does not start a left run");

// ---------------------------------------------------------------- pin caps
group('computeMaxRightPinCount / computeMaxLeftPinCount');
// Widths: sl 45, name 200, city 160, amount 120. PIN_MIN_SCROLLABLE is 250.
const capArgs = { cols: columns, hasActions: false, actionPos: -1, actionColWidth: 0 };
eq(computeMaxRightPinCount({ ...capArgs, wrapW: 0 }), 4, 'before the wrap is measured nothing is capped');
eq(computeMaxRightPinCount({ ...capArgs, wrapW: 1000 }), 4, 'a wide viewport allows every column');
// budget = 400 - 250 = 150 -> amount (120) fits, +city (160) does not.
eq(computeMaxRightPinCount({ ...capArgs, wrapW: 400 }), 1, 'a narrow viewport caps the right block');
eq(computeMaxRightPinCount({ ...capArgs, wrapW: 300 }), 0, 'too narrow for even one column = nothing may freeze');
const leftArgs = { ...capArgs, stripWidth: 0, rightBlockWidth: 0, effectiveRightPinCount: 0 };
// budget = 600 - 250 = 350 -> sl (45) + name (200) = 245 fits, +city (160) does not.
eq(computeMaxLeftPinCount({ ...leftArgs, wrapW: 600 }), 2, 'the left cap counts from the left');
// The right block is budgeted FIRST, so it eats into what the left one may claim:
// budget = 600 - 250 - 120 = 230 -> only sl (45) + ... name would make 245. So 1.
eq(computeMaxLeftPinCount({ ...leftArgs, wrapW: 600, rightBlockWidth: 120, effectiveRightPinCount: 1 }), 1, 'a frozen right block shrinks the left cap');
eq(computeMaxLeftPinCount({ ...leftArgs, wrapW: 600, stripWidth: 14 }), 2, 'the status strip is charged against the left budget');
// budget = 300 - 250 = 50 -> the 45px '#' column fits on its own, but not once the
// 14px status strip is charged against the same budget.
eq(computeMaxLeftPinCount({ ...leftArgs, wrapW: 300 }), 1, 'without a strip the first column fits');
eq(computeMaxLeftPinCount({ ...leftArgs, wrapW: 300, stripWidth: 14 }), 0, 'a 14px strip can be what tips a column past the cap');
// The Action column's width is only charged to the run it actually sits in.
eq(
  computeMaxRightPinCount({ cols: columns, wrapW: 400, hasActions: true, actionPos: 4, actionColWidth: 110 }),
  0,
  'an Action column at the end eats the right budget'
);
eq(
  computeMaxRightPinCount({ cols: columns, wrapW: 400, hasActions: true, actionPos: 0, actionColWidth: 110 }),
  1,
  'an Action column at the FRONT does not touch the right budget'
);

group('rightBlockWidthOf');
eq(rightBlockWidthOf({ cols: columns, effectiveRightPinCount: 1, actionsPinnedRight: false, actionColWidth: 110 }), 120, 'one right-frozen column');
eq(rightBlockWidthOf({ cols: columns, effectiveRightPinCount: 1, actionsPinnedRight: true, actionColWidth: 110 }), 230, 'the Action column adds its width when it rides along');
eq(rightBlockWidthOf({ cols: columns, effectiveRightPinCount: 0, actionsPinnedRight: false, actionColWidth: 110 }), 0, 'nothing frozen = no block');

// ---------------------------------------------------------------- sticky offsets
group('stickyOffsets');
// The freeze offsets are the one thing a wrong result gets you a table that LOOKS fine
// until you scroll sideways and the frozen columns overlap.
const annotated = [
  { id: '__strip', width: 14, minWidth: 14, maxWidth: 14, pinned: true },
  { id: 'sl', width: 45, minWidth: 45, pinned: true },
  { accessor: 'name', width: 200, minWidth: 200, pinned: true, pinnedLast: true },
  { accessor: 'city', width: 160, minWidth: 160 },
  { accessor: 'amount', width: 120, minWidth: 120, pinnedRight: true, pinnedRightFirst: true },
  { id: '__actions', width: 110, minWidth: 110, pinnedRight: true },
];
const offs = stickyOffsets(annotated);
eq(offs.left, { __strip: 0, sl: 14, name: 59 }, 'left offsets are the cumulative width BEFORE each frozen column');
eq(offs.right, { __actions: 0, amount: 110 }, 'right offsets are the cumulative width BEYOND each frozen column');
assert(offs.left.city === undefined && offs.right.city === undefined, 'a scrolling column gets no offset');
// Hiding `name` must re-flow the block — this is what the hidden-column snapshot checks
// from the outside, asserted here directly.
eq(stickyOffsets(annotated.filter((c) => c.accessor !== 'name')).left, { __strip: 0, sl: 14 }, 'hiding a frozen column re-flows the offsets');

// ---------------------------------------------------------------- the height prop
group('resolveHeight');
eq(resolveHeight(500), 500, 'a number is pixels');
eq(resolveHeight('500'), 500, 'a numeric string is pixels');
// The bug this replaced: parseFloat('100%') is 100, so the table silently became 100px.
eq(resolveHeight('100%'), '100%', 'a percentage keeps its unit');
eq(resolveHeight('60vh'), '60vh', 'a viewport unit keeps its unit');
eq(resolveHeight('calc(100vh - 120px)'), 'calc(100vh - 120px)', 'calc() passes through');
eq(resolveHeight('fill'), '100%', '"fill" means the containing box');
eq(resolveHeight(undefined), undefined, 'nothing means nothing');

// ---------------------------------------------------------------- value formatting
group('toDate');
assert(toDate(null) === null && toDate('') === null && toDate('NULL') === null, 'blanks are not dates');
assert(toDate('nonsense') === null, 'an unparseable string is not a date');
// The one browsers disagree on: Safari refuses 'YYYY-MM-DD HH:mm:ss' until the space
// becomes a 'T', and that is the exact shape a SQL backend hands back.
eq(formatDate(toDate('2026-03-01 14:05:09'), 'DD-MM-YYYY HH:mm:ss'), '01-03-2026 14:05:09', 'a SQL datetime parses');
eq(formatDate(toDate(new Date(2026, 2, 1, 14, 5, 9)), 'DD-MM-YYYY'), '01-03-2026', 'a Date instance passes through');

group('formatDate');
const d = new Date(2026, 2, 1, 14, 5, 9);
eq(formatDate(d, 'DD-MM-YYYY'), '01-03-2026', 'the default date pattern');
eq(formatDate(d, 'DD-MM-YYYY HH:mm'), '01-03-2026 14:05', 'the default datetime pattern');
eq(formatDate(d, 'YYYY-MM-DD'), '2026-03-01', 'an ISO-style pattern');
eq(formatDate(d, 'DD MMM YY'), '01 Mar 26', 'month names and two-digit years');
eq(formatDate(d, 'hh:mm A'), '02:05 PM', 'a 12-hour clock');
eq(formatDate(new Date(2026, 2, 1, 0, 30), 'hh:mm A'), '12:30 AM', 'midnight is 12 AM, not 00');

group('formatNumber');
eq(formatNumber(1234.5, { locale: 'en-US', decimals: 2 }), '1,234.50', 'grouping and fixed decimals');
eq(formatNumber('1234.5', { locale: 'en-US', decimals: 2 }), '1,234.50', 'a numeric string is accepted');
eq(formatNumber(1234.5, { locale: 'en-IN', decimals: 2 }), '1,234.50', 'the Indian grouping locale');
eq(formatNumber(1234567, { locale: 'en-IN', decimals: 0 }), '12,34,567', 'lakhs, not thousands, under en-IN');
eq(formatNumber('abc', { locale: 'en-US' }), null, 'a non-number formats to nothing');

// ---------------------------------------------------------------- column shorthands
group('normalizeColumn');
const opts = { locale: 'en-US', dateFormat: 'DD-MM-YYYY', dateTimeFormat: 'DD-MM-YYYY HH:mm' };
const norm = (c) => normalizeColumn(c, opts, 0);
// A column using none of the shorthands must come back AS IT WAS — identity included, or
// the memo chain downstream would rebuild the whole layout on every render.
const plainCol = { Header: 'Name', accessor: 'name', width: 200, minWidth: 200 };
assert(norm(plainCol) === plainCol, 'a column using no shorthand is returned untouched');
// The papercut this fixes: `width: 45` used to render 90px, because react-table computes
// max(minWidth, width) against a default minWidth of 90.
eq(norm({ accessor: 'a', width: 45 }).minWidth, 45, 'a width with no minWidth sets its own floor');
eq(norm({ accessor: 'a', width: 45, minWidth: 0 }).minWidth, 0, 'an explicit minWidth: 0 is left alone');
eq(norm({ accessor: 'a', type: 'currency' }).align, 'right', 'currency is right-aligned');
eq(norm({ accessor: 'a', type: 'currency', align: 'left' }).align, 'left', 'an explicit align beats the type');
eq(norm({ accessor: 'a', type: 'date' }).minWidth, 110, 'a date column is wide enough for DD-MM-YYYY');
eq(norm({ accessor: 'a', type: 'datetime' }).minWidth, 150, 'a datetime column is wider still');
eq(norm({ accessor: 'a', type: 'date', width: 200 }).minWidth, 200, 'an explicit width still wins over the type default');
// The trap this avoids: a type's minWidth is a floor, so without the rule above a
// narrower explicit width would be silently ignored.
eq(norm({ accessor: 'a', type: 'date', width: 60 }).minWidth, 60, 'a width NARROWER than the type default still wins');
const serial = norm({ type: 'serial' });
eq([serial.id, serial.Header, serial.width, serial.align, serial.disableSortBy], ['__serial', '#', 50, 'right', true], 'the serial type fills in a whole column');
eq(normalizeColumn({ type: 'serial' }, opts, 2).id, '__serial2', 'a second serial column gets its own id');
assert(typeof norm({ accessor: 'a', type: 'number' }).Cell === 'function', 'a type installs a Cell');
const keptCell = () => null;
assert(norm({ accessor: 'a', type: 'number', Cell: keptCell }).Cell === keptCell, 'an explicit Cell beats the type');

// The cells themselves. Rows never render server-side (they need a measured row band),
// so these are the only place the typed renderers are covered at all.
group('typed cells');
const cellText = (col, value, row) => {
  const c = normalizeColumn(col, opts, 0);
  const html = renderToStaticMarkup(React.createElement(c.Cell, { value, row, rows: [] }));
  return html.replace(/<[^>]*>/g, '');
};
eq(cellText({ accessor: 'a', type: 'currency' }, 1200), '1,200.00', 'currency: two decimals and grouping');
eq(cellText({ accessor: 'a', type: 'currency', decimals: 0 }, 1200), '1,200', 'currency: decimals is overridable');
eq(cellText({ accessor: 'a', type: 'number' }, 1234.5), '1,234.5', 'number: grouping, decimals as they come');
eq(cellText({ accessor: 'a', type: 'number' }, 0), '0', 'number: a zero is information, so it shows');
eq(cellText({ accessor: 'a', type: 'text' }, 0), '', 'text: a zero is noise, so it blanks (as the default cell always has)');
eq(cellText({ accessor: 'a', type: 'number', blankZero: true }, 0), '', 'blankZero overrides either way');
eq(cellText({ accessor: 'a', type: 'date' }, '2026-03-01 14:05:09'), '01-03-2026', 'date: formatted with the table pattern');
eq(cellText({ accessor: 'a', type: 'date', dateFormat: 'YYYY/MM/DD' }, '2026-03-01'), '2026/03/01', 'date: a per-column pattern wins');
eq(cellText({ accessor: 'a', type: 'datetime' }, '2026-03-01 14:05:09'), '01-03-2026 14:05', 'datetime: date and time');
eq(cellText({ accessor: 'a', type: 'date' }, 'not a date'), 'not a date', 'date: an unparseable value is printed as-is, not "Invalid Date"');
eq(cellText({ accessor: 'a', type: 'boolean' }, true), '✓', 'boolean: true is a tick');
eq(cellText({ accessor: 'a', type: 'boolean' }, 0), '', 'boolean: false is blank');
eq(cellText({ accessor: 'a', type: 'boolean', booleanLabels: ['Yes', 'No'] }, 'Y'), 'Yes', 'boolean: the labels are overridable');
eq(cellText({ accessor: 'a', format: (v) => 'x' + v }, 7), 'x7', 'format: a one-off formatter needs no Cell');

group('footer shorthands');
const footerText = (col, values) => {
  const c = normalizeColumn(col, opts, 0);
  const id = col.id || col.accessor;
  const rows = values.map((v) => ({ values: { [id]: v } }));
  const out = c.Footer({ rows });
  return typeof out === 'string' ? out : renderToStaticMarkup(React.createElement('span', null, out)).replace(/<[^>]*>/g, '');
};
eq(footerText({ accessor: 'amount', type: 'currency', footer: 'sum' }, [1200, 800.5, 45]), '2,045.50', 'sum: formatted like the column above it');
eq(footerText({ accessor: 'qty', type: 'number', footer: 'sum' }, [3, 6, 9]), '18', 'sum: a plain number column');
eq(footerText({ accessor: 'qty', type: 'number', footer: 'avg' }, [2, 4, 6]), '4', 'avg');
eq(footerText({ accessor: 'qty', type: 'number', footer: 'min' }, [5, 2, 9]), '2', 'min');
eq(footerText({ accessor: 'qty', type: 'number', footer: 'max' }, [5, 2, 9]), '9', 'max');
eq(footerText({ accessor: 'qty', footer: 'count' }, [1, 2, 3]), 'Count : 3', 'count');
// The footer follows the FILTERED rows, and a non-numeric value must not turn the whole
// total into NaN.
eq(footerText({ accessor: 'qty', type: 'number', footer: 'sum' }, [3, null, 'x', 9]), '12', 'sum: blanks and junk are skipped, not counted as NaN');

// ---------------------------------------------------------------- theme tokens
group('theme: the token registry');
// The three maps have to agree or a token silently stops existing in one theme.
assert(
  CORE_TOKENS.every((n) => LIGHT[n] !== undefined),
  'every core token has a light value'
);
assert(
  Object.keys(LADDER).every((n) => LIGHT[n] !== undefined && LIGHT[LADDER[n]] !== undefined),
  'every derived token and its parent exist in LIGHT'
);
assert(
  Object.keys(DARK).every((n) => LIGHT[n] !== undefined),
  'the dark palette overrides only tokens that exist'
);
// The one rule that keeps the ladder usable: a derived token must NOT be re-stated in
// the dark palette, or overriding its core token in dark mode would stop reaching it.
eq(
  Object.keys(DARK).filter((n) => LADDER[n]),
  [],
  'the dark palette re-states no derived token, so the ladder survives a theme switch'
);
assert(
  Object.values(LIGHT).every((val) => !String(val).includes('var(')),
  'LIGHT is fully resolved — it is also the inline fallback table, so no entry may be a var()'
);

group('theme: v() and tokenProp()');
eq(tokenProp('row-bg'), '--ft-row-bg', 'a bare name gains the prefix');
eq(tokenProp('--ft-row-bg'), '--ft-row-bg', 'an already-prefixed name is left alone');
eq(v('row-bg'), 'var(--ft-row-bg, #ffffff)', 'v() carries the literal fallback for a sheet that never loaded');
eq(v('row-bg', '#eee'), 'var(--ft-row-bg, #eee)', 'an explicit fallback wins');

group('theme: themeCss()');
const base = themeCss(LIGHT, { base: true });
assert(base.includes('--ft-bg:#ffffff;'), 'the base block emits the core literals');
assert(base.includes('--ft-row-bg:var(--ft-bg, #ffffff);'), 'and points a derived token at its parent');
assert(
  tokenNames().every((n) => base.includes(tokenProp(n) + ':')),
  'the base block declares every token — a missing one would fall back to nothing'
);
const dark = themeCss(DARK);
assert(dark.includes('--ft-bg:#0f172a;'), 'the dark block emits its own overrides');
assert(!dark.includes('--ft-row-bg:'), 'and emits nothing for a token the ladder already carries');

group('theme: resolveTokens()');
eq(resolveTokens(null), null, 'no tokens is no style object at all');
eq(resolveTokens({}), null, 'and neither is an empty one');
eq(resolveTokens({ accent: '#f00' }), { '--ft-accent': '#f00' }, 'a bare name is prefixed');
eq(resolveTokens({ '--ft-accent': '#f00' }), { '--ft-accent': '#f00' }, 'a prefixed name is passed through');
eq(resolveTokens({ radius: 0 }), { '--ft-radius': '0' }, 'a number is stringified, and 0 is kept');
eq(resolveTokens({ a: undefined, b: null, c: false }), null, 'empty values are dropped, not written as "undefined"');
eq(resolveTokens({ 'my-own': 'x' }), { '--ft-my-own': 'x' }, 'an unknown name is passed through, not dropped');

// ---------------------------------------------------------------- slots
group('slots: cx()');
eq(cx('ft-row ct-row'), 'ft-row ct-row', 'the built-in class alone');
eq(cx('ft-row', 'mine'), 'ft-row mine', 'the caller class comes last, so flat-specificity CSS wins');
eq(cx('ft-row', undefined, null, ''), 'ft-row', 'falsy parts are dropped');
eq(cx(undefined, null), undefined, 'nothing at all is undefined, not "" — React renders class="" for an empty string');

group('slots: resolveClassNames()');
eq(resolveClassNames(undefined).root, undefined, 'a missing map is safe to index');
assert(resolveClassNames(undefined) === resolveClassNames(null), 'and is one shared object, so it adds no allocation per render');
eq(resolveClassNames({ root: 'r' }).root, 'r', 'a given map is used as-is');
assert(CLASS_SLOTS.length > 0 && CLASS_SLOTS.includes('row') && CLASS_SLOTS.includes('menuItem'), 'the slot list is populated');

group('slots: resolveComponents()');
const DEFAULTS = { A: 1, B: 2 };
assert(resolveComponents(undefined, DEFAULTS) === DEFAULTS, 'no override returns the defaults object ITSELF — the identity feeds a memo');
assert(resolveComponents({}, DEFAULTS) === DEFAULTS, 'and so does an empty override');
assert(resolveComponents({ A: undefined }, DEFAULTS) === DEFAULTS, 'an explicit undefined means "unset", so it falls back too');
eq(resolveComponents({ A: 9 }, DEFAULTS), { A: 9, B: 2 }, 'an override replaces one slot and leaves the rest');
eq(resolveComponents({ A: null }, DEFAULTS), { A: null, B: 2 }, 'null is kept — it is how a caller renders nothing in a slot');
assert(COMPONENT_SLOTS.includes('FilterInput') && COMPONENT_SLOTS.includes('MenuItem'), 'the component slot list is populated');

group('slots: skin()');
eq(skin(false, { background: 'red' }), { background: 'red' }, 'styled keeps the paint');
eq(skin(true, { background: 'red' }), null, 'unstyled drops it');

console.log('');
if (failed) {
  process.exitCode = 1;
  console.error(failed + ' of ' + (failed + passed) + ' unit checks FAILED');
} else {
  console.log('all ' + passed + ' unit checks passed');
}
