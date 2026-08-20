/* DOM tests: mount the BUILT bundle in jsdom and drive it the way a user does.

   The smoke and golden checks render on the server, where there is nothing to measure —
   so they never see a single ROW (rows render only once the row band has a height), nor
   the keyboard navigation, nor the toolbar menus. Everything below exists to cover
   exactly that half.

   jsdom has no layout engine: every offsetHeight / clientWidth is 0, which would leave
   the row band 0px tall and the window empty. The stubs at the top hand back plausible
   numbers per element, so the component's own maths (windowing, pin caps, the row band)
   runs for real against them.

   Run with `npm run test:dom` (after `npm run build`). The .cjs extension is not decoration:
   the top-level `await` below makes Node treat a plain .js file as an ES module. */
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.Event = dom.window.Event;
global.MouseEvent = dom.window.MouseEvent;
global.KeyboardEvent = dom.window.KeyboardEvent;
// SYNCHRONOUS rAF. The scroll handler is rAF-throttled, so with a real one every
// windowing assertion would have to wait a frame; running the callback inline makes the
// tests deterministic instead of timing-dependent. (Nothing exercised here uses rAF as a
// loop — the reorder drag does, and would spin.)
global.requestAnimationFrame = (cb) => {
  cb(0);
  return 0;
};
global.cancelAnimationFrame = () => {};
dom.window.requestAnimationFrame = global.requestAnimationFrame;
dom.window.cancelAnimationFrame = global.cancelAnimationFrame;
global.IS_REACT_ACT_ENVIRONMENT = true;

// ----- the fake layout engine -----
// Sizes by role, not by CSS: the wrap is the scrollport, the header and footer eat into
// it, and the toolbar sits outside it. Everything the component measures comes from here.
const WRAP_H = 500;
const WRAP_W = 900;
const HEAD_H = 56;
const FOOT_H = 30;
const TOOL_H = 33;
const roleOf = (el) => {
  const c = el.className && typeof el.className === 'string' ? el.className : '';
  if (c.includes('ft-wrap')) return 'wrap';
  if (c.includes('ft-head')) return 'head';
  if (c.includes('ft-foot')) return 'foot';
  if (c.includes('ft-toolbar')) return 'toolbar';
  if (c.includes('ft-th')) return 'th';
  return null;
};
const define = (name, fn) => Object.defineProperty(dom.window.HTMLElement.prototype, name, { configurable: true, get: fn });
define('clientHeight', function () {
  return roleOf(this) === 'wrap' ? WRAP_H : 0;
});
define('clientWidth', function () {
  return roleOf(this) === 'wrap' ? WRAP_W : 0;
});
define('offsetHeight', function () {
  const r = roleOf(this);
  return r === 'head' ? HEAD_H : r === 'foot' ? FOOT_H : r === 'toolbar' ? TOOL_H : 0;
});
define('offsetWidth', function () {
  return roleOf(this) === 'th' ? parseFloat(this.style.width) || 0 : 0;
});

const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');
const { FreezeTable } = require('../dist/freeze-table.cjs.js');

// React's own act() warning is noise here; a genuine React error still has to fail the
// run, so they are collected rather than silenced.
const consoleError = console.error.bind(console);
const reactErrors = [];
console.error = (...args) => {
  const line = args.map(String).join(' ').split('\n')[0];
  if (/ReactDOMTestUtils.act/.test(line)) return;
  reactErrors.push(line);
};

let failed = 0;
let passed = 0;
const ok = (msg) => {
  passed++;
  console.log('ok  - ' + msg);
};
const fail = (msg, extra) => {
  failed++;
  consoleError('FAIL: ' + msg + (extra ? '\n      ' + extra : ''));
};
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));
const eq = (actual, expected, msg) =>
  JSON.stringify(actual) === JSON.stringify(expected) ? ok(msg) : fail(msg, 'expected ' + JSON.stringify(expected) + '\n      actual   ' + JSON.stringify(actual));
const group = (name) => console.log('\n# ' + name);

