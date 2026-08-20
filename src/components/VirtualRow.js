import React from 'react';
import { alignFlex } from '../lib/columns';

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
 */
export const VirtualRow = React.memo(function VirtualRow({ data, index }) {
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

export default VirtualRow;
