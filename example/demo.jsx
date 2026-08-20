import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FreezeTable } from '../src';

const FIRST = ['Ramesh', 'Sunita', 'Imran', 'Priya', 'Arjun', 'Fatima', 'Rakesh', 'Neha', 'Vikram', 'Anjali'];
const LAST = ['Kumar', 'Devi', 'Ali', 'Sharma', 'Singh', 'Khan', 'Verma', 'Gupta', 'Reddy', 'Nair'];
const CITY = ['Patna', 'Ranchi', 'Kolkata', 'Delhi', 'Mumbai', 'Jaipur', 'Pune', 'Chennai', 'Indore', 'Surat'];
const STATUS = ['Active', 'Pending', 'Cancelled', 'Posted'];

// Deterministic pseudo-random so the demo looks the same on every reload.
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const ROWS = Array.from({ length: 2000 }, (_, i) => {
  const qty = 1 + Math.floor(rnd() * 9);
  const rate = Math.round(rnd() * 90000) + 10000;
  return {
    id: `row-${i + 1}`,
    name: `${pick(FIRST)} ${pick(LAST)}`,
    city: pick(CITY),
    status: pick(STATUS),
    invoice: `INV/25-26/${String(1000 + i)}`,
    date: `2026-08-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')} 10:${String(Math.floor(rnd() * 60)).padStart(2, '0')}:00`,
    model: pick(['Nexon EV', 'Creta', 'Swift', 'Scorpio N', 'Punch', 'Baleno']),
    fuel: pick(['Petrol', 'Diesel', 'Electric', 'CNG']),
    vin: `MAT${Math.floor(rnd() * 1e9).toString().padStart(9, '0')}`,
    engine: `ENG${Math.floor(rnd() * 1e7)}`,
    colour: pick(['White', 'Black', 'Silver', 'Red', 'Blue']),
    delivered: rnd() > 0.4,
    qty,
    rate,
    amount: qty * rate,
    gst: Math.round(qty * rate * 0.28),
    executive: `${pick(FIRST)} ${pick(LAST)}`,
    branch: pick(['North', 'South', 'East', 'West']),
    remarks: 'Delivered against advance receipt, balance adjusted',
  };
});

// One line per column. `type` brings the alignment, the width floor, the ellipsis cell
// and the `title` with it; `footer: 'sum'` brings the reduce AND formats the total the
// same way as the cells above it. Only what is genuinely specific to this list is here.
const COLUMNS = [
  { type: 'serial', pinned: true },
  { Header: 'Invoice No', accessor: 'invoice', width: 150, pinned: true, footer: 'count' },
  { Header: 'Customer Name', accessor: 'name', width: 180, pinned: true },
  { Header: 'Date', accessor: 'date', type: 'datetime' },
  { Header: 'Status', accessor: 'status', width: 110 },
  { Header: 'City', accessor: 'city', width: 120 },
  { Header: 'Branch', accessor: 'branch', width: 100 },
  { Header: 'Model', accessor: 'model', width: 140 },
  { Header: 'Fuel', accessor: 'fuel', width: 100 },
  { Header: 'Colour', accessor: 'colour', width: 100 },
  { Header: 'Delivered', accessor: 'delivered', type: 'boolean', width: 90 },
  { Header: 'VIN', accessor: 'vin', width: 160 },
  { Header: 'Engine No', accessor: 'engine', width: 140 },
  { Header: 'Qty', accessor: 'qty', type: 'number', width: 70, footer: 'sum' },
  { Header: 'Rate', accessor: 'rate', type: 'currency', width: 120 },
  { Header: 'Amount', accessor: 'amount', type: 'currency', width: 140, footer: 'sum' },
  { Header: 'GST', accessor: 'gst', type: 'currency', width: 130, footer: 'sum' },
  { Header: 'Sales Executive', accessor: 'executive', width: 170 },
  { Header: 'Remarks', accessor: 'remarks', width: 260, pinned: 'right' },
];