// ----- fixture -----
const columns = [
  { type: 'serial', width: 45, pinned: true },
  { Header: 'Name', accessor: 'name', width: 200, pinned: true },
  { Header: 'City', accessor: 'city', width: 160 },
  { Header: 'Amount', accessor: 'amount', type: 'currency', width: 120, footer: 'sum' },
];
const data = Array.from({ length: 500 }, (_, i) => ({
  id: 'r' + i,
  name: 'Row ' + i,
  city: i % 2 ? 'Patna' : 'Ranchi',
  amount: (i + 1) * 10,
}));

const ref = React.createRef();
let container;
let root;
const mount = (props) => {
  container = document.getElementById('root');
  root = createRoot(container);
  act(() => {
    root.render(React.createElement(FreezeTable, { ref, columns, data, rowHeight: 40, ...props }));
  });
};
const $ = (sel) => container.querySelector(sel);
const $$ = (sel) => Array.from(container.querySelectorAll(sel));
const textOf = (el) => (el ? el.textContent.trim() : null);
const headers = () => $$('.ft-th').map((th) => textOf(th.querySelector('.ft-th-label')));
const rowIndexes = () => $$('.ft-row').map((r) => parseInt(r.getAttribute('data-ct-index'), 10));
const click = (el) => act(() => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
const press = (key) =>
  act(() => $('.ft-wrap').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true })));
const btnNamed = (name) => $$('.ft-btn').find((b) => b.textContent.trim().startsWith(name));
const menuItemNamed = (name) => $$('.ft-menu-item').find((b) => b.textContent.trim() === name);

mount({ toolbar: true, height: WRAP_H });

// ---------------------------------------------------------------- windowing
group('row windowing');
// The band is 500 - 56 - 30 = 414px, so 11 rows fit; plus OVERSCAN 6 below the fold.
const first = rowIndexes();
assert(first.length > 0, 'rows render once the row band has been measured');
eq(first[0], 0, 'the window starts at row 0');
assert(first.length >= 11 && first.length <= 24, `only the visible slice is mounted (${first.length} of 500 rows)`);
eq(
  first.every((n, i) => i === 0 || n === first[i - 1] + 1),
  true,
  'the window is a contiguous run'
);
eq($('.ft-row').style.height, '40px', 'a row is rowHeight tall');
eq($$('.ft-row')[1].style.top, '40px', 'row N is positioned at N * rowHeight');
// Scrolling moves the window. The scroll handler is rAF-throttled, so the assertion has
// to wait a frame.
const wrap = $('.ft-wrap');
Object.defineProperty(wrap, 'scrollTop', { configurable: true, value: 4000, writable: true });
act(() => {
  wrap.dispatchEvent(new dom.window.Event('scroll'));
});
const scrolled = rowIndexes();
assert(scrolled[0] >= 90 && scrolled[0] <= 100, `scrolling re-windows to the rows in view (from ${scrolled[0]})`);
Object.defineProperty(wrap, 'scrollTop', { configurable: true, value: 0, writable: true });
act(() => {
  wrap.dispatchEvent(new dom.window.Event('scroll'));
});

// ---------------------------------------------------------------- typed cells
group('typed cells in the DOM');
const cellsOf = (i) => $$(`.ft-row[data-ct-index="${i}"] .ft-td`).map((td) => td.textContent.trim());
eq(cellsOf(0), ['1', 'Row 0', 'Ranchi', '10.00'], 'the serial, text and currency cells render');
eq(cellsOf(2)[0], '3', 'the serial column counts through the displayed rows');
// Grouped through Intl with an explicit locale. Without one the expectation is whatever
// the machine running the tests happens to be set to — this assertion read '1,252,500.00'
// and failed on any en-IN box, where the same number groups as '12,52,500.00'.
eq(
  textOf($$('.ft-tf')[3]),
  (1252500).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  "footer: 'sum' totals the column"
);

