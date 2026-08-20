import React from 'react';
import { alignFlex } from '../lib/columns';
import { cx, skin } from '../lib/slots';
import { v } from '../lib/theme';

/**
 * One windowed row, absolutely positioned at `index * rowHeight` inside a
 * full-content-height container.
 *
 * Memoized, and it **must not** re-render on a selection change: the row reads the
 * selected index from a REF for its initial paint, and the selection-highlight effect in
 * FreezeTable repaints backgrounds imperatively (via the `data-ct-*` attributes below).
 * Without this, every ↑/↓ press re-rendered all visible rows — each with icon-heavy
 * action cells — which made arrow navigation visibly laggy on wide lists. Putting
 * `selectedIndex` into `itemData` reintroduces exactly that lag.
 *
 * ## Why the backgrounds are `var()` strings and not colours
 *
 * The hover is painted by the two handlers below writing `style.backgroundColor`
 * directly, which no stylesheet rule can override. Writing a CSS variable REFERENCE
 * instead is what makes the row hover themeable at all: the declaration is still inline
 * and still wins, but the value it resolves to comes from `--ft-row-hover` on the root,
 * i.e. from the consumer. The literal in each `v()` call stays as the fallback so a
 * table whose stylesheet never loaded (CSP, `unstyled`) still paints the right colour.
 */
export const VirtualRow = React.memo(function VirtualRow({ data, index }) {
  const { rows, prepareRow, rowStyle, selectedBg, rowNavigation, fontPx, selectedIndexRef, onSelect, rowHeight, pinnedLeft, pinnedRight, rowSnap, classNames, unstyled } = data;
  const style = { position: 'absolute', top: index * rowHeight, left: 0, width: '100%', height: rowHeight };
  const row = rows[index];
  prepareRow(row);
  const { key: rowKey, ...rowProps } = row.getRowProps({ style });
  const custom = (rowStyle && rowStyle(row.original)) || {};
  const customBg = custom.backgroundColor || '';
  const isSelected = rowNavigation && index === selectedIndexRef.current;
  const rowBg = unstyled ? '' : v('row-bg');
  // A status tint wins over the selection/hover highlight: it carries business
  // meaning (cancelled, failed to post) that must not be masked by a blue row.
  const baseBg = customBg || (isSelected ? selectedBg : rowBg);
  return (
    <div
      key={rowKey}
      {...rowProps}
      className={cx('ft-row ct-row', classNames.row)}
      data-ct-index={index}
      data-ct-bg={customBg || rowBg}
      data-ct-custom={customBg ? '1' : ''}
      onMouseEnter={(e) => {
        if (unstyled || customBg || index === selectedIndexRef.current) return;
        e.currentTarget.style.backgroundColor = v('row-hover');
      }}
      onMouseLeave={(e) => {
        if (unstyled) return;
        const sel = rowNavigation && index === selectedIndexRef.current;
        e.currentTarget.style.backgroundColor = customBg || (sel ? selectedBg : rowBg);
      }}
      onClick={() => onSelect(index)}
      style={{
        ...rowProps.style,
        cursor: 'default',
        // Snap target — see the scrollSnapType/scrollPaddingTop pair on .ft-wrap.
        scrollSnapAlign: rowSnap ? 'start' : undefined,
        // `rowStyle` is the caller's own decision and is honoured even when `unstyled`
        // strips the package's paint: they asked for this row to be tinted.
        color: custom.color,
        ...(customBg ? { backgroundColor: customBg } : null),
        ...skin(unstyled, {
          backgroundColor: baseBg,
          borderBottom: `1px solid ${v('row-border')}`,
        }),
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
            className={cx('ft-td ct-td', classNames.cell)}
            data-ct-pin={pinned || pinnedR ? '1' : undefined}
            data-ct-pin-last={pinned && cell.column.pinnedLast ? '1' : undefined}
            data-ct-pin-right-first={pinnedR && cell.column.pinnedRightFirst ? '1' : undefined}
            style={{
              ...cellProps.style,
              display: 'flex',
              alignItems: 'center',
              justifyContent: alignFlex(cell.column.align),
              overflow: 'hidden',
              textAlign: cell.column.align || 'left',
              ...skin(unstyled, {
                padding: cell.column.noPadding ? 0 : '0 12px',
                fontSize: fontPx,
              }),
              // `background: inherit` tracks the row's imperative bg changes
              // (selection / hover / status tint) with zero extra bookkeeping.
              ...(pinned || pinnedR
                ? {
                    position: 'sticky',
                    ...(pinned
                      ? { left: pinnedLeft[cell.column.id] || 0 }
                      : { right: pinnedRight[cell.column.id] || 0 }),
                    zIndex: 2,
                    // Structural, like the frozen header's background: a transparent
                    // frozen cell shows the scrolling columns sliding under it.
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

export default VirtualRow;
