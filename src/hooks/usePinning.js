import React from 'react';
import {
  computeMaxLeftPinCount,
  computeMaxRightPinCount,
  countLeadingPinned,
  countTrailingPinned,
  rightBlockWidthOf,
} from '../lib/columns';

/**
 * The freeze boundaries. The `pinned` flags in the column config are only the DEFAULT;
 * the whole choice is TWO NUMBERS — how many leading columns are frozen against the left
 * edge and how many trailing ones against the right. Freezing only makes sense as a
 * run at an edge: a frozen middle column would have its neighbours scroll away
 * underneath it, so each side is fully described by a single count.
 *
 * The caller changes them at runtime through the imperative ref, and both persist under
 * `pinStorageKey`. Everything here is computed from the LAID-OUT columns (`cols`), never
 * from the `columns` prop, so a hidden column does not count towards a boundary and a
 * dragged one freezes according to where it now is.
 */
export const usePinning = ({
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
}) => {
  const { readNumber, persist } = storage;
  const seed = (defaultLayout && defaultLayout.pins) || {};

  const defaultPinCount = React.useMemo(() => countLeadingPinned(cols), [cols]);
  const defaultRightPinCount = React.useMemo(() => countTrailingPinned(cols), [cols]);
  // Stored choice, else the caller's `defaultLayout`, else the column config's flags.
  const [userPinCount, setUserPinCount] = React.useState(() => {
    const stored = readNumber('ctPin');
    return stored != null ? stored : seed.left != null ? seed.left : null;
  });
  const [userRightPinCount, setUserRightPinCount] = React.useState(() => {
    const stored = readNumber('ctPinR');
    return stored != null ? stored : seed.right != null ? seed.right : null;
  });
  const pinCount = userPinCount != null ? userPinCount : defaultPinCount;
  const rightPinCount = userRightPinCount != null ? userRightPinCount : defaultRightPinCount;

  // The right block is budgeted first, then whatever viewport is left funds the left one.
  const maxRightPinCount = React.useMemo(
    () => computeMaxRightPinCount({ cols, wrapW, hasActions, actionPos, actionColWidth }),
    [cols, wrapW, hasActions, actionPos, actionColWidth]
  );
  const effectiveRightPinCount = Math.min(rightPinCount, maxRightPinCount);

  // Where the Action column freezes now that it can be dragged anywhere. It joins
  // whichever block it is INSIDE — a frozen run has to stay contiguous, so an Action
  // column parked in the middle of the scrolling columns cannot freeze at all, and
  // `pinActions` only means anything while it still sits at one end.
  //   left run  = the first n caller columns, so it is inside iff actionPos < n
  //   right run = the last  m caller columns, so it is inside iff actionPos >= len - m
  const actionsPinnedRight =
    hasActions &&
    ((effectiveRightPinCount > 0 && actionPos >= cols.length - effectiveRightPinCount) ||
      (pinActions && actionPos === cols.length));

  const rightBlockWidth = React.useMemo(
    () => rightBlockWidthOf({ cols, effectiveRightPinCount, actionsPinnedRight, actionColWidth }),
    [cols, effectiveRightPinCount, actionsPinnedRight, actionColWidth]
  );

  const maxPinCount = React.useMemo(
    () =>
      computeMaxLeftPinCount({
        cols,
        wrapW,
        hasActions,
        actionPos,
        actionColWidth,
        stripWidth: rowStripColor ? stripWidth : 0,
        rightBlockWidth,
        effectiveRightPinCount,
      }),
    [cols, wrapW, hasActions, actionPos, actionColWidth, rowStripColor, stripWidth, rightBlockWidth, effectiveRightPinCount]
  );
  const effectivePinCount = Math.min(pinCount, maxPinCount);

  // Mirror of actionsPinnedRight for the left edge — the Action column dragged in front
  // of the frozen leading run (or, with `pinActions`, right to the front of the table)
  // freezes there instead. Right wins if both somehow claim it; the caps keep the two
  // runs from overlapping, so that only happens with a single-column table.
  const actionsPinnedLeft =
    hasActions &&
    !actionsPinnedRight &&
    ((effectivePinCount > 0 && actionPos < effectivePinCount) || (pinActions && actionPos === 0));

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

  return {
    // The UNCAPPED counts, for saving a layout: a boundary the current viewport cannot
    // honour is still what the user asked for, and must come back on a wider screen
    // rather than being permanently trimmed by whatever window it was saved from.
    pinCount,
    rightPinCount,
    effectivePinCount,
    maxPinCount,
    effectiveRightPinCount,
    maxRightPinCount,
    actionsPinnedLeft,
    actionsPinnedRight,
    setPinCount,
    setRightPinCount,
  };
};

export default usePinning;