// ---------------------------------------------------------------- freezing
group('frozen columns');
const pinnedTds = $$('.ft-row[data-ct-index="0"] .ft-td[data-ct-pin="1"]');
eq(pinnedTds.length, 2, 'the two configured columns are frozen');
eq([pinnedTds[0].style.left, pinnedTds[1].style.left], ['0px', '45px'], 'sticky offsets are the cumulative widths');
eq(pinnedTds[1].getAttribute('data-ct-pin-last'), '1', 'the freeze boundary is marked');
eq(pinnedTds[0].style.position, 'sticky', 'freezing is CSS sticky, not a JS transform');

// ---------------------------------------------------------------- keyboard
group('keyboard navigation');
// The highlight is a CSS custom property REFERENCE, not a colour, since 1.1 — that is
// what lets `--ft-row-selected` re-theme a background written by JS (see VirtualRow).
// jsdom stores an unresolvable var() verbatim, which is exactly what we assert on.
const SELECTED = 'var(--ft-row-selected, #d3e5f8)';
const ROW_BG = 'var(--ft-row-bg, #ffffff)';
const bgOf = (i) => $(`.ft-row[data-ct-index="${i}"]`).style.backgroundColor;
eq(bgOf(0), SELECTED, 'row 0 starts selected');
press('ArrowDown');
eq(bgOf(1), SELECTED, 'ArrowDown moves the highlight');
eq(bgOf(0), ROW_BG, 'the previous row is un-highlighted');
press('ArrowUp');
eq(bgOf(0), SELECTED, 'ArrowUp moves it back');
let entered = null;
act(() => {
  root.render(
    React.createElement(FreezeTable, {
      ref,
      columns,
      data,
      rowHeight: 40,
      toolbar: true,
      height: WRAP_H,
      onRowEnter: (row, i) => {
        entered = [row.id, i];
      },
    })
  );
});
press('ArrowDown');
press('Enter');
eq(entered, ['r1', 1], 'Enter reports the selected row');

// ---------------------------------------------------------------- toolbar
group('built-in toolbar');
assert(!!$('.ft-toolbar'), 'the toolbar renders when `toolbar` is set');
assert(!!btnNamed('Columns') && !!btnNamed('Freeze'), 'both menus have a button');
assert(!$('.ft-menu'), 'no menu is open to start with');

click(btnNamed('Columns'));
assert(!!$('.ft-menu'), 'the column menu opens');
eq(btnNamed('Columns').getAttribute('aria-expanded'), 'true', 'the button reports its state');
assert(headers().includes('City'), 'City is on screen before hiding it');
click(menuItemNamed('City'));
assert(!headers().includes('City'), 'clicking a column in the menu hides it');
eq(ref.current.getHiddenColumns(), ['city'], 'the hidden set is readable through the ref');
assert(!!$('.ft-menu'), 'the menu stays open, so several columns can be toggled in a row');
click(menuItemNamed('City'));
assert(headers().includes('City'), 'clicking again brings it back');

// Moving a column from the menu.
const before = headers();
click(menuItemNamed('Show all columns'));
assert(!$('.ft-menu'), 'a menu action that ends the job closes the menu');
click(btnNamed('Columns'));
const cityRow = $$('.ft-menu-move').find((b) => b.getAttribute('aria-label') === 'Move City left');
click(cityRow);
eq(headers().indexOf('City') < headers().indexOf('Name'), true, 'the move buttons reorder the column');
click(menuItemNamed('Reset order'));
eq(headers(), before, 'reset order puts it back');

// The freeze menu.
click(btnNamed('Freeze'));
assert(!!menuItemNamed('No freeze'), 'the freeze menu lists a "no freeze" entry');
eq(ref.current.getLeftPinCount(), 2, 'the config default is two frozen columns');
click($$('.ft-menu-item').find((b) => b.textContent.trim() === 'Up to City'));
eq(ref.current.getLeftPinCount(), 3, 'choosing a column moves the freeze boundary');
eq($$('.ft-row[data-ct-index="0"] .ft-td[data-ct-pin="1"]').length, 3, 'and the cells follow');
click(btnNamed('Freeze'));
click(menuItemNamed('No freeze'));
eq(ref.current.getLeftPinCount(), 0, 'and it can be turned off again');

