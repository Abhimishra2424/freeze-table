import React from 'react';
import { useFilters, useFlexLayout, useSortBy, useTable } from 'react-table';
import { injectStyles, useIsoLayoutEffect } from './internal-ui';
import { DefaultCell, DefaultColumnFilter } from './components/defaults';
import OverlayBars from './components/OverlayBars';
import TableBody from './components/TableBody';
import TableFoot from './components/TableFoot';
import TableHead from './components/TableHead';
import Toolbar from './components/Toolbar';
import { useColumnDrag } from './hooks/useColumnDrag';
import { useColumnLayout } from './hooks/useColumnLayout';
import { useLayoutStorage } from './hooks/useLayoutStorage';
import { useBandHeights, useWrapWidth } from './hooks/useMeasurements';
import { useOverlayScrollbars } from './hooks/useOverlayScrollbars';
import { usePinning } from './hooks/usePinning';
import { useRowNavigation } from './hooks/useRowNavigation';
import { useTableColumns } from './hooks/useTableColumns';
import { useTableHandle } from './hooks/useTableHandle';
import { useStabilityWarning } from './hooks/useStabilityWarning';
import { useTableScroll } from './hooks/useTableScroll';
import { COL_MIN_WIDTH, ELLIPSIS, OVERSCAN, colIdOf } from './lib/columns';
import { FORMAT_DEFAULTS } from './lib/columnTypes';
import { resolveHeight } from './lib/props';

export { ELLIPSIS };

// react-table's per-column fallbacks. Module-level, so the identity is stable and the
// table instance is not rebuilt on every render.
const DEFAULT_COLUMN = {
  Cell: DefaultCell,
  Filter: DefaultColumnFilter,
  Footer: () => null,
  minWidth: 90,
  width: 1,
};

