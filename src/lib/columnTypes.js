import React from 'react';
import { ELLIPSIS } from './columns';

/**
 * Column shorthands — the "you should not have to write this again" layer.
 *
 * Before this existed, every list repeated the same three or four lines per column: an
 * ellipsis `Cell` with a `title`, a right-aligned amount column with a `toLocaleString`
 * in it, a `Footer` doing `rows.reduce(...)`, a serial column doing
 * `rows.indexOf(row) + 1`, and `width: 120, minWidth: 120` on every single one because a
 * bare `width` under react-table's 90px floor was silently ignored.
 *
 * `normalizeColumns` folds all of that into two config keys — `type` and `footer` — and
 * one rule: **anything written explicitly on the column always wins.** A `type` only
 * fills in what the caller left out, so `{ type: 'currency', align: 'left' }` is a
 * left-aligned currency column, not an argument.
 */

// ---------------------------------------------------------------- value formatting

const pad2 = (n) => (n < 10 ? '0' + n : String(n));

/**
 * Anything a date column is likely to hold: a Date, an epoch number, an ISO string, or
 * the 'YYYY-MM-DD HH:mm:ss' a SQL backend hands back (which Safari refuses to parse
 * until the space becomes a 'T'). Returns null for anything else, and the caller then
 * prints the raw value rather than a confident 'Invalid Date'.
 */
export const toDate = (v) => {
  if (v == null || v === '' || v === 'NULL') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v !== 'string') return null;
  const s = /^\d{4}-\d{2}-\d{2}[ ]\d{2}:\d{2}/.test(v) ? v.replace(' ', 'T') : v;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TOKEN = /YYYY|YY|MMM|MM|DD|HH|hh|mm|ss|A/g;

/**
 * Token formatter — deliberately tiny, because pulling in a date library for this would
 * be the single largest thing in the bundle. Understands YYYY YY MMM MM DD HH mm ss, plus
 * hh/A for 12-hour clocks.
 */
export const formatDate = (date, pattern) => {
  const h24 = date.getHours();
  const map = {
    YYYY: String(date.getFullYear()),
    YY: pad2(date.getFullYear() % 100),
    MMM: MONTHS[date.getMonth()],
    MM: pad2(date.getMonth() + 1),
    DD: pad2(date.getDate()),
    HH: pad2(h24),
    hh: pad2(h24 % 12 === 0 ? 12 : h24 % 12),
    mm: pad2(date.getMinutes()),
    ss: pad2(date.getSeconds()),
    A: h24 < 12 ? 'AM' : 'PM',
  };
  return pattern.replace(TOKEN, (t) => map[t]);
};

// Intl.NumberFormat construction is expensive enough to matter when it happens once per
// cell per render, and the argument set is tiny, so they are cached by their key.
const numberFormatters = {};
const numberFormatter = (locale, min, max) => {
  const key = (locale || '') + '|' + min + '|' + max;
  if (!numberFormatters[key]) {
    numberFormatters[key] = new Intl.NumberFormat(locale || undefined, {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    });
  }
  return numberFormatters[key];
};

export const formatNumber = (value, { locale, decimals }) => {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n)) return null;
  const min = decimals == null ? 0 : decimals;
  const max = decimals == null ? 3 : decimals;
  return numberFormatter(locale, min, max).format(n);
};

// ---------------------------------------------------------------- the types

const isBlank = (v) => v == null || v === '' || v === 'NULL';

// The untyped default cell blanks a zero on purpose: these lists are financial, and a
// column of zeros is noise that hides the rows actually carrying a figure. `type: 'text'`
// keeps that (it has to stay a drop-in for no type at all), while `number` and
// `currency` show it — a formatted 0.00 in an amount column is information, not noise.
// `blankZero` overrides either way.
const blanksZero = (c, v) => {
  const dflt = c.type == null || c.type === 'text';
  return (c.blankZero === undefined ? dflt : c.blankZero) && (v === 0 || v === '0');
};

