import React from 'react';

/**
 * Everything that happens when `.ft-wrap` scrolls — which is deliberately almost
 * nothing.
 *
 * Pinned columns are frozen with plain CSS `position: sticky`, so the browser keeps them
 * in place on the compositor: NOTHING runs in JS per scroll frame to hold them there.
 * That is only possible because `.ft-wrap` is the ONE scrollport for both axes (hence
 * the hand-rolled row windowing instead of react-window, whose outer div would otherwise
 * become the sticky scrollport for the body cells and break the freeze). The only things
 * left for JS are the two separator shadows (each flipped once, when the scroll crosses
 * an edge), the overlay scrollbar thumbs and the vertical offset that drives the
 * windowing — the last two behind a rAF gate.
 *
 * `onFrame` is taken as a REF so the listener never has to be re-attached when the
 * scrollbar sync closure changes.
 */
export const useTableScroll = ({ containerRef, hasPinned, hasPinnedRight, rowSnap, onFrameRef }) => {
  const pinScrolledRef = React.useRef(false);
  const pinScrolledEndRef = React.useRef(false);
  // Snapping is suspended WHILE scrolling and restored a moment after it stops. Left
  // permanently on, `proximity` re-settles the scroll on every wheel notch, which reads
  // as the list stuttering / catching mid-scroll rather than gliding.
  const snapTimerRef = React.useRef(null);
  const scrollTickRef = React.useRef(false);
  const [scrollTop, setScrollTop] = React.useState(0);

  const onWrapScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const scrolled = hasPinned && el.scrollLeft > 0;
    if (scrolled !== pinScrolledRef.current) {
      pinScrolledRef.current = scrolled;
      if (scrolled) el.setAttribute('data-ct-scrolled', '1');
      else el.removeAttribute('data-ct-scrolled');
    }
    // The right block only casts its shadow while columns are still hidden beneath it,
    // i.e. until the scroll reaches the end.
    const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
    const shadeRight = hasPinnedRight && !atEnd;
    if (shadeRight !== pinScrolledEndRef.current) {
      pinScrolledEndRef.current = shadeRight;
      if (shadeRight) el.setAttribute('data-ct-scrolled-end', '1');
      else el.removeAttribute('data-ct-scrolled-end');
    }
    if (rowSnap) {
      if (el.style.scrollSnapType !== 'none') el.style.scrollSnapType = 'none';
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      snapTimerRef.current = setTimeout(() => {
        const node = containerRef.current;
        if (node) node.style.scrollSnapType = 'y proximity';
      }, 160);
    }
    if (scrollTickRef.current) return;
    scrollTickRef.current = true;
    window.requestAnimationFrame(() => {
      scrollTickRef.current = false;
      const node = containerRef.current;
      if (!node) return;
      onFrameRef.current();
      setScrollTop(node.scrollTop);
    });
  }, [containerRef, hasPinned, hasPinnedRight, rowSnap, onFrameRef]);

  React.useEffect(() => () => {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
  }, []);

  // Passive listener: React's onScroll attaches a non-passive handler on a scroll-linked
  // path, which can hold up the compositor.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    el.addEventListener('scroll', onWrapScroll, { passive: true });
    return () => el.removeEventListener('scroll', onWrapScroll);
  }, [containerRef, onWrapScroll]);

  return { scrollTop, onWrapScroll };
};

export default useTableScroll;