/**
 * FreezeTable — a virtualized react-table list with frozen columns.
 *
 * Layout is flexbox + inline styles only, and the few UI atoms it needs (sort arrows,
 * pin marker, filter box, spinner, empty-state glyph) are inline SVG, so the package
 * pulls in no UI library and needs no CSS import.
 *
 * ## The one invariant everything else follows from
 *
 * `.ft-wrap` is the SINGLE scrollport for both axes. Frozen columns are plain CSS
 * `position: sticky` resolved against it, so nothing runs in JS per scroll frame. That
 * is why the rows are windowed by hand (a virtualization library's own `overflow` div
 * would become the sticky scrollport for the body cells and the freeze would break),
 * and why the native scrollbars are hidden and redrawn as overlays (an element that
 * scrolls in y is a scroll container in x too). Anything that introduces a nested scroll
 * container inside `.ft-wrap` silently breaks column freezing — check that first when
 * the pinned block "slides away".
 *
 * ## How the pieces fit
 *
 *   useColumnLayout   the user's widths / hidden set / order, persisted  -> `cols`
 *   usePinning        how many columns freeze at each edge, and the caps
 *   useTableColumns   `cols` + the synthetic __strip / __actions columns -> react-table
 *   useTableScroll    the one passive scroll listener: shadows + windowing
 *   useRowNavigation  selection, ↑/↓, and the imperative highlight
 *   useColumnDrag     the resize and reorder drags (both commit on pointer-up only)
 *
 * Everything downstream of `useColumnLayout` reads `cols`, NEVER the `columns` prop:
 * a hidden column does not exist as far as freezing and the sticky offsets are
 * concerned, and a moved column freezes according to where it now is.
 *
 * The full prop and column-config reference lives in README.md — this file documents
 * the mechanics, the README documents the API.
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
    context,
    locale,
    dateFormat = FORMAT_DEFAULTS.dateFormat,
    dateTimeFormat = FORMAT_DEFAULTS.dateTimeFormat,
    currencySymbol,
    status,
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
    reorderable = true,
    actionIndex = 'last',
    minColumnWidth = COL_MIN_WIDTH,
    onColumnResize,
    onColumnVisibilityChange,
    onColumnOrderChange,
    defaultLayout,
    onLayoutChange,
    toolbar = false,
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

  // Development-only: says so when `columns` / `data` are rebuilt unchanged every render.
  useStabilityWarning('columns', columns);
  useStabilityWarning('data', data);

  const fontPx = `${parseFloat(fontSize)}px`;
  const hasActions = !!Actions;

  // `status` is the one-prop replacement for the `loading` + `dataFetched` pair, which
  // had to be wired together correctly to avoid flashing "No records found" over a list
  // that was still loading. The old pair still works; `status` simply wins when given.
  const isLoading = status === undefined ? loading : status === 'loading';
  const isFetched = status === undefined ? dataFetched : status !== 'idle';

  // Formatting options for the column `type` shorthands, in one memoized object so a
  // caller passing none of them does not rebuild every typed cell renderer per render.
  const formatOptions = React.useMemo(
    () => ({ locale, dateFormat, dateTimeFormat, currencySymbol }),
    [locale, dateFormat, dateTimeFormat, currencySymbol]
  );

  // The outer scroller. Measured early: the pin caps need the wrap's width before the
  // column defs are built.
  const rootRef = React.useRef(null);
  const containerRef = React.useRef(null);
  const wrapW = useWrapWidth(containerRef);

  // ----- The user's layout: widths, hidden columns, order -----
  const storage = useLayoutStorage(pinStorageKey);
  const layout = useColumnLayout({
    columns,
    formatOptions,
    defaultLayout,
    hasActions,
    actionIndex,
    minColumnWidth,
    storage,
    onColumnResize,
    onColumnVisibilityChange,
    onColumnOrderChange,
  });
  const { cols, actionPos, colWidths } = layout;
  // The Action column's rendered width: a dragged width replaces the `actionWidth` prop,
  // and both the pin caps and the column def built in useTableColumns have to agree.
  const actionColWidth = colWidths.__actions || actionWidth;

  // ----- Freeze boundaries -----
  const pinning = usePinning({
    cols,
    wrapW,
    hasActions,
    actionPos,
    actionColWidth,
    pinActions,
    rowStripColor,
    stripWidth,
    storage,
    defaultLayout,
  });

  // One callback for all four layout choices, so a caller saving a layout per user does
  // not have to stitch together onColumnResize + onColumnVisibilityChange +
  // onColumnOrderChange and then discover the pin boundaries have no callback at all.
  // Effect, not a call inside each setter: the setters live in two different hooks, and
  // this way one gesture that changes two things still reports one settled layout.
  const layoutRef = React.useRef(null);
  React.useEffect(() => {
    if (!onLayoutChange) return;
    const next = {
      pins: { left: pinning.pinCount, right: pinning.rightPinCount },
      widths: layout.colWidths,
      hidden: layout.hiddenIds,
      order: layout.order,
    };
    const key = JSON.stringify(next);
    if (layoutRef.current === key) return;
    const first = layoutRef.current === null;
    layoutRef.current = key;
    if (!first) onLayoutChange(next); // the initial layout is not a change
  }, [onLayoutChange, pinning.pinCount, pinning.rightPinCount, layout.colWidths, layout.hiddenIds, layout.order]);

  // ----- The column list react-table actually gets -----
  const { allColumns, hasPinned, hasPinnedRight, pinnedLeft, pinnedRight } = useTableColumns({
    cols,
    colWidths,
    Actions,
    fn,
    actionWidth,
    actionPos,
    rowStripColor,
    rowStripTitle,
    stripWidth,
    effectivePinCount: pinning.effectivePinCount,
    effectiveRightPinCount: pinning.effectiveRightPinCount,
    actionsPinnedLeft: pinning.actionsPinnedLeft,
    actionsPinnedRight: pinning.actionsPinnedRight,
  });

  const { getTableProps, getTableBodyProps, headerGroups, footerGroups, rows, prepareRow, totalColumnsWidth } = useTable(
    {
      columns: allColumns,
      data,
      defaultColumn: DEFAULT_COLUMN,
      // Forwarded onto the table instance, which is what a `Cell` receives spread: this
      // is how a cell reaches the caller's own callbacks and lookups without the column
      // config having to be rebuilt as a factory closure.
      userList,
      context,
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

  const hasColumnFooter = React.useMemo(() => cols.some((c) => c.Footer), [cols]);
  const renderFooter = showFooter !== undefined ? showFooter : footerLeft != null || hasColumnFooter;

  // ----- Geometry -----
  const bodyWrapRef = React.useRef(null);
  const headRef = React.useRef(null);
  const footRef = React.useRef(null);
  const toolbarRef = React.useRef(null);
  // `toolbar` is either a boolean or a config object; normalize once so the rest reads
  // one shape. It sits OUTSIDE the scrollport — see the note in Toolbar.js.
  const showToolbar = !!toolbar;
  const toolbarConfig = toolbar && typeof toolbar === 'object' ? toolbar : {};
  const { listH, headH, toolH } = useBandHeights({
    containerRef,
    headRef,
    footRef,
    toolbarRef,
    deps: [renderFooter, height, rows.length, showToolbar],
  });

  // ----- Scrolling, windowing and the overlay bars -----
  // The scroll handler drives the bars through a ref, so the (passive) listener never has
  // to be re-attached when the sync closure changes.
  const syncBarsRef = React.useRef(() => {});
  const { scrollTop, onWrapScroll } = useTableScroll({
    containerRef,
    hasPinned,
    hasPinnedRight,
    rowSnap,
    onFrameRef: syncBarsRef,
  });
  const bars = useOverlayScrollbars({ containerRef, listH, syncBarsRef, onWrapScroll });

  // ----- Selection and keyboard navigation -----
  const { selectedIndex, setSelectedIndex, selectedIndexRef, onKeyDown, selectRow } = useRowNavigation({
    containerRef,
    rows,
    prepareRow,
    rowHeight,
    listH,
    rowNavigation,
    onRowSelect,
    onRowEnter,
    selectedBg,
    initialSelectedId,
    rowIdKey,
    initialScrollLeft,
  });

  // ----- Header drags -----
  const guideRef = React.useRef(null);
  const dropRef = React.useRef(null);
  const { startColResize, startColReorder, onHeaderClickCapture } = useColumnDrag({
    rootRef,
    containerRef,
    guideRef,
    dropRef,
    orderRef: layout.orderRef,
    minColumnWidth,
    setColumnWidth: layout.setColumnWidth,
    setColumnOrder: layout.setColumnOrder,
  });

  useTableHandle(ref, {
    containerRef,
    pinning,
    layout,
    resizable,
    reorderable,
    actionWidth,
    selectRow,
  });

  // ----- What the built-in toolbar needs -----
  // The freeze menu counts in VISIBLE CALLER columns — the same units as the pin
  // boundaries themselves — so it is built from `cols`, not from the raw config.
  const pinColumns = React.useMemo(
    () =>
      showToolbar
        ? cols.map((c, i) => ({
            label: typeof c.Header === 'string' && c.Header ? c.Header : colIdOf(c) || `Column ${i + 1}`,
          }))
        : [],
    [cols, showToolbar]
  );
  const toolbarColumnList = React.useCallback(
    () => layout.getColumnList({ resizable, reorderable, actionWidth }),
    [layout, resizable, reorderable, actionWidth]
  );
  const refocus = React.useCallback(() => {
    if (containerRef.current) containerRef.current.focus({ preventScroll: true });
  }, []);
  const toolbarApi = React.useMemo(
    () => ({
      toggleColumn: layout.toggleColumn,
      moveColumn: layout.moveColumn,
      showAllColumns: () => layout.setHiddenColumns([]),
      resetColumnWidths: () => layout.resetColumnWidths(),
      resetColumnOrder: () => layout.setColumnOrder(null),
      setLeftPinCount: pinning.setPinCount,
      setRightPinCount: pinning.setRightPinCount,
    }),
    [layout.toggleColumn, layout.moveColumn, layout.setHiddenColumns, layout.resetColumnWidths, layout.setColumnOrder, pinning.setPinCount, pinning.setRightPinCount]
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
    [rows, prepareRow, rowStyle, selectedBg, rowNavigation, fontPx, allColumns, rowHeight, pinnedLeft, pinnedRight, rowSnap, selectedIndexRef, setSelectedIndex]
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
      style={{
        position: 'relative',
        width: '100%',
        height: resolveHeight(height),
        // Only with a toolbar: the root becomes a column so the scrollport takes whatever
        // height is left over. Without one the scrollport is simply the whole root, and
        // the markup stays exactly as it always was.
        ...(showToolbar ? { display: 'flex', flexDirection: 'column' } : null),
        ...style,
      }}
    >
      {showToolbar && (
        <Toolbar
          toolbarRef={toolbarRef}
          fontPx={fontPx}
          config={toolbarConfig}
          getColumnList={toolbarColumnList}
          pinColumns={pinColumns}
          pin={{
            left: pinning.effectivePinCount,
            maxLeft: pinning.maxPinCount,
            right: pinning.effectiveRightPinCount,
            maxRight: pinning.maxRightPinCount,
          }}
          api={toolbarApi}
          refocus={refocus}
        />
      )}
      <div
        className="ft-wrap ct-wrap ft-nobar"
        ref={containerRef}
        tabIndex={rowNavigation ? 0 : undefined}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          ...(showToolbar ? { flex: '1 1 auto', minHeight: 0 } : { height: '100%' }),
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
          <TableHead
            headerGroups={headerGroups}
            headRef={headRef}
            fontPx={fontPx}
            sortable={sortable}
            searchable={searchable}
            resizable={resizable}
            reorderable={reorderable}
            pinnedLeft={pinnedLeft}
            pinnedRight={pinnedRight}
            startColReorder={startColReorder}
            startColResize={startColResize}
            onHeaderClickCapture={onHeaderClickCapture}
            resetColumnWidths={layout.resetColumnWidths}
          />

          <TableBody
            bodyProps={getTableBodyProps()}
            bodyWrapRef={bodyWrapRef}
            rows={rows}
            rowHeight={rowHeight}
            listH={listH}
            firstIdx={firstIdx}
            lastIdx={lastIdx}
            itemData={itemData}
            loading={isLoading}
            loadingText={loadingText}
            dataFetched={isFetched}
            emptyText={emptyText}
          />

          {renderFooter && (
            <TableFoot
              footerGroups={footerGroups}
              footRef={footRef}
              fontPx={fontPx}
              footerLeft={footerLeft}
              pinnedLeft={pinnedLeft}
              pinnedRight={pinnedRight}
            />
          )}
        </div>
      </div>

      <OverlayBars
        headH={headH}
        listH={listH}
        topOffset={toolH}
        vTrackRef={bars.vTrackRef}
        vThumbRef={bars.vThumbRef}
        hTrackRef={bars.hTrackRef}
        hThumbRef={bars.hThumbRef}
        startThumbDrag={bars.startThumbDrag}
        onTrackDown={bars.onTrackDown}
        guideRef={guideRef}
        dropRef={dropRef}
      />
    </div>
  );
});

export default FreezeTable;