// The pin cap. The wrap is 900px and 250px has to stay scrollable, so the frozen block
// may not exceed 650px — the four columns total 525px, so all four are allowed, but a
// narrower viewport would not allow them.
group('pin caps');
eq(ref.current.getMaxLeftPinCount(), 4, 'a 900px viewport allows every column to freeze');

// ---------------------------------------------------------------- layout round-trip
group('layout round-trip');
act(() => ref.current.setLayout({ pins: { left: 2, right: 1 }, hidden: ['city'], widths: { name: 260 } }));
const saved = ref.current.getLayout();
eq(saved.pins, { left: 2, right: 1 }, 'setLayout applies the freeze boundaries');
eq(saved.hidden, ['city'], 'and the hidden set');
eq(saved.widths, { name: 260 }, 'and the widths');
assert(!headers().includes('City'), 'the hidden column really is gone');
eq($$('.ft-th')[1].style.width, '260px', 'the width really is applied');
act(() => ref.current.resetLayout());
eq(ref.current.getLayout().hidden, [], 'resetLayout clears it all');
eq(ref.current.getLeftPinCount(), 2, 'and falls back to the column config');

// ---------------------------------------------------------------- states
group('body states');
act(() => {
  root.render(React.createElement(FreezeTable, { columns, data: [], status: 'loading', height: WRAP_H }));
});
assert(!!$('.ft-spinner'), 'status="loading" shows the spinner');
assert(!$('.ft-row'), 'and no rows');
act(() => {
  root.render(React.createElement(FreezeTable, { columns, data: [], status: 'ready', height: WRAP_H }));
});
assert(container.textContent.includes('No records found'), 'status="ready" with no rows shows the empty state');
act(() => {
  root.render(React.createElement(FreezeTable, { columns, data: [], status: 'idle', height: WRAP_H }));
});
assert(!container.textContent.includes('No records found'), 'status="idle" shows neither — nothing has been fetched yet');

// ---------------------------------------------------------------- theming (1.1)
group('theme, tokens and the class/component slots');
act(() => {
  root.render(React.createElement(FreezeTable, { columns, data, height: WRAP_H, theme: 'dark' }));
});
eq($('.ft-root').getAttribute('data-ft-theme'), 'dark', 'theme="dark" stamps the root');
assert(
  !!document.getElementById('freeze-table-styles-2'),
  'the stylesheet is injected, and its id carries the schema version so two package versions cannot collide'
);
const sheetEl = document.getElementById('freeze-table-styles-2');
const sheet = sheetEl.textContent;
assert(sheet.includes('.ft-root[data-ft-theme="dark"]'), 'the sheet carries a dark block');
eq(sheetEl, document.head.firstChild, 'the sheet is inserted FIRST, so it loses source-order ties to the page CSS');

