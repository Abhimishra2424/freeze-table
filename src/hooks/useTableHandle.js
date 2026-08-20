import React from 'react';

/**
 * The imperative `ref` API — the whole of what a caller's toolbar talks to.
 *
 * Two rules run through all of it:
 *
 *  - **getters read the mirrors, not this render's state.** A caller that calls a setter
 *    and then a getter in the SAME handler (`toggleColumn(id)` then `getHiddenColumns()`
 *    to refresh its menu) would otherwise read the value from before its own call —
 *    React has not re-rendered at that point.
 *  - **pin getters report the EFFECTIVE (viewport-capped) boundary**, and `getMax…`
 *    reports the cap itself, so a menu can disable the entries beyond it.
 */
export const useTableHandle = (
  ref,
  {
    containerRef,
    pinning,
    layout,
    resizable,
    reorderable,
    actionWidth,
    selectRow,
  }
) => {
  const {
    pinCount,
    rightPinCount,
    effectivePinCount,
    maxPinCount,
    effectiveRightPinCount,
    maxRightPinCount,
    setPinCount,
    setRightPinCount,
  } = pinning;
  const {
    colWidthsRef,
    hiddenRef,
    orderRef,
    setColumnWidth,
    setColumnWidths,
    resetColumnWidths,
    setHiddenColumns,
    toggleColumn,
    setColumnOrder,
    moveColumn,
    getColumnList,
  } = layout;

  React.useImperativeHandle(ref, () => ({
    // Let the parent re-focus the table (e.g. after a modal closes, return focus to the
    // rows) and read the current horizontal scroll, so it can be handed back as
    // `initialScrollLeft` when the list is re-entered.
    focus: () => containerRef.current && containerRef.current.focus({ preventScroll: true }),
    getScrollLeft: () => (containerRef.current ? containerRef.current.scrollLeft : 0),

    // ----- Freeze boundaries -----
    // 0 = nothing frozen on that edge; N = the FIRST N caller columns on the left, the
    // LAST N on the right. Both are persisted via pinStorageKey.
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
    // getColumnWidths() reports only the columns the USER has resized — a column nobody
    // has touched is absent from the map and renders at its configured width.
    getColumnWidths: () => ({ ...colWidthsRef.current }),
    setColumnWidth: (id, px) => setColumnWidth(id, px),
    resetColumnWidths: (id) => resetColumnWidths(id),

    // ----- Column visibility -----
    getHiddenColumns: () => hiddenRef.current.slice(),
    setHiddenColumns: (ids) => setHiddenColumns(ids),
    toggleColumn: (id, visible) => toggleColumn(id, visible),
    showAllColumns: () => setHiddenColumns([]),

    // ----- Column order -----
    // A flat list of ids in DISPLAY order, hidden columns included (it is a layout, not a
    // view) and with `'__actions'` in it whenever an Actions renderer is given. A list
    // passed to setColumnOrder does not have to be complete: ids it leaves out are
    // slotted back in beside their CONFIGURED neighbours (the same merge a stored order
    // gets when the column config has grown since). `null` drops the user's order
    // entirely and goes back to the caller's array order.
    getColumnOrder: () => orderRef.current.slice(),
    setColumnOrder: (ids) => setColumnOrder(ids),
    moveColumn: (id, toIndex) => moveColumn(id, toIndex),
    resetColumnOrder: () => setColumnOrder(null),

    // Everything a column menu needs, in display order, the Action column included.
    getColumnList: () => getColumnList({ resizable, reorderable, actionWidth }),

    // ----- The whole layout, as one value -----
    // Four separate choices (freeze boundaries, widths, hidden set, order) that a user
    // makes together and expects to get back together. `pinStorageKey` already persists
    // them per browser; this is the same state as a plain object, so it can be stored
    // per USER instead — saved views, a layout that follows someone between machines, or
    // an "apply this preset" button. Pins are reported UNCAPPED, so a boundary saved on a
    // wide screen is not trimmed by whatever window it happened to be read from.
    getLayout: () => ({
      pins: { left: pinCount, right: rightPinCount },
      widths: { ...colWidthsRef.current },
      hidden: hiddenRef.current.slice(),
      order: orderRef.current.slice(),
    }),
    // Every key is optional: pass only `{ hidden: [...] }` and the rest is left alone.
    // `null` (or `{}` with `reset: true`) puts everything back to the column config.
    setLayout: (next) => {
      if (next == null) {
        setPinCount(null);
        setRightPinCount(null);
        setColumnWidths({});
        setHiddenColumns([]);
        setColumnOrder(null);
        return;
      }
      if (next.pins) {
        if (next.pins.left !== undefined) setPinCount(next.pins.left == null ? null : Math.max(0, parseInt(next.pins.left, 10) || 0));
        if (next.pins.right !== undefined) setRightPinCount(next.pins.right == null ? null : Math.max(0, parseInt(next.pins.right, 10) || 0));
      }
      if (next.widths !== undefined) setColumnWidths(next.widths || {});
      if (next.hidden !== undefined) setHiddenColumns(next.hidden || []);
      if (next.order !== undefined) setColumnOrder(next.order && next.order.length ? next.order : null);
    },
    resetLayout: () => {
      setPinCount(null);
      setRightPinCount(null);
      setColumnWidths({});
      setHiddenColumns([]);
      setColumnOrder(null);
    },

    selectRow,
  }));
};

export default useTableHandle;
