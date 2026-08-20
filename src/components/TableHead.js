import React from 'react';
import { PinIcon, SortIcon } from '../internal-ui';
import { alignFlex } from '../lib/columns';

/**
 * The sticky header row: label + sort arrow, the per-column filter box, the resize grip
 * and the pin marker on whichever column is currently the freeze boundary.
 *
 * The header cell is also the drag surface for BOTH header drags — see useColumnDrag for
 * how one press is split between sorting, reordering and resizing.
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
}) => (
  <React.Fragment>
    {headerGroups.map((headerGroup) => {
      const { key: headerGroupKey, ...headerGroupProps } = headerGroup.getHeaderGroupProps();
      return (
        <div
          key={headerGroupKey}
          {...headerGroupProps}
          ref={headRef}
          className="ft-head ct-head"
          style={{
            ...headerGroupProps.style,
            flex: '0 0 auto',
            background: '#ffffff',
            borderBottom: '1px solid #e3e8ee',
            position: 'sticky',
            top: 0,
            zIndex: 4,
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
            return (
              <div
                key={headerKey}
                {...headerProps}
                className="ft-th ct-th"
                data-ct-col={column.id}
                onPointerDown={canReorder ? startColReorder(column.id) : undefined}
                onClickCapture={canReorder ? onHeaderClickCapture : undefined}
                data-ct-pin={column.pinned || column.pinnedRight ? '1' : undefined}
                data-ct-pin-last={column.pinnedLast ? '1' : undefined}
                data-ct-pin-right-first={column.pinnedRightFirst ? '1' : undefined}
                style={{
                  ...headerProps.style,
                  padding: column.noPadding ? 0 : '7px 12px 9px',
                  boxSizing: 'border-box',
                  // Containing block for the resize grip. A pinned header overrides
                  // this with `sticky`, which is just as good an anchor.
                  position: 'relative',
                  ...(column.pinned || column.pinnedRight
                    ? {
                        position: 'sticky',
                        ...(column.pinned
                          ? { left: pinnedLeft[column.id] || 0 }
                          : { right: pinnedRight[column.id] || 0 }),
                        // above the scrolling header cells it overlaps
                        zIndex: 5,
                        background: '#ffffff',
                      }
                    : {}),
                }}
              >
                <div
                  {...(canSort ? column.getSortByToggleProps({ title: undefined }) : {})}
                  className="ft-th-label ct-th-label"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    // sort icon sits at the opposite end of the column from the header text:
                    // left-aligned header -> icon pushed to the far right; right-aligned -> far left.
                    justifyContent: canSort && column.align !== 'center' ? 'space-between' : alignFlex(column.align),
                    gap: 4,
                    cursor: canSort ? 'pointer' : 'default',
                    userSelect: 'none',
                    fontWeight: 700,
                    fontSize: fontPx,
                    color: '#000000',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {canSort && column.align === 'right' && <SortIcon direction={sortDir} />}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{column.render('Header')}</span>
                    {/* Small blue pin on the freeze-boundary column only — the
                        indicator of how far the table is frozen. Changing the
                        boundary is done from the toolbar (or the caller's own menu,
                        via the imperative setPinCount), not from the header. */}
                    {((column.pinnedLast && column.pinIndex != null) || column.pinnedRightFirst) && (
                      <PinIcon
                        title={
                          column.pinnedLast
                            ? 'Columns up to here are pinned'
                            : 'Columns from here are pinned to the right'
                        }
                      />
                    )}
                  </span>
                  {canSort && column.align !== 'right' && <SortIcon direction={sortDir} />}
                </div>
                {canSearch && <div className="ft-th-filter ct-th-filter" style={{ marginTop: 4 }}>{column.render('Filter')}</div>}
                {canResize && (
                  <div
                    className="ft-resizer ct-resizer"
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