const STRIP = { Cancelled: '#e03e3e', Pending: '#e8912d', Posted: '#2aa76a' };

// Page chrome lives in demo.css now — see the note at the top of that file.
const btn = {
  font: 'inherit', fontSize: 11, padding: '3px 10px', cursor: 'pointer',
  border: '1px solid #c9d2dd', borderRadius: 4, background: '#fff', color: '#1b2733',
};

/**
 * One entry per theming layer, so the demo shows what each is actually for.
 *
 * `props` is spread straight onto <FreezeTable>. Everything visual that these presets
 * reach lives in demo.css — the point is that a consumer re-themes this component from
 * their own stylesheet, without forking it and without a prop per colour.
 */
const PRESETS = {
  Default: {
    note: 'Nothing set. This is what `npm i freeze-table` gives you.',
    props: {},
  },
  Dark: {
    note: 'theme="dark" — the built-in palette. One prop.',
    props: { theme: 'dark' },
    darkPage: true,
  },
  Auto: {
    note: 'theme="auto" — follows prefers-color-scheme. Flip your OS appearance to see it.',
    props: { theme: 'auto' },
  },
  Brand: {
    note: 'A class on the root, and demo.css sets eight CORE tokens. Header, rows, menus, buttons, filter boxes and the frozen-column shadow all follow — that is the token ladder.',
    props: { classNames: { root: 'demo-brand' } },
  },
  ERP: {
    note: 'Same tokens, opposite century: radius 0, hairline separators, a mono font, amber accent. Tokens carry SHAPE and ELEVATION, not just colour.',
    props: { classNames: { root: 'demo-erp' }, rowHeight: 28, fontSize: 11 },
  },
  'Custom CSS': {
    note: 'The `classNames` prop, styled from demo.css: gradient toolbar, uppercase headers, an inset bar on row hover. Note the row BACKGROUND still comes from a token — a class cannot beat an inline style.',
    props: {
      classNames: {
        root: 'demo-css-root',
        toolbar: 'demo-css-toolbar',
        th: 'demo-css-th',
        row: 'demo-css-row',
        cell: 'demo-css-cell',
        foot: 'demo-css-foot',
      },
    },
  },
  Slots: {
    note: 'The `components` prop: our own filter input, toolbar button, spinner and empty state. This is the layer for "make it look like MY design system" — no CSS involved.',
    props: {
      components: {
        FilterInput: ({ value, onChange, onClick, placeholder }) => (
          <input
            value={value}
            onChange={onChange}
            onClick={onClick}
            placeholder={placeholder}
            style={{
              width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 10,
              padding: '3px 6px', border: 0, borderBottom: '2px solid #0ea5e9',
              background: '#f0f9ff', outline: 'none', borderRadius: '3px 3px 0 0',
            }}
          />
        ),
        Button: ({ children, ...rest }) => (
          <button
            type="button"
            {...rest}
            style={{
              font: 'inherit', fontSize: 11, fontWeight: 600, padding: '4px 12px',
              border: 0, borderRadius: 999, cursor: 'pointer',
              background: '#0f172a', color: '#f8fafc',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {children}
          </button>
        ),
        Empty: ({ text }) => (
          <div style={{ font: '600 14px system-ui, sans-serif', color: '#0ea5e9' }}>◦ {text} ◦</div>
        ),
        Spinner: ({ text }) => (
          <div style={{ font: '600 13px system-ui, sans-serif', color: '#0ea5e9' }}>{text}</div>
        ),
        // A slot set to null renders nothing at all.
        SortIcon: null,
      },
    },
  },
  Unstyled: {
    note: 'unstyled — the table paints nothing; every visual is demo.css. The freeze and the virtualization are untouched (scroll sideways). Note that .demo-bare-row MUST set a background, or the scrolling columns show through the frozen block.',
    props: {
      unstyled: true,
      classNames: {
        head: 'demo-bare-head',
        th: 'demo-bare-th',
        row: 'demo-bare-row',
        cell: 'demo-bare-cell',
        foot: 'demo-bare-foot',
        footCell: 'demo-bare-foot-cell',
        empty: 'demo-bare-empty',
      },
    },
  },
};
const PRESET_NAMES = Object.keys(PRESETS);

// The Action column's renderer. `context` is forwarded onto the table instance, so a
// cell can reach the caller's callbacks without the column config being rebuilt as a
// factory closure on every render.
const Actions = ({ object, fn }) => (
  <button type="button" style={btn} onClick={() => fn(object)}>Open</button>
);

function Demo() {
  const tableRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('ready');
  const [empty, setEmpty] = useState(false);
  const [saved, setSaved] = useState(null);
  const [preset, setPreset] = useState('Default');

  const active = PRESETS[preset];
  const columns = useMemo(() => COLUMNS, []);
  const data = useMemo(() => (empty ? [] : ROWS), [empty]);

  return (
    <div className="demo-page" data-dark={active.darkPage ? '1' : undefined}>
      <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>freeze-table</h1>
      <p className="demo-muted" style={{ margin: '0 0 14px' }}>
        2,000 rows · 19 columns · <strong>Columns</strong> aur <strong>Freeze</strong> menu table ka apna hai
        (koi menu code likhna nahi pada) · header ko side mein drag karo to column move hota hai ·
        right edge drag karke resize (double-click = reset) · arrow keys / Home / End / Enter chalte hain.
      </p>

      {/* The four theming layers, one preset each. Everything they set lives in demo.css. */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
        <strong style={{ fontSize: 11, marginRight: 4 }}>Theme:</strong>
        {PRESET_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            className="demo-btn"
            aria-pressed={preset === name}
            onClick={() => setPreset(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="demo-note">{active.note}</p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 10px' }}>
        <button type="button" className="demo-btn" aria-pressed={status === 'loading'} onClick={() => setStatus((s) => (s === 'loading' ? 'ready' : 'loading'))}>
          Loading state
        </button>
        <button type="button" className="demo-btn" aria-pressed={empty} onClick={() => setEmpty((v) => !v)}>Empty state</button>
        <span style={{ width: 16 }} />
        {/* The whole layout — both freeze boundaries, every dragged width, the hidden set
            and the order — as one object a caller can store per user. */}
        <button type="button" className="demo-btn" onClick={() => setSaved(tableRef.current.getLayout())}>Save view</button>
        <button type="button" className="demo-btn" disabled={!saved} onClick={() => tableRef.current.setLayout(saved)}>Restore view</button>
        <button type="button" className="demo-btn" onClick={() => tableRef.current.resetLayout()}>Reset layout</button>
        <span className="demo-muted" style={{ marginLeft: 'auto' }}>
          Selected: <strong>{selected ? `${selected.invoice} — ${selected.name}` : '—'}</strong>
        </span>
      </div>

      <div className="demo-frame">
        <FreezeTable
          // Remounts on a preset change so `unstyled` and the slot swaps are unambiguous
          // to look at. In an app the props are simply reactive — no key needed.
          key={preset}
          ref={tableRef}
          columns={columns}
          data={data}
          height={560}
          rowHeight={38}
          fontSize={12}
          status={empty ? 'ready' : status}
          toolbar={{ left: <strong>Vehicle invoices</strong> }}
          locale="en-IN"
          currencySymbol="₹"
          pinStorageKey="freeze-table-demo"
          Actions={Actions}
          fn={(row) => setSelected(row)}
          rowStripColor={(r) => STRIP[r.status] || null}
          rowStripTitle={(r) => r.status}
          rowStyle={(r) => (r.status === 'Cancelled' ? { color: '#a11' } : undefined)}
          onRowSelect={(row) => setSelected(row)}
          onRowEnter={(row) => setSelected(row)}
          {...active.props}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Demo />);
