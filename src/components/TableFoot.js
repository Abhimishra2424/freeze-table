import React from 'react';
import { alignFlex } from '../lib/columns';
import { cx, skin } from '../lib/slots';
import { v } from '../lib/theme';

/**
 * The sticky totals footer. A column's `Footer` function receives the table instance, so
 * `info.rows` is the FILTERED row set — the totals follow the search boxes.
 *
 * `footerLeft` is a static label laid over the row absolutely (it belongs to no column),
 * and is `pointerEvents: none` so it never swallows a click meant for the footer cell
 * underneath it.
 */
export const TableFoot = ({ footerGroups, footRef, fontPx, footerLeft, pinnedLeft, pinnedRight, classNames, unstyled }) => (
  <React.Fragment>
    {footerGroups.map((group) => {
      const { key: footerGroupKey, ...footerGroupProps } = group.getFooterGroupProps();
      return (
        <div
          key={footerGroupKey}
          {...footerGroupProps}
          ref={footRef}
          className={cx('ft-foot ct-foot', classNames.foot)}
          style={{
            ...footerGroupProps.style,
            flex: '0 0 auto',
            position: 'sticky',
            bottom: 0,
            zIndex: 4,
            ...skin(unstyled, {
              background: v('foot-bg'),
              borderTop: `1px solid ${v('border')}`,
            }),
          }}
        >
          {group.headers.map((column) => {
            const { key: footerKey, ...footerProps } = column.getFooterProps();
            const isPinned = column.pinned || column.pinnedRight;
            return (
              <div
                key={footerKey}
                {...footerProps}
                className={cx('ft-tf ct-tf', classNames.footCell)}
                data-ct-pin={isPinned ? '1' : undefined}
                data-ct-pin-last={column.pinnedLast ? '1' : undefined}
                data-ct-pin-right-first={column.pinnedRightFirst ? '1' : undefined}
                style={{
                  ...footerProps.style,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: alignFlex(column.align),
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textAlign: column.align || 'left',
                  ...skin(unstyled, {
                    padding: column.noPadding ? 0 : '8px 12px',
                    fontSize: fontPx,
                    fontWeight: 700,
                    color: v('foot-text'),
                  }),
                  ...(isPinned
                    ? {
                        position: 'sticky',
                        ...(column.pinned
                          ? { left: pinnedLeft[column.id] || 0 }
                          : { right: pinnedRight[column.id] || 0 }),
                        zIndex: 5,
                        // Structural: an opaque frozen footer cell, for the same reason
                        // the frozen header and body cells need one.
                        background: v('foot-bg'),
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
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                ...skin(unstyled, {
                  fontSize: fontPx,
                  fontWeight: 700,
                  color: v('foot-text'),
                }),
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
