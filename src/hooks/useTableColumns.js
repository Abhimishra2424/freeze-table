import React from 'react';
import { stickyOffsets } from '../lib/columns';

/**
 * Assembles the column list react-table actually receives:
 *
 *   [ optional __strip ] + the laid-out caller columns + [ optional __actions ]
 *
 * and annotates every one of them with the freeze flags the header, body and footer
 * cells render from (`pinned`, `pinnedRight`, `pinnedLast`, `pinnedRightFirst`) plus
 * `pinIndex`, the column's position among the caller's VISIBLE columns — the number a
 * pin menu talks in ("pin up to here").
 *
 * Also returns the sticky `left` / `right` offset maps, which are just the cumulative
 * widths of the frozen columns before / beyond each frozen column.
 */
export const useTableColumns = ({
  cols,
  colWidths,
  Actions,
  fn,
  actionWidth,
  actionPos,
  rowStripColor,
  rowStripTitle,
  stripWidth,
  effectivePinCount,
  effectiveRightPinCount,
  actionsPinnedLeft,
  actionsPinnedRight,
}) => {
  const allColumns = React.useMemo(() => {
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
      // It is spliced in at the position the column ORDER gives it — normally the end,
      // but it is a real column and can be dragged anywhere the others can.
      const actionW = colWidths.__actions;
      const actionCol = {
        id: '__actions',
        Header: 'Action',
        align: 'center',
        width: actionW || 0.6,
        minWidth: actionW || actionWidth,
        disableFilters: true,
        disableSortBy: true,
        pinIndex: null,
        pinned: actionsPinnedLeft,
        pinnedRight: actionsPinnedRight,
        pinnedLast: false,
        pinnedRightFirst: false,
        Cell: ({ row }) => <Actions object={row.original} fn={fn} />,
      };
      // A dragged width pins all three (see the width note in applyLayout), but WITHOUT
      // one there must be no `maxWidth` KEY at all — react-table merges the column over
      // its defaults with Object.assign, which copies an explicit `undefined` straight
      // over the default `Number.MAX_SAFE_INTEGER`. The width then resolves as
      // `min(max(minWidth, width), undefined)` = NaN, which propagates into
      // `totalColumnsWidth` and lands as `min-width: NaN` on the table element.
      if (actionW) actionCol.maxWidth = actionW;
      base.splice(rowStripColor ? actionPos + 1 : actionPos, 0, actionCol);
    }
    // The status strip auto-freezes with the leading run — it sits left of everything,
    // and would otherwise be stranded outside the block. (The Action column used to get
    // the same treatment on the right; now that it can be moved, it freezes according to
    // which run it actually lies in — see actionsPinnedLeft / actionsPinnedRight.)
    let lastPinned = null;
    let firstPinnedRight = null;
    base.forEach((c) => {
      if (c.id === '__strip') c.pinned = effectivePinCount > 0;
      if (c.pinned) lastPinned = c;
      if (c.pinnedRight && !firstPinnedRight) firstPinnedRight = c;
    });
    if (lastPinned) lastPinned.pinnedLast = true;
    if (firstPinnedRight) firstPinnedRight.pinnedRightFirst = true;
    return base;
  }, [cols, colWidths, Actions, fn, actionWidth, actionPos, rowStripColor, rowStripTitle, stripWidth, effectivePinCount, effectiveRightPinCount, actionsPinnedLeft, actionsPinnedRight]);

  const hasPinned = React.useMemo(() => allColumns.some((c) => c.pinned), [allColumns]);
  const hasPinnedRight = React.useMemo(() => allColumns.some((c) => c.pinnedRight), [allColumns]);
  const offsets = React.useMemo(() => stickyOffsets(allColumns), [allColumns]);

  return { allColumns, hasPinned, hasPinnedRight, pinnedLeft: offsets.left, pinnedRight: offsets.right };
};

export default useTableColumns;