// The cascade check that matters. The base block and a consumer's `.my-class` are both
// one class deep, and this sheet arrives at MOUNT — after every stylesheet the page
// loaded — so without `:where()` the library's defaults win every tie and a consumer's
// theme is silently ignored. Asserted here against the worst case (sheet appended LAST),
// because the `:where()` is what has to carry it, not the insertion point.
group('theme: consumer CSS outranks the defaults');
const probe = document.createElement('div');
probe.innerHTML = '<div class="ft-root themed"></div><div class="ft-root"></div>';
const pageCss = document.createElement('style');
pageCss.textContent = '.themed{--ft-accent:#7c3aed}';
document.head.appendChild(pageCss);
const lateCopy = document.createElement('style');
lateCopy.textContent = sheet;
document.head.appendChild(lateCopy);
document.body.appendChild(probe);
const accentOf = (el) => window.getComputedStyle(el).getPropertyValue('--ft-accent');
eq(accentOf(probe.children[0]), '#7c3aed', 'a consumer class beats the defaults even when our sheet loads after theirs');
eq(accentOf(probe.children[1]), '#0070C2', 'and a table they did not theme still gets the default');
probe.remove();
pageCss.remove();
lateCopy.remove();
assert(sheet.includes('--ft-row-bg:var(--ft-bg, #ffffff)'), 'derived tokens chain to their core token rather than repeating a literal');
assert(!/--ft-row-bg:#/.test(sheet.split('data-ft-theme="dark"')[1] || ''), 'the dark block does not re-state a derived token, so the ladder survives');

act(() => {
  root.render(
    React.createElement(FreezeTable, {
      columns,
      data,
      height: WRAP_H,
      tokens: { accent: '#7c3aed', 'row-hover': '#faf5ff', '--ft-border': '#eee' },
    })
  );
});
eq($('.ft-root').style.getPropertyValue('--ft-accent'), '#7c3aed', 'the `tokens` prop lands as an inline custom property');
eq($('.ft-root').style.getPropertyValue('--ft-row-hover'), '#faf5ff', 'and reaches a token only a JS handler ever writes');
eq($('.ft-root').style.getPropertyValue('--ft-border'), '#eee', 'a key already carrying the --ft- prefix is accepted as-is');

// `--ft-font` has to land on `font-family`. Through the `font` shorthand a bare family
// list is invalid CSS and the browser drops it, so the token would work for exactly one
// value (`inherit`) and silently do nothing for every real font stack.
act(() => {
  root.render(React.createElement(FreezeTable, { columns, data, height: WRAP_H, tokens: { font: 'ui-monospace, Menlo, monospace' } }));
});
eq($('.ft-root').style.fontFamily, 'var(--ft-font, inherit)', 'the font token is applied as font-family, not the font shorthand');

act(() => {
  root.render(
    React.createElement(FreezeTable, {
      columns,
      data,
      height: WRAP_H,
      className: 'mine',
      classNames: { root: 'r', head: 'h', th: 't', row: 'w', cell: 'c' },
    })
  );
});
assert($('.ft-root').className.includes('ft-root') && $('.ft-root').className.includes('r'), 'a slot class joins the built-in one rather than replacing it');
assert($('.ft-root').className.indexOf('r') < $('.ft-root').className.indexOf('mine'), 'the `className` prop still comes last');
assert(!!$('.ft-head.h') && !!$('.ft-th.t') && !!$('.ft-row.w') && !!$('.ft-td.c'), 'every slot reaches its element');

let filterProps = null;
act(() => {
  root.render(
    React.createElement(FreezeTable, {
      columns,
      data,
      height: WRAP_H,
      components: {
        FilterInput: (props) => {
          filterProps = props;
          return React.createElement('input', { className: 'my-filter', readOnly: true, value: props.value });
        },
        SortIcon: null,
      },
    })
  );
});
assert(!!$('.my-filter'), 'a replaced FilterInput renders in place of the built-in');
assert(!$('.ft-filter-input'), 'and the built-in is gone');
assert(filterProps && typeof filterProps.onChange === 'function' && typeof filterProps.placeholder === 'string', 'the slot receives its documented contract');
assert(!$('.ft-th-label svg polygon'), 'a slot set to null renders nothing (sort arrows dropped)');

act(() => {
  root.render(React.createElement(FreezeTable, { columns, data, height: WRAP_H, unstyled: true }));
});
const uHead = $('.ft-head');
const uRow = $('.ft-row[data-ct-index="0"]');
const uPinned = $$('.ft-row[data-ct-index="0"] .ft-td[data-ct-pin="1"]');
eq(uHead.style.background, '', 'unstyled drops the header paint');
eq(uRow.style.backgroundColor, '', 'and the row paint');
eq(uHead.style.position, 'sticky', 'but keeps the sticky header — that is the engine, not the skin');
eq([uPinned[0].style.left, uPinned[1].style.left], ['0px', '45px'], 'and the freeze offsets are untouched');
eq(uRow.style.top, '0px', 'and the virtualized row placement');

act(() => root.unmount());

console.error = consoleError;
assert(reactErrors.length === 0, 'React logged no errors' + (reactErrors.length ? ':\n      ' + reactErrors.join('\n      ') : ''));

console.log('');
if (failed) {
  process.exitCode = 1;
  console.error(failed + ' of ' + (failed + passed) + ' DOM checks FAILED');
} else {
  console.log('all ' + passed + ' DOM checks passed');
}
