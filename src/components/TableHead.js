import React from 'react';
import { alignFlex } from '../lib/columns';
import { cx, skin } from '../lib/slots';
import { v } from '../lib/theme';

/**
 * The sticky header row: label + sort arrow, the per-column filter box, the resize grip
 * and the pin marker on whichever column is currently the freeze boundary.
 *
 * The header cell is also the drag surface for BOTH header drags — see useColumnDrag for
 * how one press is split between sorting, reordering and resizing.
 *
 * On the style objects below: `position`, `top`, `left`/`right`, `zIndex` and `flex` are
 * the freeze mechanism itself and are always applied. Only the paint goes through
 * `skin()`, which `unstyled` turns off — see lib/slots.js for why the split lives at each
 * call site rather than in a central list.
 */
export const TableHead = ({
  headerGroups,
  headRef,
  fontPx,
  sortable,
  searchable,
  resizable,
  reorderable,
  pinnedLeft,
  pinnedRight,
  startColReorder,
  startColResize,
  onHeaderClickCapture,
  resetColumnWidths,
  classNames,
  ui,
  unstyled,
}) => (
  <React.Fragment>
    {headerGroups.map((headerGroup) => {
      const { key: headerGroupKey, ...headerGroupProps } = headerGroup.getHeaderGroupProps();
      return (
        <div
          key={headerGroupKey}
          {...headerGroupProps}
          ref={headRef}
          className={cx('ft-head ct-head', classNames.head)}
          style={{
            ...headerGroupProps.style,
            flex: '0 0 auto',
            position: 'sticky',
            top: 0,
            zIndex: 4,
            ...skin(unstyled, {
              background: v('header-bg'),
              borderBottom: `1px solid ${v('border')}`,
            }),
          }}
        >
          {headerGroup.headers.map((column) => {
            const canSort = sortable && !column.disableSortBy;
            const canSearch = searchable && column.canFilter && !column.disableFilters;
            // The status strip is a fixed 4px bar — there is nothing in it to resize.
            const canResize = resizable && !column.disableResizing && column.id !== '__strip';
            // …and nothing to move: it belongs to the row, not to the caller's columns.
            const canReorder = reorderable && !column.disableReordering && column.id !== '__strip';
            const { key: headerKey, ...headerProps } = column.getHeaderProps();
            const sortDir = column.isSorted ? (column.isSortedDesc ? 'desc' : 'asc') : null;
            const isPinned = column.pinned || column.pinnedRight;
            return (
              <div
                key={headerKey}
                {...headerProps}
                className={cx('ft-th ct-th', classNames.th)}
                data-ct-col={column.id}
                onPointerDown={canReorder ? startColReorder(column.id) : undefined}
                onClickCapture={canReorder ? onHeaderClickCapture : undefined}
                data-ct-pin={isPinned ? '1' : undefined}
                data-ct-pin-last={column.pinnedLast ? '1' : undefined}
                data-ct-pin-right-first={column.pinnedRightFirst ? '1' : undefined}
                style={{
                  ...headerProps.style,
                  boxSizing: 'border-box',
                  // Containing block for the resize grip. A pinned header overrides
                  // this with `sticky`, which is just as good an anchor.
                  position: 'relative',
                  ...skin(unstyled, { padding: column.noPadding ? 0 : '7px 12px 9px' }),
                  ...(isPinned
                    ? {
                        position: 'sticky',
                        ...(column.pinned
                          ? { left: pinnedLeft[column.id] || 0 }
                          : { right: pinnedRight[column.id] || 0 }),
                        // above the scrolling header cells it overlaps
                        zIndex: 5,
                        // Not optional under `unstyled`: a frozen header cell with a
                        // transparent background lets the scrolling columns show
                        // through it. It is structural, not decoration.
                        background: v('header-bg'),
                      }
                    : {}),
                }}
              >
                <div
                  {...(canSort ? column.getSortByToggleProps({ title: undefined }) : {})}
                  className={cx('ft-th-label ct-th-label', classNames.thLabel)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    // sort icon sits at the opposite end of the column from the header text:
                    // left-aligned header -> icon pushed to the far right; right-aligned -> far left.
                    justifyContent: canSort && column.align !== 'center' ? 'space-between' : alignFlex(column.align),
                    gap: 4,
                    cursor: canSort ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    ...skin(unstyled, {
                      fontWeight: 700,
                      fontSize: fontPx,
                      color: v('header-text'),
                    }),
                  }}
                >
                  {canSort && column.align === 'right' && ui.SortIcon && <ui.SortIcon direction={sortDir} />}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{column.render('Header')}</span>
                    {/* Small blue pin on the freeze-boundary column only — the
                        indicator of how far the table is frozen. Changing the
                        boundary is done from the toolbar (or the caller's own menu,
                        via the imperative setPinCount), not from the header. */}
                    {((column.pinnedLast && column.pinIndex != null) || column.pinnedRightFirst) && ui.PinIcon && (
                      <ui.PinIcon
                        title={
                          column.pinnedLast
                            ? 'Columns up to here are pinned'
                            : 'Columns from here are pinned to the right'
                        }
                      />
                    )}
                  </span>
                  {canSort && column.align !== 'right' && ui.SortIcon && <ui.SortIcon direction={sortDir} />}
                </div>
                {canSearch && (
                  <div className={cx('ft-th-filter ct-th-filter', classNames.thFilter)} style={{ marginTop: 4 }}>
                    {column.render('Filter')}
                  </div>
                )}
                {canResize && (
                  <div
                    className={cx('ft-resizer ct-resizer', classNames.resizer)}
                    onPointerDown={startColResize(column.id)}
                    onDoubleClick={() => resetColumnWidths(column.id)}
                    title="Drag to resize · double-click to reset"
                  />
                )}
              </div>
            );
          })}
        </div>
      );
    })}
  </React.Fragment>
);

export default TableHead;
