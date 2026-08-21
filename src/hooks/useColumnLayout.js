import React from 'react';
import { applyLayout, buildConfigOrder, colIdOf, colWidthOf, reconcileOrder } from '../lib/columns';
import { normalizeColumns } from '../lib/columnTypes';

/**
 * Column widths, visibility and order — three user choices built on one pattern: the
 * column config carries the DEFAULT (`width` / `minWidth`, `hidden`, the array order),
 * the user's choice lives in state here and is applied on top, and each one persists
 * under `pinStorageKey`.
 *
 * `hideable: false` locks a column visible (a key column the list is unusable without);
 * `disableResizing` / `disableReordering` drop its grip / its drag.
 *
 * Every setter also writes its value into a REF before calling setState, because they
 * are called from pointer handlers and from the imperative ref, both of which can hold
 * a closure from an older render — and because a caller that calls a setter and then a
 * getter in the SAME handler (`toggleColumn(id)` then `getHiddenColumns()` to refresh
 * its menu) would otherwise read the value from before its own call.
 */
export const useColumnLayout = ({
  columns: rawColumns,
  formatOptions,
  defaultLayout,
  hasActions,
  actionIndex,
  minColumnWidth,
  storage,
  onColumnResize,
  onColumnVisibilityChange,
  onColumnOrderChange,
}) => {
  const { readJson, persist } = storage;

  // The caller's config with the `type` / `footer` / `format` shorthands expanded (and a
  // bare `width` given a matching `minWidth`). Everything below — including
  // getColumnList() — works on the EXPANDED columns, so a `type: 'date'` column reports
  // the 110px width it actually renders at rather than the 90px default it was never
  // given. Columns that use none of the shorthands come back untouched, identity
  // included, so this cannot break the memo chain on its own.
  const columns = React.useMemo(() => normalizeColumns(rawColumns, formatOptions), [rawColumns, formatOptions]);

  // Initial state for all three choices, highest priority first: what localStorage has
  // for this `pinStorageKey`, then the caller's `defaultLayout` (a layout loaded from a
  // server, say), then the column config's own defaults. A stored layout wins because it
  // is the more recent expression of the same user's preference.
  // ----- Widths -----
  const [colWidths, setColWidths] = React.useState(() => readJson('ctW') || (defaultLayout && defaultLayout.widths) || {});

  // ----- Visibility -----
  const lockedIds = React.useMemo(
    () => new Set(columns.filter((c) => c.hideable === false).map(colIdOf).filter(Boolean)),
    [columns]
  );
  const defaultHidden = React.useMemo(
    () => columns.filter((c) => c.hidden && c.hideable !== false).map(colIdOf).filter(Boolean),
    [columns]
  );
  const [userHidden, setUserHidden] = React.useState(() => {
    const stored = readJson('ctHide');
    if (Array.isArray(stored)) return stored;
    const seed = defaultLayout && defaultLayout.hidden;
    return Array.isArray(seed) ? seed : null;
  });
  const hiddenIds = userHidden != null ? userHidden : defaultHidden;

  // ----- Order -----
  // The Action column takes part as `'__actions'` — it is a real column in the layout,
  // so there is no reason it should be nailed to the right-hand end; `actionIndex` says
  // where it starts out.
  const configOrder = React.useMemo(
    () => buildConfigOrder({ columns, hasActions, actionIndex }),
    [columns, hasActions, actionIndex]
  );
  const [userOrder, setUserOrder] = React.useState(() => {
    const stored = readJson('ctOrd');
    if (Array.isArray(stored) && stored.length) return stored;
    const seed = defaultLayout && defaultLayout.order;
    return Array.isArray(seed) && seed.length ? seed : null;
  });
  // Always a complete, de-duplicated list of every configured column — a stored order
  // from an older version of the column config is merged, not trusted wholesale.
  const order = React.useMemo(() => reconcileOrder(configOrder, userOrder), [configOrder, userOrder]);

  // The laid-out caller columns (hidden dropped, widths applied, in the user's order)
  // plus where the Action column now sits among them.
  const layout = React.useMemo(
    () => applyLayout({ columns, hiddenIds, colWidths, order, hasActions }),
    [columns, hiddenIds, colWidths, order, hasActions]
  );

  // Latest-value mirrors — see the note in the doc comment above.
  const colWidthsRef = React.useRef(colWidths);
  colWidthsRef.current = colWidths;
  const hiddenRef = React.useRef(hiddenIds);
  hiddenRef.current = hiddenIds;
  const orderRef = React.useRef(order);
  orderRef.current = order;
  const configOrderRef = React.useRef(configOrder);
  configOrderRef.current = configOrder;

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

  // Replace the whole width map at once — what setLayout() and a "reset widths" menu
  // entry need. `null` falls back to the configured widths.
  const setColumnWidths = React.useCallback(
    (map) => {
      const next = {};
      Object.keys(map || {}).forEach((id) => {
        const w = Math.max(minColumnWidth, Math.round(parseFloat(map[id]) || 0));
        if (id && Number.isFinite(w)) next[id] = w;
      });
      colWidthsRef.current = next;
      setColWidths(next);
      persist('ctW', next);
      if (onColumnResize) onColumnResize(null, null, next);
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

  // Replace the whole order. `null` clears the user's choice and falls back to the
  // caller's array order. Whatever comes in is reconciled first, so a caller can pass a
  // partial list ("these three first") and the rest stays where the config put it.
  const setColumnOrder = React.useCallback(
    (ids) => {
      const next = ids == null ? null : reconcileOrder(configOrderRef.current, ids.slice());
      orderRef.current = next || configOrderRef.current;
      setUserOrder(next);
      // An empty array reads back as "no stored order" — one entry instead of a
      // remove/set split, and a reset then behaves the same on a reload as in place.
      persist('ctOrd', next || []);
      if (onColumnOrderChange) onColumnOrderChange(orderRef.current.slice());
    },
    [persist, onColumnOrderChange]
  );

  // Move one column to a position in the order list — what a menu's ↑ / ↓ buttons want.
  // `toIndex` is read AFTER the column has been lifted out, so `position - 1` /
  // `position + 1` step it one place either way.
  const moveColumn = React.useCallback(
    (id, toIndex) => {
      const cur = orderRef.current.slice();
      const from = cur.indexOf(id);
      if (from < 0) return;
      cur.splice(from, 1);
      const to = Math.max(0, Math.min(cur.length, parseInt(toIndex, 10) || 0));
      if (to === from) return;
      cur.splice(to, 0, id);
      setColumnOrder(cur);
    },
    [setColumnOrder]
  );

  /**
   * One entry per column IN DISPLAY ORDER — everything a column menu needs, including
   * the Action column, so the menu can move that one too. `index` is the column's place
   * in the caller's `columns` array (null for the Action column); `position` is its
   * place in the order, which is what moveColumn() takes.
   */
  const getColumnList = React.useCallback(
    ({ resizable, reorderable, actionWidth }) => {
      const byId = new Map();
      columns.forEach((c, i) => byId.set(colIdOf(c) || `__col${i}`, { c, i }));
      return orderRef.current
        .map((key, position) => {
          if (key === '__actions') {
            return {
              id: '__actions',
              index: null,
              position,
              header: 'Action',
              hidden: false,
              hideable: false,
              resizable: resizable,
              movable: reorderable,
              width: colWidthsRef.current.__actions != null ? colWidthsRef.current.__actions : actionWidth,
            };
          }
          const entry = byId.get(key);
          if (!entry) return null;
          const { c, i } = entry;
          const id = colIdOf(c);
          return {
            id,
            index: i,
            position,
            // What a menu can print. A `Header` is often a node — a sort arrow beside
            // the text, a unit under it — and a node cannot be an entry in a dropdown,
            // so those columns used to show their raw id ('employee_code') in the
            // Columns and Freeze menus. `label` is the plain-text name to use instead;
            // a string `Header` still works on its own and needs nothing.
            header: c.label || (typeof c.Header === 'string' ? c.Header : undefined),
            hidden: !!(id && c.hideable !== false && hiddenRef.current.indexOf(id) >= 0),
            hideable: !!id && c.hideable !== false,
            resizable: !!id && resizable && !c.disableResizing,
            movable: !!id && reorderable && !c.disableReordering,
            width: id && colWidthsRef.current[id] != null ? colWidthsRef.current[id] : colWidthOf(c),
          };
        })
        .filter(Boolean);
    },
    [columns]
  );

  return {
    cols: layout.cols,
    actionPos: layout.actionPos,
    colWidths,
    hiddenIds,
    order,
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
  };
};

export default useColumnLayout;
