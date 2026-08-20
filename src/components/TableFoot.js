import React from 'react';
import { alignFlex } from '../lib/columns';

/**
 * The sticky totals footer. A column's `Footer` function receives the table instance, so
 * `info.rows` is the FILTERED row set — the totals follow the search boxes.
 *
 * `footerLeft` is a static label laid over the row absolutely (it belongs to no column),
 * and is `pointerEvents: none` so it never swallows a click meant for the footer cell
 * underneath it.
 */
export const TableFoot = ({ footerGroups, footRef, fontPx, footerLeft, pinnedLeft, pinnedRight }) => (
  <React.Fragment>
    {footerGroups.map((group) => {
      const { key: footerGroupKey, ...footerGroupProps } = group.getFooterGroupProps();
      return (
        <div
          key={footerGroupKey}
          {...footerGroupProps}
          ref={footRef}
          className="ft-foot ct-foot"
          style={{
            ...footerGroupProps.style,
            flex: '0 0 auto',
            position: 'sticky',
            bottom: 0,
            zIndex: 4,
            background: '#f4f5f7',
            borderTop: '1px solid #e3e8ee',
          }}
        >
          {group.headers.map((column) => {
            const { key: footerKey, ...footerProps } = column.getFooterProps();
            return (
              <div
                key={footerKey}
                {...footerProps}
                className="ft-tf ct-tf"
                data-ct-pin={column.pinned || column.pinnedRight ? '1' : undefined}
                data-ct-pin-last={column.pinnedLast ? '1' : undefined}
                data-ct-pin-right-first={column.pinnedRightFirst ? '1' : undefined}
                style={{
                  ...footerProps.style,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: alignFlex(column.align),
                  padding: column.noPadding ? 0 : '8px 12px',
                  fontSize: fontPx,
                  fontWeight: 700,
                  color: '#000000',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textAlign: column.align || 'left',
                  ...(column.pinned || column.pinnedRight
                    ? {
                        position: 'sticky',
                        ...(column.pinned
                          ? { left: pinnedLeft[column.id] || 0 }
                          : { right: pinnedRight[column.id] || 0 }),
                        zIndex: 5,
                        background: '#f4f5f7',
                      }
                    : {}),
                }}
              >
                {column.render('Footer')}
              </div>
            );
          })}
          {footerLeft != null && (
            <div
              style={{
                position: 'absolute',
                left: 12,
                top: 0,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                fontSize: fontPx,
                fontWeight: 700,
                color: '#000000',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              {footerLeft}
            </div>
          )}
        </div>
      );
    })}
  </React.Fragment>
);

export default TableFoot;
