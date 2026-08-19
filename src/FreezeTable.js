import React from 'react';
import { useFilters, useFlexLayout, useSortBy, useTable } from 'react-table';
import { FilterInput, InboxIcon, PinIcon, SortIcon, Spinner, injectStyles, useIsoLayoutEffect } from './internal-ui';

// Shared single-line ellipsis style for cells (kept here so callers can reuse it).
export const ELLIPSIS = {
  width: '100%',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const alignFlex = (a) => (a === 'right' ? 'flex-end' : a === 'center' ? 'center' : 'flex-start');

// react-table's effective column width: min(max(minWidth, width), maxWidth). Used both for
// the pin cap and for the sticky `left` offset of each pinned column.
const colWidthOf = (c) =>
  Math.min(
    Math.max(c.minWidth != null ? c.minWidth : 90, c.width != null ? c.width : 1),
    c.maxWidth != null ? c.maxWidth : Infinity
  );

// The id react-table will key a column by: an explicit `id`, else a string accessor.
// A column with neither (an accessor FUNCTION and no id) cannot be addressed by the
// width / visibility APIs — react-table rejects such a column outright, so this is not
// a restriction this component adds.
const colIdOf = (c) => c.id || (typeof c.accessor === 'string' ? c.accessor : undefined);

// Smallest width a drag can leave a column at. Below roughly this the header label and
// the filter box have nowhere to go and the column stops being a usable hit target.
const COL_MIN_WIDTH = 48;

// How many rows to render above / below the viewport.
const OVERSCAN = 6;

// Minimum viewport width that must stay available for the SCROLLING (unpinned)
// columns — the pin cap keeps the frozen block at least this much narrower than the
// table. See the maxPinCount comment for why exceeding it breaks the scroller.
const PIN_MIN_SCROLLABLE = 250;

// Memoized windowed row. Selection changes do NOT re-render rows: the row reads the
// selected index from a ref for its initial paint, and the selection-highlight effect in
// FreezeTable updates row backgrounds imperatively (via data-ct-* attributes). Without
// this, every ↑/↓ press re-rendered all visible rows (each with icon-heavy action
// cells), which made arrow navigation visibly laggy on wide lists.
const VirtualRow = React.memo(function VirtualRow({ data, index }) {
  const { rows, prepareRow, rowStyle, selectedBg, rowNavigation, fontPx, selectedIndexRef, onSelect, rowHeight, pinnedLeft, pinnedRight, rowSnap } = data;
  const style = { position: 'absolute', top: index * rowHeight, left: 0, width: '100%', height: rowHeight };
  const row = rows[index];
  prepareRow(row);
  const { key: rowKey, ...rowProps } = row.getRowProps({ style });
  const custom = (rowStyle && rowStyle(row.original)) || {};
  const customBg = custom.backgroundColor || '';
  const isSelected = rowNavigation && index === selectedIndexRef.current;
  // A status tint wins over the selection/hover highlight: it carries business
  // meaning (cancelled, failed to post) that must not be masked by a blue row.
  const baseBg = customBg || (isSelected ? selectedBg : '#ffffff');
  return (
    <div
      key={rowKey}
      {...rowProps}
      className="ft-row ct-row"
      data-ct-index={index}
      data-ct-bg={customBg || '#ffffff'}
      data-ct-custom={customBg ? '1' : ''}
      onMouseEnter={(e) => {
        if (index !== selectedIndexRef.current && !customBg) e.currentTarget.style.backgroundColor = '#eef4fb';
      }}
      onMouseLeave={(e) => {
        const sel = rowNavigation && index === selectedIndexRef.current;
        e.currentTarget.style.backgroundColor = customBg || (sel ? selectedBg : '#ffffff');
      }}
      onClick={() => onSelect(index)}
      style={{
        ...rowProps.style,
        color: custom.color,
        backgroundColor: baseBg,
        borderBottom: '1px solid #edf0f3',
        cursor: 'default',
        // Snap target — see the scrollSnapType/scrollPaddingTop pair on .ft-wrap.
        scrollSnapAlign: rowSnap ? 'start' : undefined,
      }}
    >
      {row.cells.map((cell) => {
        const { key: cellKey, ...cellProps } = cell.getCellProps();
        const pinned = cell.column.pinned;
        const pinnedR = cell.column.pinnedRight;
        // Frozen by the browser, not by JS: sticky offsets are resolved against .ft-wrap,
        // the single scrollport for both axes.
        return (
          <div
            key={cellKey}
            {...cellProps}
            className="ft-td ct-td"
            data-ct-pin={pinned || pinnedR ? '1' : undefined}
            data-ct-pin-last={pinned && cell.column.pinnedLast ? '1' : undefined}
            data-ct-pin-right-first={pinnedR && cell.column.pinnedRightFirst ? '1' : undefined}
            style={{
              ...cellProps.style,
              display: 'flex',
              alignItems: 'center',
              justifyContent: alignFlex(cell.column.align),
              padding: cell.column.noPadding ? 0 : '0 12px',
              fontSize: fontPx,
              overflow: 'hidden',
              textAlign: cell.column.align || 'left',
              // `background: inherit` tracks the row's imperative bg changes
              // (selection / hover / status tint) with zero extra bookkeeping.
              ...(pinned || pinnedR
                ? {
                    position: 'sticky',
                    ...(pinned
                      ? { left: pinnedLeft[cell.column.id] || 0 }
                      : { right: pinnedRight[cell.column.id] || 0 }),
                    zIndex: 2,
                    background: 'inherit',
                  }
                : {}),
            }}
          >
            {cell.render('Cell')}
          </div>
        );
      })}
    </div>
  );
});

/**
 * FreezeTable — a single, self-contained virtualized react-table list component.
 *
 * Layout is flexbox + inline styles only, and the few UI atoms it needs (sort arrows,
 * pin marker, filter box, spinner, empty-state glyph) are inline SVG, so the package
 * pulls in no UI library and needs no CSS import.
 *
 * Features:
 *   - per-column search boxes (react-table useFilters)
 *   - clickable column headers with sort arrows (useSortBy, three-state)
 *   - sticky header + sticky totals footer, hand-rolled row windowing for large lists
 *   - frozen (pinned) leading columns via native `position: sticky`
 *   - keyboard row navigation (↑/↓/Home/End/Enter) and hover/selection highlighting
 *   - an optional Action column appended on the right
 *
 * Column config (simple, no CSS classes needed):
 *   {
 *     Header,                 // string | node
 *     accessor,               // field key (or accessor fn, which needs an `id`)
 *     Cell?,                  // react-table Cell renderer, default shows the raw value
 *     width?,                 // px (default 1 — i.e. effectively minWidth)
 *     minWidth?,              // px (default 90)
 *     align?,                 // 'left' | 'center' | 'right' (default 'left')
 *     disableFilters?,        // hide this column's search box
 *     disableSortBy?,         // disable sorting for this column
 *     Footer?,                // string | node | fn(tableInstance) — per-column totals
 *     noPadding?,             // drop the default cell padding (used by the status strip)
 *     hidden?,                // DEFAULT visibility — true = start hidden. The user's
 *                             // choice lives in state (ref: toggleColumn / setHiddenColumns)
 *                             // and persists under `ctHide:<pinStorageKey>`.
 *     hideable?,              // false = this column can never be hidden (a key column)
 *     disableResizing?,       // false-y by default: every column but the status strip
 *                             // carries a drag grip on its right edge unless `resizable`
 *                             // is off. A dragged width persists under `ctW:<pinStorageKey>`.
 *     pinned?,                // DEFAULT freeze state for this column. Only a LEADING
 *                             // run counts (col 1..N all pinned); the status strip
 *                             // auto-pins with them. The user changes the boundary at
 *                             // runtime through the imperative setPinCount(n); pass
 *                             // `pinStorageKey` to persist that choice in localStorage
 *                             // (`ctPin:<key>`).
 *   }
 *
 * Cells can resolve extra data via `cell.userList` (the `userList` prop is forwarded
 * onto the table instance).
 *
 * Per-row status colouring (both optional, and independent of each other):
 *   - `rowStripColor(rowData) => color | null` prepends a narrow left-edge column
 *     showing a coloured bar per row. Falsy => no bar. `rowStripTitle(rowData) => string`
 *     (optional) adds a hover tooltip on the strip cell naming the status.
 *   - `rowStyle(rowData) => ({ backgroundColor?, color? })` tints the whole row.
 *     A returned backgroundColor wins over the selection and hover highlights, so a
 *     status colour is never masked; rows without a tint highlight as usual.
 *
 * Restoring position on re-entry (e.g. list -> edit -> back): pass `initialSelectedId`
 * for the vertical scroll + row highlight, and `initialScrollLeft` for the horizontal
 * one. Both apply once, after the rows load. Read the current horizontal offset to
 * stash with the imperative `getScrollLeft()` before navigating away.
 */
export const FreezeTable = React.forwardRef(function FreezeTable(
  {
    columns,
    data,
    Actions,
    fn,
    height = 500,
    rowHeight = 44,
    userList,
    sortable = true,
    searchable = true,
    loading = false,
    dataFetched = true,
    emptyText = 'No records found',
    loadingText = 'Fetching records…',
    actionWidth = 110,
    footerLeft = null,
    showFooter,
    rowNavigation = true,
    rowSnap = false,
    pinActions = false,
    onRowSelect,
    onRowEnter,
    selectedBg = '#d3e5f8',
    rowIdKey = 'id',
    initialSelectedId = null,
    rowStripColor,
    rowStripTitle,
    rowStyle,
    stripWidth = 14,
    initialScrollLeft = 0,
    fontSize = 12,
    pinStorageKey,
    resizable = true,
    minColumnWidth = COL_MIN_WIDTH,
    onColumnResize,
    onColumnVisibilityChange,
    className,
    style,
  },
  ref
) {
  // One <style> tag for the handful of things inline styles cannot express
  // (keyframes, :focus, ::placeholder, the pinned-column shadow selector).
  useIsoLayoutEffect(() => {
    injectStyles();
  }, []);

  const fontPx = `${parseFloat(fontSize)}px`;
  const DefaultCell = React.useCallback(({ value }) => {
    const show = value !== undefined && value !== null && value !== 'NULL' && value !== 0 && value !== '0';
    return (
      <div style={ELLIPSIS} title={show ? String(value) : ''}>
        {show ? value : ''}
      </div>
    );
  }, []);

  const DefaultColumnFilter = React.useCallback(({ column: { filterValue, setFilter, preFilteredRows } }) => {
    return (
      <FilterInput
        value={filterValue || ''}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setFilter(e.target.value || undefined)}
        placeholder={`Search ${preFilteredRows.length}...`}
      />
    );
  }, []);

  const defaultColumn = React.useMemo(
    () => ({ Cell: DefaultCell, Filter: DefaultColumnFilter, Footer: () => null, minWidth: 90, width: 1 }),
    [DefaultCell, DefaultColumnFilter]
  );

  // The outer scroller ref — declared early because the pin-cap logic below needs
  // the wrap's measured width before the column defs are built.
  const containerRef = React.useRef(null);
  const [wrapW, setWrapW] = React.useState(0);
  useIsoLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const update = () => setWrapW(el.clientWidth);
    update();
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    window.addEventListener('resize', update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // ----- Persisted layout state -----
  // Three separate user choices ride on the same `pinStorageKey`, each in its own
  // localStorage entry: the freeze boundaries (`ctPin:` / `ctPinR:`, plain numbers), the
  // dragged column widths (`ctW:`, an id -> px map) and the hidden columns (`ctHide:`, a
  // list of ids). Without the key nothing is persisted and every choice is per-mount.
  const readStored = (key) => {
    if (!pinStorageKey) return null;
    try {
      const v = window.localStorage.getItem(`${key}:${pinStorageKey}`);
      if (v != null && v !== '') {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n) && n >= 0) return n;
      }
    } catch (e) { /* storage unavailable — fall back to config default */ }
    return null;
  };
  const readStoredJson = (key) => {
    if (!pinStorageKey) return null;
    try {
      const v = window.localStorage.getItem(`${key}:${pinStorageKey}`);
      if (v) {
        const parsed = JSON.parse(v);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) { /* unreadable or no longer JSON — fall back to the config default */ }
    return null;
  };
  const persist = React.useCallback(
    (key, value) => {
      if (!pinStorageKey) return;
      try {
        window.localStorage.setItem(
          `${key}:${pinStorageKey}`,
          typeof value === 'object' ? JSON.stringify(value) : String(value)
        );
      } catch (e) { /* ignore */ }
    },
    [pinStorageKey]
  );

  // ----- Column widths and column visibility -----
  // Both follow the same shape as the pin boundary: the column config carries the
  // DEFAULT (`width` / `minWidth`, `hidden`), the user's choice lives in state here and
  // is applied on top. `hideable: false` locks a column visible (a key column the list
  // is unusable without); `disableResizing` drops its drag grip.
  const [colWidths, setColWidths] = React.useState(() => readStoredJson('ctW') || {});
  const lockedIds = React.useMemo(
    () => new Set(columns.filter((c) => c.hideable === false).map(colIdOf).filter(Boolean)),
    [columns]
  );
  const defaultHidden = React.useMemo(
    () => columns.filter((c) => c.hidden && c.hideable !== false).map(colIdOf).filter(Boolean),
    [columns]
  );
  const [userHidden, setUserHidden] = React.useState(() => {
    const stored = readStoredJson('ctHide');
    return Array.isArray(stored) ? stored : null;
  });
  const hiddenIds = userHidden != null ? userHidden : defaultHidden;

  // The caller's columns as they are actually laid out: hidden ones dropped, resized ones
  // carrying their new width. EVERYTHING downstream — the pin defaults, the pin caps,
  // `pinIndex`, the sticky offsets — is computed from this list rather than from the
  // `columns` prop, so a hidden column simply does not exist as far as freezing and the
  // cumulative left/right offsets are concerned.
  //
  // A resize writes the same number into ALL THREE of width / minWidth / maxWidth,
  // because react-table renders a column at `min(max(minWidth, width), maxWidth)`:
  // writing only `width` would leave a column with `minWidth: 200` stuck at 200 however
  // far left it was dragged, and a column with a `maxWidth` could not be widened past it.
  // Setting all three collapses that expression to exactly the dragged number — the
  // config's floor and ceiling are the DEFAULT, and an explicit drag outranks them.
  const cols = React.useMemo(() => {
    const hide = new Set(hiddenIds);
    const out = [];
    columns.forEach((c) => {
      const id = colIdOf(c);
      if (id && c.hideable !== false && hide.has(id)) return;
      const w = id ? colWidths[id] : undefined;
      out.push(w ? { ...c, width: w, minWidth: w, maxWidth: w } : c);
    });
    // Hiding literally every column would leave react-table with nothing to render — and
    // no header row to un-hide anything from. Falling back to the full list keeps the
    // table recoverable instead of blank.
    return out.length ? out : columns;
  }, [columns, hiddenIds, colWidths]);

  // Latest-value mirrors: the setters below are called from pointer handlers and from the
  // imperative ref, both of which can hold a closure from an older render.
  const colWidthsRef = React.useRef(colWidths);
  colWidthsRef.current = colWidths;
  const hiddenRef = React.useRef(hiddenIds);
  hiddenRef.current = hiddenIds;

  const setColumnWidth = React.useCallback(
    (id, px) => {
      if (!id) return;
      const w = Math.max(minColumnWidth, Math.round(parseFloat(px) || 0));
      const next = { ...colWidthsRef.current, [id]: w };
      colWidthsRef.current = next;
      setColWidths(next);
      persist('ctW', next);
      if (onColumnResize) onColumnResize(id, w, next);
    },
    [persist, minColumnWidth, onColumnResize]
  );

  // No id = clear every override and fall back to the configured widths.
  const resetColumnWidths = React.useCallback(
    (id) => {
      let next;
      if (id == null) next = {};
      else {
        next = { ...colWidthsRef.current };
        delete next[id];
      }
      colWidthsRef.current = next;
      setColWidths(next);
      persist('ctW', next);
      if (onColumnResize) onColumnResize(id == null ? null : id, null, next);
    },
    [persist, onColumnResize]
  );

  const setHiddenColumns = React.useCallback(
    (ids) => {
      const next = Array.from(new Set((ids || []).filter((id) => id && !lockedIds.has(id))));
      hiddenRef.current = next;
      setUserHidden(next);
      persist('ctHide', next);
      if (onColumnVisibilityChange) onColumnVisibilityChange(next);
    },
    [persist, lockedIds, onColumnVisibilityChange]
  );

  const toggleColumn = React.useCallback(
    (id, visible) => {
      if (!id) return;
      const isHidden = hiddenRef.current.indexOf(id) >= 0;
      const show = visible === undefined ? isHidden : !!visible;
      setHiddenColumns(show ? hiddenRef.current.filter((x) => x !== id) : hiddenRef.current.concat(id));
    },
    [setHiddenColumns]
  );

  // ----- Which columns are pinned -----
  // The `pinned: true` flags in the column config are only the DEFAULT. The whole
  // choice is a single number: how many leading columns are frozen (freezing only
  // makes sense as a leading run — a frozen middle column would have its left
  // neighbours scroll away underneath it). The caller changes it at runtime through
  // the imperative setPinCount(n). Persisted per list via `pinStorageKey`.
  // `pinned: true` / `pinned: 'left'` freeze from the left, `pinned: 'right'` from the
  // right. Only the LEADING run counts on the left and only the TRAILING run on the
  // right — a frozen column in the middle would have its neighbours scroll out from
  // under it, so each side is fully described by a single count.
  const defaultPinCount = React.useMemo(() => {
    let n = 0;
    for (const c of cols) {
      if (c.pinned && c.pinned !== 'right') n++;
      else break;
    }
    return n;
  }, [cols]);
  const defaultRightPinCount = React.useMemo(() => {
    let n = 0;
    for (let i = cols.length - 1; i >= 0; i--) {
      if (cols[i].pinned === 'right') n++;
      else break;
    }
    return n;
  }, [cols]);
  const [userPinCount, setUserPinCount] = React.useState(() => readStored('ctPin'));
  const [userRightPinCount, setUserRightPinCount] = React.useState(() => readStored('ctPinR'));
  const pinCount = userPinCount != null ? userPinCount : defaultPinCount;
  const rightPinCount = userRightPinCount != null ? userRightPinCount : defaultRightPinCount;

  // HARD CAP: the pinned block must never be as wide as the viewport. Beyond that
  // there is no room left to actually read the scrolling columns, and the frozen
  // block starts fighting the scroller instead of helping. Capping also matches the
  // UX reality of "freeze panes" in any spreadsheet.
  // The right block is measured first (it is usually one or two columns, and the Action
  // column rides along with it), then whatever viewport is left funds the left block.
  const maxRightPinCount = React.useMemo(() => {
    if (!wrapW) return cols.length;
    const budget = wrapW - PIN_MIN_SCROLLABLE;
    let used = Actions ? actionWidth : 0;
    let n = 0;
    for (let i = cols.length - 1; i >= 0; i--) {
      used += colWidthOf(cols[i]);
      if (used > budget) break;
      n++;
    }
    return n;
  }, [cols, wrapW, Actions, actionWidth]);
  const effectiveRightPinCount = Math.min(rightPinCount, maxRightPinCount);

  // The Action column freezes when the right block is non-empty, or on its own via
  // `pinActions` — keeping the row's controls reachable is the commonest reason to
  // want anything frozen on the right at all.
  const actionsPinned = !!Actions && (pinActions || effectiveRightPinCount > 0);

  const rightBlockWidth = React.useMemo(() => {
    let w = actionsPinned ? actionWidth : 0;
    for (let i = cols.length - effectiveRightPinCount; i < cols.length; i++) w += colWidthOf(cols[i]);
    return w;
  }, [cols, effectiveRightPinCount, actionsPinned, actionWidth]);

  const maxPinCount = React.useMemo(() => {
    if (!wrapW) return cols.length; // not measured yet — cap kicks in right after mount
    const colW = colWidthOf;
    const budget = wrapW - PIN_MIN_SCROLLABLE - rightBlockWidth;
    let used = rowStripColor ? stripWidth : 0;
    let n = 0;
    for (const c of cols) {
      used += colW(c);
      if (used > budget) break;
      n++;
    }
    return Math.min(n, cols.length - effectiveRightPinCount);
  }, [cols, wrapW, rowStripColor, stripWidth, rightBlockWidth, effectiveRightPinCount]);
  const effectivePinCount = Math.min(pinCount, maxPinCount);

  const setPinCount = React.useCallback(
    (n) => {
      setUserPinCount(n);
      persist('ctPin', n);
    },
    [persist]
  );
  const setRightPinCount = React.useCallback(
    (n) => {
      setUserRightPinCount(n);
      persist('ctPinR', n);
    },
    [persist]
  );

  // Append the Action column (as a real column) when an Actions renderer is given.
  const allColumns = React.useMemo(() => {
    // pinIndex = the column's position among the caller's VISIBLE columns — the pin UI
    // uses it to set the freeze boundary ("pin up to here" = pinCount pinIndex+1).
    // Hidden columns are already gone from `cols`, so both the index and the freeze
    // counts speak in terms of what is actually on screen.
    const firstRight = cols.length - effectiveRightPinCount;
    const base = cols.map((c, i) => ({
      ...c,
      pinIndex: i,
      pinned: i < effectivePinCount,
      pinnedRight: effectiveRightPinCount > 0 && i >= firstRight,
      pinnedLast: false,
      pinnedRightFirst: false,
    }));
    // Status strip as a real (fixed-width) first column, so it stays aligned with the
    // header and scrolls horizontally together with the rest of the row.
    if (rowStripColor) {
      base.unshift({
        id: '__strip',
        Header: '',
        width: stripWidth,
        minWidth: stripWidth,
        maxWidth: stripWidth,
        disableFilters: true,
        disableSortBy: true,
        noPadding: true,
        Cell: ({ row }) => {
          const color = rowStripColor(row.original);
          if (!color) return null;
          // Optional hover tooltip naming the status (e.g. "Cancelled"). The title sits
          // on a full-cell wrapper — the 4px bar alone is too small a hover target.
          const title = rowStripTitle ? rowStripTitle(row.original) : undefined;
          return (
            <div
              title={title || undefined}
              style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {/* Near-full height with a small gap top/bottom, so consecutive bars read as
                  separate rows instead of one continuous line. */}
              <div style={{ width: 4, height: 'calc(100% - 8px)', backgroundColor: color, borderRadius: 1 }} />
            </div>
          );
        },
      });
    }
    if (Actions) {
      // The Action column is resizable like any other; a dragged width replaces the
      // `actionWidth` prop for this list (and, with a pinStorageKey, for the next visit).
      const actionW = colWidths.__actions;
      base.push({
        id: '__actions',
        Header: 'Action',
        align: 'center',
        width: actionW || 0.6,
        minWidth: actionW || actionWidth,
        maxWidth: actionW || undefined,
        disableFilters: true,
        disableSortBy: true,
        Cell: ({ row }) => <Actions object={row.original} fn={fn} />,
      });
    }
    // The status strip auto-freezes with the leading run (it sits left of everything),
    // and the Action column auto-freezes with the trailing one (it sits right of
    // everything) — each would otherwise be stranded outside its own block.
    let lastPinned = null;
    let firstPinnedRight = null;
    base.forEach((c) => {
      if (c.id === '__strip') c.pinned = effectivePinCount > 0;
      if (c.id === '__actions') c.pinnedRight = actionsPinned;
      if (c.pinned) lastPinned = c;
      if (c.pinnedRight && !firstPinnedRight) firstPinnedRight = c;
    });
    if (lastPinned) lastPinned.pinnedLast = true;
    if (firstPinnedRight) firstPinnedRight.pinnedRightFirst = true;
    return base;
  }, [cols, colWidths, Actions, fn, actionWidth, rowStripColor, rowStripTitle, stripWidth, effectivePinCount, effectiveRightPinCount, actionsPinned]);

  const hasPinned = React.useMemo(() => allColumns.some((c) => c.pinned), [allColumns]);
  const hasPinnedRight = React.useMemo(() => allColumns.some((c) => c.pinnedRight), [allColumns]);

  // Sticky `left` for each pinned column = total width of the pinned columns before it.
  // Keyed by the id react-table will use (explicit id, else the string accessor).
  const pinnedLeft = React.useMemo(() => {
    const map = {};
    let acc = 0;
    allColumns.forEach((c) => {
      if (!c.pinned) return;
      const id = colIdOf(c);
      if (id) map[id] = acc;
      acc += colWidthOf(c);
    });
    return map;
  }, [allColumns]);

  // Mirror for the right block: each frozen column's `right` offset is the total width
  // of the frozen columns that sit to its right, so walk the list backwards.
  const pinnedRight = React.useMemo(() => {
    const map = {};
    let acc = 0;
    for (let i = allColumns.length - 1; i >= 0; i--) {
      const c = allColumns[i];
      if (!c.pinnedRight) continue;
      const id = colIdOf(c);
      if (id) map[id] = acc;
      acc += colWidthOf(c);
    }
    return map;
  }, [allColumns]);

  const { getTableProps, getTableBodyProps, headerGroups, footerGroups, rows, prepareRow, totalColumnsWidth } = useTable(
    {
      columns: allColumns,
      data,
      defaultColumn,
      userList,
      // `data` is often recreated each render (e.g. Object.values(byId)); without these
      // react-table resets sort/filter on every data change, so clicking a header appears
      // to do nothing (sort is set then immediately reset).
      autoResetSortBy: false,
      autoResetFilters: false,
      autoResetGlobalFilter: false,
    },
    useFilters,
    useSortBy,
    useFlexLayout
  );

  const align = alignFlex;

  const hasColumnFooter = React.useMemo(() => cols.some((c) => c.Footer), [cols]);
  const renderFooter = showFooter !== undefined ? showFooter : footerLeft != null || hasColumnFooter;

  // ----- Keyboard row navigation (Up/Down to move the selected row) -----
  // Height of the band left for rows (wrap viewport minus the sticky header / footer).
  // Measured in the layout effect further down; declared here because scrollToRow and the
  // windowing maths both read it.
  const [listH, setListH] = React.useState(0);
  // Height of the sticky header. Rows scroll UNDER it, so it is also the distance the
  // snapport's top edge has to be pushed down for a snapped row to land just below it.
  const [headH, setHeadH] = React.useState(0);
  const [footH, setFootH] = React.useState(0);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  // Mirror of selectedIndex for the memoized rows (they must not re-render on selection
  // change — see VirtualRow). Kept in sync by the selection-highlight effect below.
  const selectedIndexRef = React.useRef(0);
  const scrollPendingRef = React.useRef(null);

  // Let the parent re-focus the table (e.g. after a modal closes, return focus to the row)
  // and read the current horizontal scroll, so it can be handed back as
  // `initialScrollLeft` when the list is re-entered.
  React.useImperativeHandle(ref, () => ({
    focus: () => containerRef.current && containerRef.current.focus({ preventScroll: true }),
    getScrollLeft: () => (containerRef.current ? containerRef.current.scrollLeft : 0),
    // Column freezing is driven from the caller's toolbar (e.g. a "Pin columns" menu):
    // read the current boundary for an edge, or set a new one. 0 = nothing frozen on
    // that edge; N = the FIRST N caller columns on the left, the LAST N on the right
    // (the Action column, if any, freezes with the right-hand block). Both boundaries
    // are persisted via pinStorageKey.
    //
    // The getters report the EFFECTIVE (viewport-capped) boundary; getMax… is the cap
    // itself, so a menu can disable the entries beyond it.
    getLeftPinCount: () => effectivePinCount,
    getMaxLeftPinCount: () => maxPinCount,
    setLeftPinCount: (n) => setPinCount(Math.max(0, parseInt(n, 10) || 0)),
    getRightPinCount: () => effectiveRightPinCount,
    getMaxRightPinCount: () => maxRightPinCount,
    setRightPinCount: (n) => setRightPinCount(Math.max(0, parseInt(n, 10) || 0)),
    // Pre-0.6 names for the left edge, kept working so existing callers do not break.
    // They were renamed precisely because nothing in the name said which edge they meant.
    getPinCount: () => effectivePinCount,
    getMaxPinCount: () => maxPinCount,
    setPinCount: (n) => setPinCount(Math.max(0, parseInt(n, 10) || 0)),
    // ----- Column widths -----
    // Widths are normally set by dragging a header's right edge; these are for a toolbar
    // ("Reset column widths") or for restoring a layout the caller stored itself.
    // getColumnWidths() reports only the columns the USER has resized — a column the
    // caller has not touched is absent from the map and renders at its configured width.
    // Read through the mirrors, not through this render's state: a caller that calls a
    // setter and then a getter in the SAME handler (`toggleColumn(id)` then
    // `getHiddenColumns()` to refresh its menu) would otherwise read the value from
    // before its own call — React has not re-rendered yet at that point.
    getColumnWidths: () => ({ ...colWidthsRef.current }),
    setColumnWidth: (id, px) => setColumnWidth(id, px),
    resetColumnWidths: (id) => resetColumnWidths(id),
    // ----- Column visibility -----
    // The column MENU is the caller's to render, exactly like the pin menu; getColumnList()
    // hands it everything it needs (id, header text, current state) so it does not have to
    // re-derive any of this from its own column config.
    getHiddenColumns: () => hiddenRef.current.slice(),
    setHiddenColumns: (ids) => setHiddenColumns(ids),
    toggleColumn: (id, visible) => toggleColumn(id, visible),
    showAllColumns: () => setHiddenColumns([]),
    getColumnList: () =>
      columns.map((c, i) => {
        const id = colIdOf(c);
        return {
          id,
          index: i,
          header: typeof c.Header === 'string' ? c.Header : undefined,
          hidden: !!(id && c.hideable !== false && hiddenRef.current.indexOf(id) >= 0),
          hideable: !!id && c.hideable !== false,
          resizable: !!id && resizable && !c.disableResizing,
          width: id && colWidthsRef.current[id] != null ? colWidthsRef.current[id] : colWidthOf(c),
        };
      }),
    // Move the selection (and the focus) to a row — e.g. a list that re-fetches on a
    // Search click wants the first row selected + focused once the results land, but
    // the table is already mounted so the mount-time focus effect won't fire again.
    selectRow: (index) => {
      const i = Math.max(0, parseInt(index, 10) || 0);
      setSelectedIndex(i);
      scrollPendingRef.current = { index: i, align: 'smart' };
      if (containerRef.current) containerRef.current.focus({ preventScroll: true });
    },
  }));

  // ----- Horizontal scroll bookkeeping -----
  // Pinned columns are frozen with plain CSS `position: sticky`, so the browser keeps
  // them in place on the compositor — NOTHING runs in JS per scroll frame. That is only
  // possible because `.ft-wrap` is the ONE scrollport for both axes (hence the hand-rolled
  // row windowing below instead of react-window, whose outer div would otherwise become
  // the sticky scrollport for the body cells and break the freeze). The only things left
  // for JS here are the separator shadow (flipped once when the scroll crosses 0) and the
  // vertical offset that drives the windowing.
  const pinScrolledRef = React.useRef(false);
  // Snapping is suspended WHILE scrolling and restored a moment after it stops. Left
  // permanently on, `proximity` re-settles the scroll on every wheel notch, which reads
  // as the list stuttering / catching mid-scroll rather than gliding.
  const snapTimerRef = React.useRef(null);
  const pinScrolledEndRef = React.useRef(false);
  const [scrollTop, setScrollTop] = React.useState(0);
  const scrollTickRef = React.useRef(false);
  const onWrapScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const scrolled = hasPinned && el.scrollLeft > 0;
    if (scrolled !== pinScrolledRef.current) {
      pinScrolledRef.current = scrolled;
      if (scrolled) el.setAttribute('data-ct-scrolled', '1');
      else el.removeAttribute('data-ct-scrolled');
    }
    // The right block only casts its shadow while columns are still hidden beneath it,
    // i.e. until the scroll reaches the end.
    const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
    const shadeRight = hasPinnedRight && !atEnd;
    if (shadeRight !== pinScrolledEndRef.current) {
      pinScrolledEndRef.current = shadeRight;
      if (shadeRight) el.setAttribute('data-ct-scrolled-end', '1');
      else el.removeAttribute('data-ct-scrolled-end');
    }
    if (rowSnap) {
      if (el.style.scrollSnapType !== 'none') el.style.scrollSnapType = 'none';
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      snapTimerRef.current = setTimeout(() => {
        const node = containerRef.current;
        if (node) node.style.scrollSnapType = 'y proximity';
      }, 160);
    }
    if (scrollTickRef.current) return;
    scrollTickRef.current = true;
    window.requestAnimationFrame(() => {
      scrollTickRef.current = false;
      const node = containerRef.current;
      if (!node) return;
      syncBarsRef.current();
      setScrollTop(node.scrollTop);
    });
  }, [hasPinned, hasPinnedRight, rowSnap]);

  React.useEffect(() => () => {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
  }, []);

  // syncBars is defined after this handler (it needs listH); reach it through a ref so
  // the scroll listener does not have to be re-attached whenever it changes.
  const syncBarsRef = React.useRef(() => {});

  // Passive listener: React's onScroll attaches a non-passive handler on a scroll-linked
  // path, which can hold up the compositor.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    el.addEventListener('scroll', onWrapScroll, { passive: true });
    return () => el.removeEventListener('scroll', onWrapScroll);
  }, [onWrapScroll]);

  // Restore selection to a specific row (by id) once — e.g. coming back from an edit
  // screen, keep the previously-selected row highlighted instead of jumping to row 0.
  const initialAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (initialAppliedRef.current) return;
    if (initialSelectedId == null) {
      initialAppliedRef.current = true;
      return;
    }
    if (rows.length === 0) return; // wait for data to load
    const idx = rows.findIndex((r) => r.original && r.original[rowIdKey] === initialSelectedId);
    initialAppliedRef.current = true;
    if (idx >= 0) {
      setSelectedIndex(idx);
      scrollPendingRef.current = { index: idx, align: 'center' };
    }
  }, [rows, initialSelectedId, rowIdKey]);

  // Scroll a row into view inside .ft-wrap. Row i occupies [i*rowHeight, (i+1)*rowHeight]
  // in body coordinates, and the sticky header/footer eat listH's worth of viewport, so
  // the visible band is exactly [scrollTop, scrollTop + listH].
  const scrollToRow = React.useCallback(
    (index, align_) => {
      const el = containerRef.current;
      if (!el || listH <= 0) return;
      const rowTop = index * rowHeight;
      const rowBottom = rowTop + rowHeight;
      let top = el.scrollTop;
      if (align_ === 'center') {
        top = rowTop - Math.max(0, (listH - rowHeight) / 2);
      } else if (rowTop < top) {
        top = rowTop;
      } else if (rowBottom > top + listH) {
        top = rowBottom - listH;
      }
      el.scrollTop = Math.max(0, top);
    },
    [listH, rowHeight]
  );

  // Flush a pending scroll (initial restore / arrow move) once the body is measured.
  // Scrolling must happen here, NOT inside a setState updater — updaters run during the
  // render phase.
  React.useEffect(() => {
    const pending = scrollPendingRef.current;
    if (pending != null && listH > 0) {
      scrollToRow(pending.index, pending.align);
      scrollPendingRef.current = null;
    }
  });

  // Restore the horizontal scroll once, after the rows are on screen — otherwise a
  // wide table always snaps back to column 1 on re-entry and the user has to scroll
  // across every column again. No dep array: retry each render until it lands.
  const hScrollAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (hScrollAppliedRef.current) return;
    if (!initialScrollLeft) {
      hScrollAppliedRef.current = true;
      return;
    }
    if (rows.length === 0 || listH === 0 || !containerRef.current) return; // wait for data
    containerRef.current.scrollLeft = initialScrollLeft;
    hScrollAppliedRef.current = true;
  });

  // Keep the selection valid when the row set changes (e.g. after filtering).
  React.useEffect(() => {
    setSelectedIndex((i) => Math.min(Math.max(0, i), Math.max(0, rows.length - 1)));
  }, [rows.length]);

  // Focus the table on first render so arrow keys work immediately.
  React.useEffect(() => {
    if (rowNavigation && containerRef.current) {
      containerRef.current.focus({ preventScroll: true });
    }
  }, [rowNavigation]);

  // Notify the caller whenever the selected row changes.
  React.useEffect(() => {
    if (onRowSelect && rows[selectedIndex]) {
      prepareRow(rows[selectedIndex]);
      onRowSelect(rows[selectedIndex].original, selectedIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, rows]);

  const moveSelection = React.useCallback(
    (delta) => {
      setSelectedIndex((i) => {
        const next = Math.min(Math.max(0, i + delta), Math.max(0, rows.length - 1));
        // Ref write only — the scroll itself runs in the flush effect above (scrolling
        // from inside a state updater would run during the render phase).
        if (next !== i) scrollPendingRef.current = { index: next, align: 'smart' };
        return next;
      });
    },
    [rows.length]
  );

  const onKeyDown = React.useCallback(
    (e) => {
      if (!rowNavigation) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; // don't hijack search typing
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveSelection(-1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setSelectedIndex(0);
        scrollToRow(0, 'smart');
      } else if (e.key === 'End') {
        e.preventDefault();
        const last = Math.max(0, rows.length - 1);
        setSelectedIndex(last);
        scrollToRow(last, 'smart');
      } else if (e.key === 'Enter') {
        if (onRowEnter && rows[selectedIndex]) {
          e.preventDefault();
          prepareRow(rows[selectedIndex]);
          onRowEnter(rows[selectedIndex].original, selectedIndex);
        }
      }
    },
    [rowNavigation, moveSelection, rows, selectedIndex, onRowEnter, prepareRow, scrollToRow]
  );

  // Everything the memoized rows need. Deliberately does NOT include selectedIndex —
  // rows read it from selectedIndexRef so arrow navigation never re-renders them.
  const itemData = React.useMemo(
    () => ({
      rows,
      prepareRow,
      rowStyle,
      selectedBg,
      rowNavigation,
      fontPx,
      selectedIndexRef,
      rowHeight,
      pinnedLeft,
      pinnedRight,
      rowSnap,
      onSelect: (i) => setSelectedIndex(i),
      // Not read by VirtualRow — included so a pin-boundary change breaks the memo and
      // every visible row re-renders with the new pinned flags (otherwise rows could
      // keep stale pin attributes / sticky offsets).
      allColumns,
    }),
    [rows, prepareRow, rowStyle, selectedBg, rowNavigation, fontPx, allColumns, rowHeight, pinnedLeft, pinnedRight, rowSnap]
  );

  // Selection highlight, applied imperatively so only the affected DOM nodes change on
  // ↑/↓ (a state-driven highlight re-rendered every visible row per keypress).
  React.useEffect(() => {
    selectedIndexRef.current = selectedIndex;
    const el = containerRef.current;
    if (!el || !rowNavigation) return;
    el.querySelectorAll('.ft-row').forEach((r) => {
      const idx = parseInt(r.getAttribute('data-ct-index'), 10);
      const hasCustomBg = r.getAttribute('data-ct-custom') === '1';
      const baseBg = r.getAttribute('data-ct-bg') || '#ffffff';
      r.style.backgroundColor = hasCustomBg ? baseBg : idx === selectedIndex ? selectedBg : baseBg;
    });
  }, [selectedIndex, selectedBg, rowNavigation, rows]);

  // Measure the band left for rows: the wrap's viewport minus the sticky header and
  // footer, which overlay the top / bottom of it. Drives both the windowing maths and
  // scrollToRow, so rows exactly fill the gap — no clipped last row.
  const bodyWrapRef = React.useRef(null);
  const headRef = React.useRef(null);
  const footRef = React.useRef(null);
  useIsoLayoutEffect(() => {
    const wrap = containerRef.current;
    if (!wrap) return undefined;
    const update = () => {
      const hh = headRef.current ? headRef.current.offsetHeight : 0;
      const fh = footRef.current ? footRef.current.offsetHeight : 0;
      setHeadH(hh);
      setFootH(fh);
      setListH(Math.max(0, wrap.clientHeight - hh - fh));
    };
    update();
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      ro.observe(wrap);
      if (headRef.current) ro.observe(headRef.current);
      if (footRef.current) ro.observe(footRef.current);
    }
    window.addEventListener('resize', update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [renderFooter, height, rows.length]);

  // ----- Overlay scrollbars -----
  // The native vertical scrollbar runs the whole height of .ft-wrap — alongside the
  // header and the footer, not just the rows — because .ft-wrap is the single
  // scrollport for both axes. Giving the body its own vertical overflow would fix the
  // bar but break the column freeze: an element that scrolls in y is a scroll container
  // in x too, so it would become the sticky scrollport for the pinned cells and they
  // would slide away (this is exactly the react-window problem this component was
  // rewritten to escape). So the native bars are hidden and redrawn as overlays, with
  // the vertical track spanning only the row band.
  //
  // Thumbs are positioned imperatively from the same rAF-throttled scroll handler that
  // drives the windowing — no React re-render per frame.
  const rootRef = React.useRef(null);
  const guideRef = React.useRef(null);
  const vTrackRef = React.useRef(null);
  const vThumbRef = React.useRef(null);
  const hTrackRef = React.useRef(null);
  const hThumbRef = React.useRef(null);
  const MIN_THUMB = 24;

  const syncBars = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const maxY = Math.max(0, el.scrollHeight - el.clientHeight);
    const maxX = Math.max(0, el.scrollWidth - el.clientWidth);

    const vTrack = vTrackRef.current;
    const vThumb = vThumbRef.current;
    if (vTrack && vThumb) {
      const bandH = listH;
      if (maxY <= 0 || bandH <= MIN_THUMB) {
        vTrack.style.display = 'none';
      } else {
        vTrack.style.display = 'block';
        const th = Math.max(MIN_THUMB, Math.round(bandH * (el.clientHeight / el.scrollHeight)));
        vThumb.style.height = th + 'px';
        vThumb.style.transform = 'translateY(' + Math.round((el.scrollTop / maxY) * (bandH - th)) + 'px)';
      }
    }

    const hTrack = hTrackRef.current;
    const hThumb = hThumbRef.current;
    if (hTrack && hThumb) {
      if (maxX <= 0) {
        hTrack.style.display = 'none';
      } else {
        hTrack.style.display = 'block';
        const bandW = hTrack.clientWidth;
        const tw = Math.max(MIN_THUMB, Math.round(bandW * (el.clientWidth / el.scrollWidth)));
        hThumb.style.width = tw + 'px';
        hThumb.style.transform = 'translateX(' + Math.round((el.scrollLeft / maxX) * (bandW - tw)) + 'px)';
      }
    }
  }, [listH]);

  // Re-measure whenever the geometry could have changed (mount, resize, row count,
  // footer toggle, a new pin boundary).
  useIsoLayoutEffect(() => {
    syncBarsRef.current = syncBars;
    syncBars();
    onWrapScroll(); // sets the pin shadows for the initial (unscrolled) position too
  });

  // Dragging a thumb. Snapping is switched off for the duration: `proximity` snapping
  // re-settles the scroll on every programmatic write, which makes a drag feel sticky.
  const startThumbDrag = React.useCallback(
    (axis) => (e) => {
      const el = containerRef.current;
      const thumb = axis === 'y' ? vThumbRef.current : hThumbRef.current;
      if (!el || !thumb || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const vertical = axis === 'y';
      const startPos = vertical ? e.clientY : e.clientX;
      const startScroll = vertical ? el.scrollTop : el.scrollLeft;
      const trackLen = vertical ? listH : hTrackRef.current.clientWidth;
      const thumbLen = vertical ? thumb.offsetHeight : thumb.offsetWidth;
      const maxScroll = vertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
      const ratio = maxScroll / Math.max(1, trackLen - thumbLen);
      const prevSnap = el.style.scrollSnapType;
      el.style.scrollSnapType = 'none';
      thumb.classList.add('ft-thumb-drag');
      document.body.style.userSelect = 'none';
      const onMove = (ev) => {
        const delta = (vertical ? ev.clientY : ev.clientX) - startPos;
        const next = startScroll + delta * ratio;
        if (vertical) el.scrollTop = next;
        else el.scrollLeft = next;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        el.style.scrollSnapType = prevSnap;
        thumb.classList.remove('ft-thumb-drag');
        document.body.style.userSelect = '';
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [listH]
  );

  // Clicking the bare track jumps so the thumb centres on the click.
  const onTrackDown = React.useCallback(
    (axis) => (e) => {
      if (e.target !== e.currentTarget) return; // the thumb handles its own presses
      const el = containerRef.current;
      const thumb = axis === 'y' ? vThumbRef.current : hThumbRef.current;
      if (!el || !thumb) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (axis === 'y') {
        const pos = e.clientY - rect.top - thumb.offsetHeight / 2;
        el.scrollTop = (pos / Math.max(1, listH - thumb.offsetHeight)) * (el.scrollHeight - el.clientHeight);
      } else {
        const pos = e.clientX - rect.left - thumb.offsetWidth / 2;
        el.scrollLeft =
          (pos / Math.max(1, e.currentTarget.clientWidth - thumb.offsetWidth)) * (el.scrollWidth - el.clientWidth);
      }
    },
    [listH]
  );

  // ----- Column resize -----
  // The drag paints a vertical GUIDE and commits the new width exactly once, on
  // pointer-up. It deliberately does NOT write width state per pointermove: the column
  // defs are what `itemData` hangs off, so a live resize would re-render every visible
  // row sixty times a second — the same cost the memoized rows and the imperative
  // selection highlight exist to avoid. (It is also what Excel and Sheets do.)
  const startColResize = React.useCallback(
    (id) => (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation(); // never let the press reach the header's sort toggle
      const handle = e.currentTarget;
      const th = handle.parentElement;
      const root = rootRef.current;
      const guide = guideRef.current;
      if (!th || !root) return;
      const startX = e.clientX;
      // Measured, not configured: `width` is only a request — the rendered size is
      // `min(max(minWidth, width), maxWidth)`, so a column configured `width: 1,
      // minWidth: 90` is 90px on screen. Starting the drag from the config would make
      // the column jump on the first pixel of pointer movement.
      const startW = th.offsetWidth;
      const rootRect = root.getBoundingClientRect();
      const thLeft = th.getBoundingClientRect().left - rootRect.left;
      let width = startW;
      const paint = (clientX) => {
        width = Math.max(minColumnWidth, Math.round(startW + (clientX - startX)));
        if (!guide) return;
        guide.style.display = 'block';
        // Clamped to the table box — the pointer can travel far past either edge, and a
        // guide drawn outside the root would streak across the page around it.
        guide.style.transform = `translateX(${Math.min(Math.max(0, thLeft + width), rootRect.width - 2)}px)`;
      };
      paint(e.clientX);
      handle.classList.add('ft-resizing');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      const onMove = (ev) => paint(ev.clientX);
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (guide) guide.style.display = 'none';
        handle.classList.remove('ft-resizing');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        if (width !== startW) setColumnWidth(id, width);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [minColumnWidth, setColumnWidth]
  );

  // Which rows are actually rendered. The frozen columns are sticky, so this can lag a
  // frame behind the scroll without ever pulling them out of place.
  const firstIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const lastIdx = Math.min(rows.length - 1, Math.ceil((scrollTop + (listH || 0)) / rowHeight) + OVERSCAN);

  const tableProps = getTableProps();
  return (
    <div
      ref={rootRef}
      className={`ft-root ct-root${className ? ` ${className}` : ''}`}
      style={{ position: 'relative', width: '100%', height: parseFloat(height), ...style }}
    >
    <div
      className="ft-wrap ct-wrap ft-nobar"
      ref={containerRef}
      tabIndex={rowNavigation ? 0 : undefined}
      onKeyDown={onKeyDown}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        outline: 'none',
        // Vertical scrolling settles on a row boundary (spreadsheet behaviour) instead of
        // leaving a half-row sliced by the sticky header. `scroll-padding-top` moves the
        // snapport's top edge below the header, which is what the rows scroll under —
        // without it a snapped row would align to the hidden top of the scrollport.
        // `proximity`, not `mandatory`: rows are windowed, so snap targets come and go,
        // and mandatory snapping fights programmatic scrolls and the end of the list.
        // Horizontal scrolling is untouched (the axis is `y`).
        ...(rowSnap ? { scrollSnapType: 'y proximity', scrollPaddingTop: headH } : {}),
      }}
    >
      <div
        {...tableProps}
        style={{ ...tableProps.style, minWidth: totalColumnsWidth, minHeight: '100%', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        {headerGroups.map((headerGroup) => {
          const { key: headerGroupKey, ...headerGroupProps } = headerGroup.getHeaderGroupProps();
          return (
          <div
            key={headerGroupKey}
            {...headerGroupProps}
            ref={headRef}
            className="ft-head ct-head"
            style={{
              ...headerGroupProps.style,
              flex: '0 0 auto',
              background: '#ffffff',
              borderBottom: '1px solid #e3e8ee',
              position: 'sticky',
              top: 0,
              zIndex: 4,
            }}
          >
            {headerGroup.headers.map((column) => {
              const canSort = sortable && !column.disableSortBy;
              const canSearch = searchable && column.canFilter && !column.disableFilters;
              // The status strip is a fixed 4px bar — there is nothing in it to resize.
              const canResize = resizable && !column.disableResizing && column.id !== '__strip';
              const { key: headerKey, ...headerProps } = column.getHeaderProps();
              const sortDir = column.isSorted ? (column.isSortedDesc ? 'desc' : 'asc') : null;
              return (
                <div
                  key={headerKey}
                  {...headerProps}
                  className="ft-th ct-th"
                  data-ct-pin={column.pinned || column.pinnedRight ? '1' : undefined}
                  data-ct-pin-last={column.pinnedLast ? '1' : undefined}
                  data-ct-pin-right-first={column.pinnedRightFirst ? '1' : undefined}
                  style={{
                    ...headerProps.style,
                    padding: column.noPadding ? 0 : '7px 12px 9px',
                    boxSizing: 'border-box',
                    // Containing block for the resize grip. A pinned header overrides
                    // this with `sticky`, which is just as good an anchor.
                    position: 'relative',
                    ...(column.pinned || column.pinnedRight
                      ? {
                          position: 'sticky',
                          ...(column.pinned
                            ? { left: pinnedLeft[column.id] || 0 }
                            : { right: pinnedRight[column.id] || 0 }),
                          // above the scrolling header cells it overlaps
                          zIndex: 5,
                          background: '#ffffff',
                        }
                      : {}),
                  }}
                >
                  <div
                    {...(canSort ? column.getSortByToggleProps({ title: undefined }) : {})}
                    className="ft-th-label ct-th-label"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      // sort icon sits at the opposite end of the column from the header text:
                      // left-aligned header -> icon pushed to the far right; right-aligned -> far left.
                      justifyContent:
                        canSort && column.align !== 'center' ? 'space-between' : align(column.align),
                      gap: 4,
                      cursor: canSort ? 'pointer' : 'default',
                      userSelect: 'none',
                      fontWeight: 700,
                      fontSize: fontPx,
                      color: '#000000',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {canSort && column.align === 'right' && <SortIcon direction={sortDir} />}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{column.render('Header')}</span>
                      {/* Small blue pin on the freeze-boundary column only — the
                          indicator of how far the table is frozen. Changing the
                          boundary is done from the caller's toolbar (via the
                          imperative setPinCount), not from the header. */}
                      {((column.pinnedLast && column.pinIndex != null) || column.pinnedRightFirst) && (
                        <PinIcon
                          title={
                            column.pinnedLast
                              ? 'Columns up to here are pinned'
                              : 'Columns from here are pinned to the right'
                          }
                        />
                      )}
                    </span>
                    {canSort && column.align !== 'right' && <SortIcon direction={sortDir} />}
                  </div>
                  {canSearch && <div className="ft-th-filter ct-th-filter" style={{ marginTop: 4 }}>{column.render('Filter')}</div>}
                  {canResize && (
                    <div
                      className="ft-resizer ct-resizer"
                      onPointerDown={startColResize(column.id)}
                      onDoubleClick={() => resetColumnWidths(column.id)}
                      title="Drag to resize · double-click to reset"
                    />
                  )}
                </div>
              );
            })}
          </div>
          );
        })}

        {/* Body — fills the space between header and footer */}
        <div
          {...getTableBodyProps()}
          ref={bodyWrapRef}
          style={{ flex: '1 0 auto', position: 'relative', height: rows.length ? rows.length * rowHeight : undefined }}
        >
          {loading ? (
            <div style={{ padding: '90px 0', textAlign: 'center' }}>
              <Spinner text={loadingText} />
            </div>
          ) : rows.length === 0 && dataFetched ? (
            <div style={{ padding: '80px 0', textAlign: 'center', color: '#8a94a6' }}>
              <InboxIcon />
              <div style={{ marginTop: 8, fontSize: '13px' }}>{emptyText}</div>
            </div>
          ) : listH > 0 ? (
            // Only the visible slice is mounted; each row is absolutely positioned at
            // index * rowHeight inside a container of the full content height, so the
            // wrap's native scrollbar covers the whole list.
            Array.from({ length: Math.max(0, lastIdx - firstIdx + 1) }, (_, k) => {
              const index = firstIdx + k;
              return <VirtualRow key={rows[index].id != null ? rows[index].id : index} data={itemData} index={index} />;
            })
          ) : null}
        </div>

        {/* Footer */}
        {renderFooter &&
          footerGroups.map((group) => {
            const { key: footerGroupKey, ...footerGroupProps } = group.getFooterGroupProps();
            return (
              <div
                key={footerGroupKey}
                {...footerGroupProps}
                ref={footRef}
                className="ft-foot ct-foot"
                style={{
                  ...footerGroupProps.style,
                  flex: '0 0 auto',
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 4,
                  background: '#f4f5f7',
                  borderTop: '1px solid #e3e8ee',
                }}
              >
                {group.headers.map((column) => {
                  const { key: footerKey, ...footerProps } = column.getFooterProps();
                  return (
                    <div
                      key={footerKey}
                      {...footerProps}
                      className="ft-tf ct-tf"
                      data-ct-pin={column.pinned || column.pinnedRight ? '1' : undefined}
                      data-ct-pin-last={column.pinnedLast ? '1' : undefined}
                      data-ct-pin-right-first={column.pinnedRightFirst ? '1' : undefined}
                      style={{
                        ...footerProps.style,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: align(column.align),
                        padding: column.noPadding ? 0 : '8px 12px',
                        fontSize: fontPx,
                        fontWeight: 700,
                        color: '#000000',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textAlign: column.align || 'left',
                        ...(column.pinned || column.pinnedRight
                          ? {
                              position: 'sticky',
                              ...(column.pinned
                                ? { left: pinnedLeft[column.id] || 0 }
                                : { right: pinnedRight[column.id] || 0 }),
                              zIndex: 5,
                              background: '#f4f5f7',
                            }
                          : {}),
                      }}
                    >
                      {column.render('Footer')}
                    </div>
                  );
                })}
                {footerLeft != null && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 12,
                      top: 0,
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: fontPx,
                      fontWeight: 700,
                      color: '#000000',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                    }}
                  >
                    {footerLeft}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>

      {/* Overlay scrollbars. The vertical track is inset by the header and footer
          heights, so it runs beside the ROWS only. */}
      <div
        className="ft-track ft-track-v"
        ref={vTrackRef}
        onPointerDown={onTrackDown('y')}
        style={{ right: 0, top: headH, height: listH, display: 'none' }}
      >
        <div className="ft-thumb" ref={vThumbRef} onPointerDown={startThumbDrag('y')} />
      </div>
      <div
        className="ft-track ft-track-h"
        ref={hTrackRef}
        onPointerDown={onTrackDown('x')}
        style={{ left: 0, right: 11, bottom: 0, display: 'none' }}
      >
        <div className="ft-thumb" ref={hThumbRef} onPointerDown={startThumbDrag('x')} />
      </div>

      {/* Follows the pointer during a column resize; hidden the rest of the time. */}
      <div className="ft-resize-guide" ref={guideRef} style={{ display: 'none' }} />
    </div>
  );
});

export default FreezeTable;