const textCell = (render) => {
  // Every typed cell is the same single-line ellipsis box with a `title`, so a value too
  // wide for its column is still readable on hover. Only the string differs.
  const Cell = ({ value, row }) => {
    const out = render(value, row);
    if (out == null || out === '') return <div style={ELLIPSIS} title="" />;
    return (
      <div style={ELLIPSIS} title={String(out)}>
        {out}
      </div>
    );
  };
  return Cell;
};

/**
 * One entry per `type`. `defaults` are merged UNDER the caller's config; `cell` builds
 * the renderer from the column's own options (so `decimals` / `dateFormat` can be set
 * per column as well as per table).
 */
const TYPES = {
  text: {
    defaults: {},
    cell: (c) => textCell((v) => (isBlank(v) || blanksZero(c, v) ? '' : v)),
  },

  number: {
    defaults: { align: 'right' },
    cell: (c, opts) =>
      textCell((v) => {
        if (isBlank(v) || blanksZero(c, v)) return '';
        const s = formatNumber(v, { locale: opts.locale, decimals: c.decimals });
        return s == null ? v : s;
      }),
  },

  currency: {
    defaults: { align: 'right' },
    cell: (c, opts) =>
      textCell((v) => {
        if (isBlank(v) || blanksZero(c, v)) return '';
        const decimals = c.decimals == null ? 2 : c.decimals;
        const s = formatNumber(v, { locale: opts.locale, decimals });
        if (s == null) return v;
        return opts.currencySymbol ? opts.currencySymbol + ' ' + s : s;
      }),
  },

  // A date column is 110px because 'DD-MM-YYYY' does not fit in the 90px default, and a
  // date-time one is 150px for the same reason — the two most common "why is my column
  // clipped" reports this package ever got.
  date: {
    defaults: { minWidth: 110 },
    cell: (c, opts) =>
      textCell((v) => {
        const d = toDate(v);
        return d ? formatDate(d, c.dateFormat || opts.dateFormat) : isBlank(v) ? '' : v;
      }),
  },

  datetime: {
    defaults: { minWidth: 150 },
    cell: (c, opts) =>
      textCell((v) => {
        const d = toDate(v);
        return d ? formatDate(d, c.dateFormat || opts.dateTimeFormat) : isBlank(v) ? '' : v;
      }),
  },

  boolean: {
    defaults: { align: 'center' },
    cell: (c) =>
      textCell((v) => {
        const yes = v === true || v === 1 || v === '1' || v === 'Y' || v === 'true' || v === 'TRUE';
        const labels = c.booleanLabels || ['✓', ''];
        return yes ? labels[0] : labels[1];
      }),
  },

  // The display-order serial number every list starts with. It counts through `rows` —
  // the FILTERED and SORTED set — so the numbering stays 1..N after any sort or search;
  // `row.index` would shuffle. It sorts and filters by nothing, because there is no
  // underlying value to sort or filter by.
  serial: {
    defaults: {
      Header: '#',
      id: '__serial',
      width: 50,
      align: 'right',
      disableFilters: true,
      disableSortBy: true,
    },
    cell: () => {
      const Cell = ({ row, rows }) => rows.indexOf(row) + 1;
      return Cell;
    },
  },
};

// ---------------------------------------------------------------- footer shorthands

const REDUCERS = {
  sum: (nums) => nums.reduce((s, n) => s + n, 0),
  avg: (nums) => (nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0),
  min: (nums) => (nums.length ? Math.min.apply(null, nums) : 0),
  max: (nums) => (nums.length ? Math.max.apply(null, nums) : 0),
};

/**
 * `footer: 'sum'` and friends. The total is computed over `info.rows`, which react-table
 * gives as the FILTERED rows — so the footer follows the search boxes, which is the whole
 * reason a `Footer` has to be a function rather than a precomputed number.
 *
 * A numeric total is formatted with the column's OWN formatter, so a currency column's
 * total lands with the same decimals and grouping as the cells above it.
 */
