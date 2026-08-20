import React from 'react';
import { useIsoLayoutEffect } from '../internal-ui';

// Below this a thumb stops being a usable drag target.
const MIN_THUMB = 24;

/**
 * The native vertical scrollbar runs the whole height of `.ft-wrap` — alongside the
 * header and the footer, not just the rows — because `.ft-wrap` is the single scrollport
 * for both axes. Giving the body its own vertical overflow would fix the bar but break
 * the column freeze: an element that scrolls in y is a scroll container in x too, so it
 * would become the sticky scrollport for the pinned cells and they would slide away
 * (exactly the react-window problem this component was rewritten to escape). So the
 * native bars are hidden (`.ft-nobar`) and redrawn as overlays, with the vertical track
 * spanning only the row band.
 *
 * Thumbs are positioned imperatively from the same rAF-throttled scroll handler that
 * drives the windowing — no React re-render per frame.
 */
export const useOverlayScrollbars = ({ containerRef, listH, syncBarsRef, onWrapScroll }) => {
  const vTrackRef = React.useRef(null);
  const vThumbRef = React.useRef(null);
  const hTrackRef = React.useRef(null);
  const hThumbRef = React.useRef(null);

  const syncBars = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const maxY = Math.max(0, el.scrollHeight - el.clientHeight);
    const maxX = Math.max(0, el.scrollWidth - el.clientWidth);

    const vTrack = vTrackRef.current;
    const vThumb = vThumbRef.current;
    if (vTrack && vThumb) {
      const bandH = listH;
      if (maxY <= 0 || bandH <= MIN_THUMB) {
        vTrack.style.display = 'none';
      } else {
        vTrack.style.display = 'block';
        const th = Math.max(MIN_THUMB, Math.round(bandH * (el.clientHeight / el.scrollHeight)));
        vThumb.style.height = th + 'px';
        vThumb.style.transform = 'translateY(' + Math.round((el.scrollTop / maxY) * (bandH - th)) + 'px)';
      }
    }

    const hTrack = hTrackRef.current;
    const hThumb = hThumbRef.current;
    if (hTrack && hThumb) {
      if (maxX <= 0) {
        hTrack.style.display = 'none';
      } else {
        hTrack.style.display = 'block';
        const bandW = hTrack.clientWidth;
        const tw = Math.max(MIN_THUMB, Math.round(bandW * (el.clientWidth / el.scrollWidth)));
        hThumb.style.width = tw + 'px';
        hThumb.style.transform = 'translateX(' + Math.round((el.scrollLeft / maxX) * (bandW - tw)) + 'px)';
      }
    }
  }, [containerRef, listH]);

  // Re-measure whenever the geometry could have changed (mount, resize, row count,
  // footer toggle, a new pin boundary) — hence no dependency array.
  useIsoLayoutEffect(() => {
    syncBarsRef.current = syncBars;
    syncBars();
    onWrapScroll(); // sets the pin shadows for the initial (unscrolled) position too
  });

  // Dragging a thumb. Snapping is switched off for the duration: `proximity` snapping
  // re-settles the scroll on every programmatic write, which makes a drag feel sticky.
  const startThumbDrag = React.useCallback(
    (axis) => (e) => {
      const el = containerRef.current;
      const thumb = axis === 'y' ? vThumbRef.current : hThumbRef.current;
      if (!el || !thumb || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const vertical = axis === 'y';
      const startPos = vertical ? e.clientY : e.clientX;
      const startScroll = vertical ? el.scrollTop : el.scrollLeft;
      const trackLen = vertical ? listH : hTrackRef.current.clientWidth;
      const thumbLen = vertical ? thumb.offsetHeight : thumb.offsetWidth;
      const maxScroll = vertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
      const ratio = maxScroll / Math.max(1, trackLen - thumbLen);
      const prevSnap = el.style.scrollSnapType;
      el.style.scrollSnapType = 'none';
      thumb.classList.add('ft-thumb-drag');
      document.body.style.userSelect = 'none';
      const onMove = (ev) => {
        const delta = (vertical ? ev.clientY : ev.clientX) - startPos;
        const next = startScroll + delta * ratio;
        if (vertical) el.scrollTop = next;
        else el.scrollLeft = next;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        el.style.scrollSnapType = prevSnap;
        thumb.classList.remove('ft-thumb-drag');
        document.body.style.userSelect = '';
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [containerRef, listH]
  );

  // Clicking the bare track jumps so the thumb centres on the click.
  const onTrackDown = React.useCallback(
    (axis) => (e) => {
      if (e.target !== e.currentTarget) return; // the thumb handles its own presses
      const el = containerRef.current;
      const thumb = axis === 'y' ? vThumbRef.current : hThumbRef.current;
      if (!el || !thumb) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (axis === 'y') {
        const pos = e.clientY - rect.top - thumb.offsetHeight / 2;
        el.scrollTop = (pos / Math.max(1, listH - thumb.offsetHeight)) * (el.scrollHeight - el.clientHeight);
      } else {
        const pos = e.clientX - rect.left - thumb.offsetWidth / 2;
        el.scrollLeft =
          (pos / Math.max(1, e.currentTarget.clientWidth - thumb.offsetWidth)) * (el.scrollWidth - el.clientWidth);
      }
    },
    [containerRef, listH]
  );

  return { vTrackRef, vThumbRef, hTrackRef, hThumbRef, startThumbDrag, onTrackDown };
};

export default useOverlayScrollbars;
