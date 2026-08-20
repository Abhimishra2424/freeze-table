import React from 'react';
import { cx, skin } from '../lib/slots';
import { v } from '../lib/theme';
import VirtualRow from './VirtualRow';

/**
 * The row band, and the two states that replace it.
 *
 * Only the visible slice is mounted; each row is absolutely positioned at
 * `index * rowHeight` inside a container of the full content height, so the wrap's
 * (overlaid) scrollbar covers the whole list even though only ~20 rows exist in the DOM.
 *
 * Rows render only once `listH > 0` — i.e. after the row band has been measured. Before
 * that the window would be one row tall, and on the server there is nothing to measure
 * at all, which is why server-rendered markup carries the header and footer but no rows.
 */
export const TableBody = ({
  bodyProps,
  bodyWrapRef,
  rows,
  rowHeight,
  listH,
  firstIdx,
  lastIdx,
  itemData,
  loading,
  loadingText,
  dataFetched,
  emptyText,
  classNames,
  ui,
  unstyled,
}) => (
  <div
    {...bodyProps}
    ref={bodyWrapRef}
    className={cx(bodyProps.className, classNames.body)}
    style={{ flex: '1 0 auto', position: 'relative', height: rows.length ? rows.length * rowHeight : undefined }}
  >
    {loading ? (
      <div className={cx('ft-loading ct-loading', classNames.loading)} style={{ padding: '90px 0', textAlign: 'center' }}>
        {ui.Spinner && <ui.Spinner text={loadingText} />}
      </div>
    ) : rows.length === 0 && dataFetched ? (
      <div
        className={cx('ft-empty ct-empty', classNames.empty)}
        style={{ padding: '80px 0', textAlign: 'center', ...skin(unstyled, { color: v('text-muted') }) }}
      >
        {ui.Empty && <ui.Empty text={emptyText} />}
      </div>
    ) : listH > 0 ? (
      Array.from({ length: Math.max(0, lastIdx - firstIdx + 1) }, (_, k) => {
        const index = firstIdx + k;
        return <VirtualRow key={rows[index].id != null ? rows[index].id : index} data={itemData} index={index} />;
      })
    ) : null}
  </div>
);

export default TableBody;
