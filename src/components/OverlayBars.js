import React from 'react';
import { cx } from '../lib/slots';

/**
 * The four absolutely-positioned overlays that live beside the scrollport, all of them
 * driven imperatively (never by React state) so that nothing here re-renders during a
 * scroll or a drag:
 *
 *   - the two overlay scrollbar tracks, drawn because the native bars have to be hidden
 *     (see useOverlayScrollbars for why). The vertical track is inset by the header and
 *     footer heights so it runs beside the ROWS only.
 *   - the resize guide, a vertical line following the pointer during a column resize.
 *   - the drop line, showing where a dragged column will land.
 */
export const OverlayBars = ({
  headH,
  listH,
  topOffset = 0,
  vTrackRef,
  vThumbRef,
  hTrackRef,
  hThumbRef,
  startThumbDrag,
  onTrackDown,
  guideRef,
  dropRef,
  classNames,
}) => (
  <React.Fragment>
    <div
      className={cx('ft-track ft-track-v', classNames.track)}
      ref={vTrackRef}
      onPointerDown={onTrackDown('y')}
      style={{ right: 0, top: topOffset + headH, height: listH, display: 'none' }}
    >
      <div className={cx('ft-thumb', classNames.thumb)} ref={vThumbRef} onPointerDown={startThumbDrag('y')} />
    </div>
    <div
      className={cx('ft-track ft-track-h', classNames.track)}
      ref={hTrackRef}
      onPointerDown={onTrackDown('x')}
      style={{ left: 0, right: 11, bottom: 0, display: 'none' }}
    >
      <div className={cx('ft-thumb', classNames.thumb)} ref={hThumbRef} onPointerDown={startThumbDrag('x')} />
    </div>

    {/* Follows the pointer during a column resize; hidden the rest of the time. Both
        guides span the table box only — with a toolbar above it, they start below it. */}
    <div className="ft-resize-guide" ref={guideRef} style={{ display: 'none', top: topOffset || undefined }} />

    {/* Where a dragged column will land; hidden the rest of the time. */}
    <div className="ft-drop-line" ref={dropRef} style={{ display: 'none', top: topOffset || undefined }} />
  </React.Fragment>
);

export default OverlayBars;
