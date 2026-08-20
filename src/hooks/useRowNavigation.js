import React from 'react';

/**
 * Keyboard row navigation (↑/↓/Home/End/Enter), the selection highlight, and the two
 * "restore where I was" behaviours that go with them.
 *
 * The highlight is repainted IMPERATIVELY, by walking the `[data-ct-index]` nodes,
 * because the rows are memoized and must not re-render on a selection change: a
 * state-driven highlight re-rendered every visible row (each with icon-heavy action
 * cells) on every keypress, which is what made arrow navigation visibly laggy on wide
 * lists. `selectedIndexRef` is what a freshly mounted row reads for its first paint.
 */
export const useRowNavigation = ({
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
}) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const selectedIndexRef = React.useRef(0);
  const scrollPendingRef = React.useRef(null);

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
    [containerRef, listH, rowHeight]
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
  }, [containerRef, rowNavigation]);

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

  // Selection highlight, applied imperatively so only the affected DOM nodes change on
  // ↑/↓ (see the note at the top of this file).
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
  }, [containerRef, selectedIndex, selectedBg, rowNavigation, rows]);

  // Move the selection (and the focus) to a row — e.g. a list that re-fetches on a
  // Search click wants the first row selected + focused once the results land, but the
  // table is already mounted so the mount-time focus effect won't fire again.
  const selectRow = React.useCallback(
    (index) => {
      const i = Math.max(0, parseInt(index, 10) || 0);
      setSelectedIndex(i);
      scrollPendingRef.current = { index: i, align: 'smart' };
      if (containerRef.current) containerRef.current.focus({ preventScroll: true });
    },
    [containerRef]
  );

  return { selectedIndex, setSelectedIndex, selectedIndexRef, onKeyDown, selectRow };
};

export default useRowNavigation;
