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
  const { rows, prepareRow, rowStyle, selectedBg, rowNavigation, fontPx, selectedIndexRef, onSelect, rowHeight, pinnedLeft, rowSnap } = data;
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
        // Frozen by the browser, not by JS: sticky offsets are resolved against .ft-wrap,
        // the single scrollport for both axes.
        return (
          <div
            key={cellKey}
            {...cellProps}
            className="ft-td ct-td"
            data-ct-pin={pinned ? '1' : undefined}
            data-ct-pin-last={pinned && cell.column.pinnedLast ? '1' : undefined}
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
              ...(pinned
                ? {
                    position: 'sticky',
                    left: pinnedLeft[cell.column.id] || 0,
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
    rowSnap = true,
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

  // ----- Which columns are pinned -----
  // The `pinned: true` flags in the column config are only the DEFAULT. The whole
  // choice is a single number: how many leading columns are frozen (freezing only
  // makes sense as a leading run — a frozen middle column would have its left
  // neighbours scroll away underneath it). The caller changes it at runtime through
  // the imperative setPinCount(n). Persisted per list via `pinStorageKey`.
  const defaultPinCount = React.useMemo(() => {
    let n = 0;
    for (const c of columns) {
      if (c.pinned) n++;
      else break;
    }
    return n;
  }, [columns]);
  const [userPinCount, setUserPinCount] = React.useState(() => {
    if (!pinStorageKey) return null;
    try {
      const v = window.localStorage.getItem(`ctPin:${pinStorageKey}`);
      if (v != null && v !== '') {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n) && n >= 0) return n;
      }
    } catch (e) { /* storage unavailable — fall back to config default */ }
    return null;
  });
  const pinCount = userPinCount != null ? userPinCount : defaultPinCount;

  // HARD CAP: the pinned block must never be as wide as the viewport. Beyond that
  // there is no room left to actually read the scrolling columns, and the frozen
  // block starts fighting the scroller instead of helping. Capping also matches the
  // UX reality of "freeze panes" in any spreadsheet.
  const maxPinCount = React.useMemo(() => {
    if (!wrapW) return columns.length; // not measured yet — cap kicks in right after mount
    const colW = colWidthOf;
    const budget = wrapW - PIN_MIN_SCROLLABLE;
    let used = rowStripColor ? stripWidth : 0;
    let n = 0;
    for (const c of columns) {
      used += colW(c);
      if (used > budget) break;
      n++;
    }
    return n;
  }, [columns, wrapW, rowStripColor, stripWidth]);
  const effectivePinCount = Math.min(pinCount, maxPinCount);

  const setPinCount = React.useCallback(
    (n) => {
      setUserPinCount(n);
      if (pinStorageKey) {
        try {
          window.localStorage.setItem(`ctPin:${pinStorageKey}`, String(n));
        } catch (e) { /* ignore */ }
      }
    },
    [pinStorageKey]
  );

  // Append the Action column (as a real column) when an Actions renderer is given.
  const allColumns = React.useMemo(() => {
    // pinIndex = the column's position among the caller's columns — the pin UI uses
    // it to set the freeze boundary ("pin up to here" = pinCount pinIndex+1).
    const base = columns.map((c, i) => ({ ...c, pinIndex: i, pinned: i < effectivePinCount, pinnedLast: false }));
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
      base.push({
        id: '__actions',
        Header: 'Action',
        align: 'center',
        width: 0.6,
        minWidth: actionWidth,
        disableFilters: true,
        disableSortBy: true,
        Cell: ({ row }) => <Actions object={row.original} fn={fn} />,
      });
    }
    // The status strip is auto-pinned whenever any real column is pinned (it sits
    // left of everything, so it must freeze with the leading run). The Actions
    // column (rightmost) never pins.
    let lastPinned = null;
    base.forEach((c) => {
      if (c.id === '__strip') c.pinned = effectivePinCount > 0;
      if (c.id === '__actions') c.pinned = false;
      if (c.pinned) lastPinned = c;
    });
    if (lastPinned) lastPinned.pinnedLast = true;
    return base;
  }, [columns, Actions, fn, actionWidth, rowStripColor, rowStripTitle, stripWidth, effectivePinCount]);

  const hasPinned = React.useMemo(() => allColumns.some((c) => c.pinned), [allColumns]);

  // Sticky `left` for each pinned column = total width of the pinned columns before it.
  // Keyed by the id react-table will use (explicit id, else the string accessor).
  const pinnedLeft = React.useMemo(() => {
    const map = {};
    let acc = 0;
    allColumns.forEach((c) => {
      if (!c.pinned) return;
      const id = c.id || (typeof c.accessor === 'string' ? c.accessor : undefined);
      if (id) map[id] = acc;
      acc += colWidthOf(c);
    });
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

  const hasColumnFooter = React.useMemo(() => columns.some((c) => c.Footer), [columns]);
  const renderFooter = showFooter !== undefined ? showFooter : footerLeft != null || hasColumnFooter;

  // ----- Keyboard row navigation (Up/Down to move the selected row) -----
  // Height of the band left for rows (wrap viewport minus the sticky header / footer).
  // Measured in the layout effect further down; declared here because scrollToRow and the
  // windowing maths both read it.
  const [listH, setListH] = React.useState(0);
  // Height of the sticky header. Rows scroll UNDER it, so it is also the distance the
  // snapport's top edge has to be pushed down for a snapped row to land just below it.
  const [headH, setHeadH] = React.useState(0);
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
    // Column pinning is driven from the caller's toolbar (e.g. a "Pin Columns"
    // dropdown): read the current freeze boundary and set a new one (0 = no pinning;
    // N = the first N caller columns frozen). Persisted via pinStorageKey.
    // getPinCount reports the EFFECTIVE (viewpoft-capped) boundary; getMaxPinCount
    // is the cap — the dropdown disables entries beyond it.
    getPinCount: () => effectivePinCount,
    getMaxPinCount: () => maxPinCount,
    setPinCount: (n) => setPinCount(Math.max(0, parseInt(n, 10) || 0)),
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
    if (scrollTickRef.current) return;
    scrollTickRef.current = true;
    window.requestAnimationFrame(() => {
      scrollTickRef.current = false;
      const node = containerRef.current;
      if (node) setScrollTop(node.scrollTop);
    });
  }, [hasPinned]);

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
      rowSnap,
      onSelect: (i) => setSelectedIndex(i),
      // Not read by VirtualRow — included so a pin-boundary change breaks the memo and
      // every visible row re-renders with the new pinned flags (otherwise rows could
      // keep stale pin attributes / sticky offsets).
      allColumns,
    }),
    [rows, prepareRow, rowStyle, selectedBg, rowNavigation, fontPx, allColumns, rowHeight, pinnedLeft, rowSnap]
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

  // Which rows are actually rendered. The frozen columns are sticky, so this can lag a
  // frame behind the scroll without ever pulling them out of place.
  const firstIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const lastIdx = Math.min(rows.length - 1, Math.ceil((scrollTop + (listH || 0)) / rowHeight) + OVERSCAN);

  const tableProps = getTableProps();
  return (
    <div
      className={`ft-wrap ct-wrap${className ? ` ${className}` : ''}`}
      ref={containerRef}
      tabIndex={rowNavigation ? 0 : undefined}
      onKeyDown={onKeyDown}
      style={{
        width: '100%',
        height: parseFloat(height),
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
        ...style,
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
              const { key: headerKey, ...headerProps } = column.getHeaderProps();
              const sortDir = column.isSorted ? (column.isSortedDesc ? 'desc' : 'asc') : null;
              return (
                <div
                  key={headerKey}
                  {...headerProps}
                  className="ft-th ct-th"
                  data-ct-pin={column.pinned ? '1' : undefined}
                  data-ct-pin-last={column.pinnedLast ? '1' : undefined}
                  style={{
                    ...headerProps.style,
                    padding: column.noPadding ? 0 : '7px 12px 9px',
                    boxSizing: 'border-box',
                    ...(column.pinned
                      ? {
                          position: 'sticky',
                          left: pinnedLeft[column.id] || 0,
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
                      {column.pinnedLast && column.pinIndex != null && (
                        <PinIcon title="Columns up to here are pinned" />
                      )}
                    </span>
                    {canSort && column.align !== 'right' && <SortIcon direction={sortDir} />}
                  </div>
                  {canSearch && <div className="ft-th-filter ct-th-filter" style={{ marginTop: 4 }}>{column.render('Filter')}</div>}
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
                      data-ct-pin={column.pinned ? '1' : undefined}
                      data-ct-pin-last={column.pinnedLast ? '1' : undefined}
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
                        ...(column.pinned
                          ? {
                              position: 'sticky',
                              left: pinnedLeft[column.id] || 0,
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
  );
});

export default FreezeTable;
