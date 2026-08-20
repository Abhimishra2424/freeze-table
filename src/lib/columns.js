/**
 * Pure column maths — no React, no DOM. Everything here is a function of its arguments,
 * which is the point: the freeze offsets, the pin caps and the order reconciliation are
 * the parts of this component most likely to break silently under a refactor, and
 * keeping them out of the render tree is what makes them testable on their own
 * (`npm run test:unit`).
 */

// Shared single-line ellipsis style for cells (kept exported so callers can reuse it).
export const ELLIPSIS = {
  width: '100%',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

// How many rows to render above / below the viewport.
export const OVERSCAN = 6;

// Smallest width a drag can leave a column at. Below roughly this the header label and
// the filter box have nowhere to go and the column stops being a usable hit target.
export const COL_MIN_WIDTH = 48;

// How far the pointer must travel across a header before the press stops being a
// click (sort) and becomes a reorder drag. Small enough that a deliberate drag arms
// immediately, large enough that the shake in an ordinary click never does.
export const DRAG_SLOP = 4;

// Minimum viewport width that must stay available for the SCROLLING (unpinned)
// columns — the pin cap keeps the frozen block at least this much narrower than the
// table. See computeMaxLeftPinCount for why exceeding it breaks the scroller.
export const PIN_MIN_SCROLLABLE = 250;

// react-table's default column width / floor, mirrored here because the width maths
// below has to agree with what react-table will actually render.
export const DEFAULT_COL_WIDTH = 1;
export const DEFAULT_COL_MIN_WIDTH = 90;

export const alignFlex = (a) => (a === 'right' ? 'flex-end' : a === 'center' ? 'center' : 'flex-start');

// react-table's effective column width: min(max(minWidth, width), maxWidth). Used both
// for the pin caps and for the sticky `left` / `right` offset of each pinned column.
export const colWidthOf = (c) =>
  Math.min(
    Math.max(c.minWidth != null ? c.minWidth : DEFAULT_COL_MIN_WIDTH, c.width != null ? c.width : DEFAULT_COL_WIDTH),
    c.maxWidth != null ? c.maxWidth : Infinity
  );

// The id react-table will key a column by: an explicit `id`, else a string accessor.
// A column with neither (an accessor FUNCTION and no id) cannot be addressed by the
// width / visibility APIs — react-table rejects such a column outright, so this is not
// a restriction this component adds.
export const colIdOf = (c) => c.id || (typeof c.accessor === 'string' ? c.accessor : undefined);

// The key a column takes part in the ORDER under. Columns with no addressable id still
// need a slot, or the order list would be incomplete and they could not be placed
// relative to their neighbours; they ride along under a positional key and simply
// cannot be dragged.
export const orderKeyOf = (c, i) => colIdOf(c) || `__col${i}`;

/**
 * Merge a user / stored column order with the CONFIG order. Ids the config no longer
 * carries are dropped, and ids the order does not mention — a column added to the
 * caller's array since the layout was saved — are put back where the CONFIG puts them,
 * next to the neighbour they were configured after. Appending them at the end instead
 * would make every newly added column look as though the user had dragged it there.
 */
export const reconcileOrder = (configIds, wanted) => {
  if (!wanted || !wanted.length) return configIds.slice();
  const known = new Set(configIds);
  const placed = new Set();
  const out = [];
  wanted.forEach((id) => {
    if (known.has(id) && !placed.has(id)) {
      placed.add(id);
      out.push(id);
    }
  });
  configIds.forEach((id, i) => {
    if (placed.has(id)) return;
    placed.add(id);
    // Land it just after the nearest preceding config neighbour that is already
    // placed; if none of them is, the column is configured first, so it goes first.
    let at = 0;
    for (let k = i - 1; k >= 0; k--) {
      const p = out.indexOf(configIds[k]);
      if (p >= 0) {
        at = p + 1;
        break;
      }
    }
    out.splice(at, 0, id);
  });
  return out;
};

/**
 * The caller's column array as an order list, with the Action column spliced in at the
 * position `actionIndex` asks for. This is the DEFAULT order — what the user's own
 * order is reconciled against.
 */
export const buildConfigOrder = ({ columns, hasActions, actionIndex }) => {
  const ids = columns.map(orderKeyOf);
  if (hasActions) {
    const at =
      actionIndex === 'first'
        ? 0
        : actionIndex === 'last' || actionIndex == null
        ? ids.length
        : Math.max(0, Math.min(ids.length, parseInt(actionIndex, 10) || 0));
    ids.splice(at, 0, '__actions');
  }
  return ids;
};

/**
 * The caller's columns as they are actually laid out: hidden ones dropped, resized ones
 * carrying their new width, all of them in the user's order. EVERYTHING downstream —
 * the pin defaults, the pin caps, `pinIndex`, the sticky offsets — is computed from
 * this list rather than from the `columns` prop, so a hidden column simply does not
 * exist as far as freezing and the cumulative left/right offsets are concerned, and a
 * moved column freezes according to where it now IS.
 *
 * A resize writes the same number into ALL THREE of width / minWidth / maxWidth,
 * because react-table renders a column at `min(max(minWidth, width), maxWidth)`:
 * writing only `width` would leave a column with `minWidth: 200` stuck at 200 however
 * far left it was dragged, and a column with a `maxWidth` could not be widened past it.
 * Setting all three collapses that expression to exactly the dragged number — the
 * config's floor and ceiling are the DEFAULT, and an explicit drag outranks them.
 *
 * `actionPos` comes out of the same pass: it is the Action column's insertion index
 * among the VISIBLE caller columns, which is what the pin maths needs (the frozen runs
 * are counted in caller columns, and the Action column is inside a run or outside it
 * depending on where it now sits).
 */
export const applyLayout = ({ columns, hiddenIds, colWidths, order, hasActions }) => {
  const hide = new Set(hiddenIds);
  const byKey = new Map();
  columns.forEach((c, i) => {
    const id = colIdOf(c);
    if (id && c.hideable !== false && hide.has(id)) return;
    const w = id ? colWidths[id] : undefined;
    byKey.set(orderKeyOf(c, i), w ? { ...c, width: w, minWidth: w, maxWidth: w } : c);
  });
  // Hiding literally every column would leave react-table with nothing to render — and
  // no header row to un-hide anything from. Falling back to the full list keeps the
  // table recoverable instead of blank.
  if (!byKey.size) return { cols: columns, actionPos: hasActions ? columns.length : -1 };
  const out = [];
  let actionPos = -1;
  order.forEach((id) => {
    if (id === '__actions') {
      actionPos = out.length;
      return;
    }
    if (byKey.has(id)) {
      out.push(byKey.get(id));
      byKey.delete(id);
    }
  });
  byKey.forEach((c) => out.push(c)); // anything the order somehow missed keeps its place
  return { cols: out, actionPos: hasActions ? (actionPos < 0 ? out.length : actionPos) : -1 };
};

// How many LEADING columns the config wants frozen on the left, and how many TRAILING
// ones on the right. `pinned: true` / `'left'` freeze from the left, `'right'` from the
// right. Only the leading run counts on the left and only the trailing run on the right
// — a frozen column in the middle would have its neighbours scroll out from under it,
// so each side is fully described by a single count.
export const countLeadingPinned = (cols) => {
  let n = 0;
  for (const c of cols) {
    if (c.pinned && c.pinned !== 'right') n++;
    else break;
  }
  return n;
};

export const countTrailingPinned = (cols) => {
  let n = 0;
  for (let i = cols.length - 1; i >= 0; i--) {
    if (cols[i].pinned === 'right') n++;
    else break;
  }
  return n;
};

/**
 * HARD CAP: the pinned block must never be as wide as the viewport. Beyond that there is
 * no room left to actually read the scrolling columns, and the frozen block starts
 * fighting the scroller instead of helping. Capping also matches the UX reality of
 * "freeze panes" in any spreadsheet.
 *
 * The right block is measured first (it is usually one or two columns, and the Action
 * column often rides along with it), then whatever viewport is left funds the left
 * block. A run of the last n caller columns also carries the Action column whenever the
 * Action column sits inside that run — i.e. from `cols.length - n` onwards. Only then
 * does its width come out of the right-hand budget.
 */
export const computeMaxRightPinCount = ({ cols, wrapW, hasActions, actionPos, actionColWidth }) => {
  if (!wrapW) return cols.length; // not measured yet — the cap kicks in right after mount
  const budget = wrapW - PIN_MIN_SCROLLABLE;
  let used = hasActions && actionPos === cols.length ? actionColWidth : 0;
  let n = 0;
  for (let i = cols.length - 1; i >= 0; i--) {
    used += colWidthOf(cols[i]);
    if (hasActions && actionPos === i) used += actionColWidth;
    if (used > budget) break;
    n++;
  }
  return n;
};

/** Mirror of computeMaxRightPinCount for the left edge, funded by what it leaves over. */
export const computeMaxLeftPinCount = ({
  cols,
  wrapW,
  hasActions,
  actionPos,
  actionColWidth,
  stripWidth,
  rightBlockWidth,
  effectiveRightPinCount,
}) => {
  if (!wrapW) return cols.length;
  const budget = wrapW - PIN_MIN_SCROLLABLE - rightBlockWidth;
  let used = stripWidth;
  let n = 0;
  for (let i = 0; i < cols.length; i++) {
    if (hasActions && actionPos === i) used += actionColWidth; // swept into this prefix
    used += colWidthOf(cols[i]);
    if (used > budget) break;
    n++;
  }
  return Math.min(n, cols.length - effectiveRightPinCount);
};

/** Total width of the right-hand frozen block, Action column included when it is in it. */
export const rightBlockWidthOf = ({ cols, effectiveRightPinCount, actionsPinnedRight, actionColWidth }) => {
  let w = actionsPinnedRight ? actionColWidth : 0;
  for (let i = cols.length - effectiveRightPinCount; i < cols.length; i++) w += colWidthOf(cols[i]);
  return w;
};

/**
 * Sticky `left` for each left-frozen column = total width of the frozen columns before
 * it, and the mirror image for the right block (walk backwards, accumulating the widths
 * beyond it). Keyed by the id react-table will use.
 */
export const stickyOffsets = (allColumns) => {
  const left = {};
  const right = {};
  let acc = 0;
  allColumns.forEach((c) => {
    if (!c.pinned) return;
    const id = colIdOf(c);
    if (id) left[id] = acc;
    acc += colWidthOf(c);
  });
  acc = 0;
  for (let i = allColumns.length - 1; i >= 0; i--) {
    const c = allColumns[i];
    if (!c.pinnedRight) continue;
    const id = colIdOf(c);
    if (id) right[id] = acc;
    acc += colWidthOf(c);
  }
  return { left, right };
};
