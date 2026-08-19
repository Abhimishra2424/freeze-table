import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RealTable, ELLIPSIS } from '../src';

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
    date: `${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}-08-2026`,
    model: pick(['Nexon EV', 'Creta', 'Swift', 'Scorpio N', 'Punch', 'Baleno']),
    fuel: pick(['Petrol', 'Diesel', 'Electric', 'CNG']),
    vin: `MAT${Math.floor(rnd() * 1e9).toString().padStart(9, '0')}`,
    engine: `ENG${Math.floor(rnd() * 1e7)}`,
    colour: pick(['White', 'Black', 'Silver', 'Red', 'Blue']),
    qty,
    rate,
    amount: qty * rate,
    gst: Math.round(qty * rate * 0.28),
    executive: `${pick(FIRST)} ${pick(LAST)}`,
    branch: pick(['North', 'South', 'East', 'West']),
    remarks: 'Delivered against advance receipt, balance adjusted',
  };
});

const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const text = (v) => <div style={ELLIPSIS} title={String(v == null ? '' : v)}>{v}</div>;
const money = (v) => <div style={{ ...ELLIPSIS, fontVariantNumeric: 'tabular-nums' }}>{inr(v)}</div>;
const total = (key) => (info) => inr(info.rows.reduce((s, r) => s + Number(r.values[key] || 0), 0));

const COLUMNS = [
  { Header: '#', id: 'sl', width: 50, minWidth: 50, align: 'right', pinned: true, disableFilters: true, disableSortBy: true,
    Cell: ({ row, rows }) => rows.indexOf(row) + 1 },
  { Header: 'Invoice No', accessor: 'invoice', width: 150, minWidth: 150, pinned: true, Cell: ({ value }) => text(value),
    Footer: (info) => `${info.rows.length} rows` },
  { Header: 'Customer Name', accessor: 'name', width: 180, minWidth: 180, pinned: true, Cell: ({ value }) => text(value) },
  { Header: 'Date', accessor: 'date', width: 110, minWidth: 110, Cell: ({ value }) => text(value) },
  { Header: 'Status', accessor: 'status', width: 110, minWidth: 110, Cell: ({ value }) => text(value) },
  { Header: 'City', accessor: 'city', width: 120, minWidth: 120, Cell: ({ value }) => text(value) },
  { Header: 'Branch', accessor: 'branch', width: 100, minWidth: 100, Cell: ({ value }) => text(value) },
  { Header: 'Model', accessor: 'model', width: 140, minWidth: 140, Cell: ({ value }) => text(value) },
  { Header: 'Fuel', accessor: 'fuel', width: 100, minWidth: 100, Cell: ({ value }) => text(value) },
  { Header: 'Colour', accessor: 'colour', width: 100, minWidth: 100, Cell: ({ value }) => text(value) },
  { Header: 'VIN', accessor: 'vin', width: 160, minWidth: 160, Cell: ({ value }) => text(value) },
  { Header: 'Engine No', accessor: 'engine', width: 140, minWidth: 140, Cell: ({ value }) => text(value) },
  { Header: 'Qty', accessor: 'qty', width: 70, minWidth: 70, align: 'right', Footer: total('qty') },
  { Header: 'Rate', accessor: 'rate', width: 120, minWidth: 120, align: 'right', Cell: ({ value }) => money(value) },
  { Header: 'Amount', accessor: 'amount', width: 140, minWidth: 140, align: 'right', Cell: ({ value }) => money(value), Footer: total('amount') },
  { Header: 'GST', accessor: 'gst', width: 130, minWidth: 130, align: 'right', Cell: ({ value }) => money(value), Footer: total('gst') },
  { Header: 'Sales Executive', accessor: 'executive', width: 170, minWidth: 170, Cell: ({ value }) => text(value) },
  { Header: 'Remarks', accessor: 'remarks', width: 260, minWidth: 260, Cell: ({ value }) => text(value) },
];

const STRIP = { Cancelled: '#e03e3e', Pending: '#e8912d', Posted: '#2aa76a' };

const Actions = ({ object, fn }) => (
  <button type="button" style={btn} onClick={() => fn(object)}>Open</button>
);

const btn = {
  font: 'inherit', fontSize: 11, padding: '3px 10px', cursor: 'pointer',
  border: '1px solid #c9d2dd', borderRadius: 4, background: '#fff', color: '#1b2733',
};
const btnActive = { ...btn, background: '#0070C2', borderColor: '#0070C2', color: '#fff' };

function Demo() {
  const tableRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState(3);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);

  const columns = useMemo(() => COLUMNS, []);
  const data = useMemo(() => (empty ? [] : ROWS), [empty]);

  const applyPin = (n) => {
    setPin(n);
    if (tableRef.current) {
      tableRef.current.setPinCount(n);
      tableRef.current.focus();
    }
  };

  return (
    <div style={{ font: '13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', color: '#1b2733', padding: 20, background: '#f7f9fb', minHeight: '100vh' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>real-table</h1>
      <p style={{ margin: '0 0 14px', color: '#5a6a7a' }}>
        2,000 rows · 18 columns · horizontal scroll ke waqt pehle {pin} column freeze ·
        arrow keys / Home / End / Enter chalte hain (table pe click karke try karo).
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ color: '#5a6a7a' }}>Pin columns:</span>
        {[0, 1, 2, 3].map((n) => (
          <button key={n} type="button" style={pin === n ? btnActive : btn} onClick={() => applyPin(n)}>
            {n === 0 ? 'No pin' : `First ${n}`}
          </button>
        ))}
        <span style={{ width: 12 }} />
        <button type="button" style={loading ? btnActive : btn} onClick={() => setLoading((v) => !v)}>Loading state</button>
        <button type="button" style={empty ? btnActive : btn} onClick={() => setEmpty((v) => !v)}>Empty state</button>
        <span style={{ marginLeft: 'auto', color: '#5a6a7a' }}>
          Selected: <strong>{selected ? `${selected.invoice} — ${selected.name}` : '—'}</strong>
        </span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e3e8ee', borderRadius: 6, overflow: 'hidden' }}>
        <RealTable
          ref={tableRef}
          columns={columns}
          data={data}
          height={560}
          rowHeight={38}
          fontSize={12}
          loading={loading}
          dataFetched={!loading}
          pinStorageKey="real-table-demo"
          Actions={Actions}
          fn={(row) => setSelected(row)}
          rowStripColor={(r) => STRIP[r.status] || null}
          rowStripTitle={(r) => r.status}
          rowStyle={(r) => (r.status === 'Cancelled' ? { color: '#a11' } : undefined)}
          onRowSelect={(row) => setSelected(row)}
          onRowEnter={(row) => setSelected(row)}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Demo />);
