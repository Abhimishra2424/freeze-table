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

const btn = {
  font: 'inherit', fontSize: 11, padding: '3px 10px', cursor: 'pointer',
  border: '1px solid #c9d2dd', borderRadius: 4, background: '#fff', color: '#1b2733',
};
const btnActive = { ...btn, background: '#0070C2', borderColor: '#0070C2', color: '#fff' };

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

  const columns = useMemo(() => COLUMNS, []);
  const data = useMemo(() => (empty ? [] : ROWS), [empty]);

  return (
    <div style={{ font: '13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', color: '#1b2733', padding: 20, background: '#f7f9fb', minHeight: '100vh' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>freeze-table</h1>
      <p style={{ margin: '0 0 14px', color: '#5a6a7a' }}>
        2,000 rows · 19 columns · <strong>Columns</strong> aur <strong>Freeze</strong> menu table ka apna hai
        (koi menu code likhna nahi pada) · header ko side mein drag karo to column move hota hai ·
        right edge drag karke resize (double-click = reset) · arrow keys / Home / End / Enter chalte hain.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <button type="button" style={status === 'loading' ? btnActive : btn} onClick={() => setStatus((s) => (s === 'loading' ? 'ready' : 'loading'))}>
          Loading state
        </button>
        <button type="button" style={empty ? btnActive : btn} onClick={() => setEmpty((v) => !v)}>Empty state</button>
        <span style={{ width: 16 }} />
        {/* The whole layout — both freeze boundaries, every dragged width, the hidden set
            and the order — as one object a caller can store per user. */}
        <button type="button" style={btn} onClick={() => setSaved(tableRef.current.getLayout())}>Save view</button>
        <button type="button" style={btn} disabled={!saved} onClick={() => tableRef.current.setLayout(saved)}>Restore view</button>
        <button type="button" style={btn} onClick={() => tableRef.current.resetLayout()}>Reset layout</button>
        <span style={{ marginLeft: 'auto', color: '#5a6a7a' }}>
          Selected: <strong>{selected ? `${selected.invoice} — ${selected.name}` : '—'}</strong>
        </span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e3e8ee', borderRadius: 6, overflow: 'hidden' }}>
        <FreezeTable
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
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Demo />);
