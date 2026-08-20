import React from 'react';
import { useIsoLayoutEffect } from '../internal-ui';

/**
 * The scrollport's own width. The pin caps need it before the column defs are built:
 * how many columns may freeze is a question about how much viewport is left over.
 */
export const useWrapWidth = (containerRef) => {
  const [wrapW, setWrapW] = React.useState(0);
  useIsoLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const update = () => setWrapW(el.clientWidth);
    update();
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    window.addEventListener('resize', update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  return wrapW;
};

/**
 * The band left for rows: the wrap's viewport minus the sticky header and footer, which
 * overlay the top / bottom of it. Drives both the windowing maths and scrollToRow, so
 * rows exactly fill the gap — no clipped last row. The header height is returned too:
 * rows scroll UNDER it, so it is also how far the snapport's top edge has to be pushed
 * down for a snapped row to land just below it.
 */
export const useBandHeights = ({ containerRef, headRef, footRef, toolbarRef, deps }) => {
  const [listH, setListH] = React.useState(0);
  const [headH, setHeadH] = React.useState(0);
  const [footH, setFootH] = React.useState(0);
  // The toolbar is a flex sibling of the scrollport, so it never eats into listH — but
  // the overlay scrollbars and the drag guides are positioned against the ROOT, and have
  // to start below it.
  const [toolH, setToolH] = React.useState(0);
  useIsoLayoutEffect(() => {
    const wrap = containerRef.current;
    if (!wrap) return undefined;
    const update = () => {
      const hh = headRef.current ? headRef.current.offsetHeight : 0;
      const fh = footRef.current ? footRef.current.offsetHeight : 0;
      setHeadH(hh);
      setFootH(fh);
      setToolH(toolbarRef && toolbarRef.current ? toolbarRef.current.offsetHeight : 0);
      setListH(Math.max(0, wrap.clientHeight - hh - fh));
    };
    update();
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      ro.observe(wrap);
      if (headRef.current) ro.observe(headRef.current);
      if (footRef.current) ro.observe(footRef.current);
      if (toolbarRef && toolbarRef.current) ro.observe(toolbarRef.current);
    }
    window.addEventListener('resize', update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { listH, headH, footH, toolH };
};