const buildFooter = (c, opts) => {
  const kind = c.footer;
  if (typeof kind === 'function' || React.isValidElement(kind)) return kind;
  if (kind === 'count') {
    const Footer = (info) => `Count : ${info.rows.length}`;
    return Footer;
  }
  const reduce = REDUCERS[kind];
  if (!reduce) return undefined;
  const decimals = c.decimals == null ? (c.type === 'currency' ? 2 : 0) : c.decimals;
  const Footer = (info) => {
    const id = c.id || (typeof c.accessor === 'string' ? c.accessor : undefined);
    const nums = [];
    info.rows.forEach((r) => {
      const raw = id ? r.values[id] : undefined;
      const n = typeof raw === 'number' ? raw : parseFloat(raw);
      if (Number.isFinite(n)) nums.push(n);
    });
    const total = reduce(nums);
    const s = formatNumber(total, { locale: opts.locale, decimals });
    if (s == null) return '';
    return opts.currencySymbol && c.type === 'currency' ? opts.currencySymbol + ' ' + s : s;
  };
  return Footer;
};

// ---------------------------------------------------------------- normalization

export const FORMAT_DEFAULTS = {
  locale: undefined,
  dateFormat: 'DD-MM-YYYY',
  dateTimeFormat: 'DD-MM-YYYY HH:mm',
  currencySymbol: undefined,
};

/**
 * Turn one caller column into the column react-table gets. Order of precedence, highest
 * first: what the caller wrote → what the `type` implies → react-table's own defaults.
 *
 * The one rule that applies to EVERY column, typed or not: **a `width` with no
 * `minWidth` sets the minWidth too.** react-table renders `min(max(minWidth, width),
 * maxWidth)` against a default minWidth of 90, so `{ width: 45 }` used to render 90px
 * wide and the only fix was to repeat the number. Now one number means one width.
 */
export const normalizeColumn = (c, opts, index) => {
  const type = TYPES[c.type] ? c.type : null;
  const needsWidth = c.width != null && c.minWidth == null;
  const needsCell = c.Cell == null && typeof c.format === 'function';
  const needsFooter = c.Footer == null && c.footer != null;
  // Untouched columns are returned AS THEY CAME, identity included, so a config that
  // uses none of this does not break the memo chain downstream by being re-cloned.
  if (!type && !needsWidth && !needsCell && !needsFooter) return c;

  const spec = type ? TYPES[type] : null;
  const out = spec ? { ...spec.defaults, ...c } : { ...c };

  // A width with no floor sets its own floor — see the doc comment above. `minWidth: 0`
  // is a deliberate "let it shrink", so only an ABSENT minWidth is filled in. Read from
  // the CALLER's config, not the merged column: a `type: 'date'` brings a 110px floor
  // with it, and `{ type: 'date', width: 60 }` has to mean 60, not "110 because the type
  // said so". One number always means one width.
  if (c.width != null && c.minWidth == null) out.minWidth = c.width;

  if (out.Cell == null) {
    if (typeof c.format === 'function') out.Cell = textCell((v, row) => c.format(v, row && row.original));
    else if (spec) out.Cell = spec.cell(out, opts);
  }

  if (out.Footer == null && c.footer != null) {
    const f = buildFooter(out, opts);
    if (f !== undefined) out.Footer = f;
  }

  // A serial column with no id would collide with the next one; give each its own.
  if (type === 'serial' && index > 0 && c.id == null) out.id = `__serial${index}`;

  return out;
};

/**
 * Map over the caller's columns, returning the SAME array when nothing needed changing so
 * the memo chain downstream keeps its identity.
 */
export const normalizeColumns = (columns, opts) => {
  let changed = false;
  const out = columns.map((c, i) => {
    const n = normalizeColumn(c, opts, i);
    if (n !== c) changed = true;
    return n;
  });
  return changed ? out : columns;
};
