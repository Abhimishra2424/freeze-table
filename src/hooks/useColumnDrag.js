import React from 'react';
import { DRAG_SLOP } from '../lib/columns';

/**
 * The two header drags.
 *
 * A header press has to serve three gestures: a click sorts, a sideways drag reorders,
 * and a drag on the right-edge grip resizes. The grip's own handler stops propagation so
 * it never starts a reorder; the reorder arms itself only after DRAG_SLOP pixels, so a
 * plain click falls straight through to the sort toggle, and once it HAS armed the click
 * that pointer-up fires is swallowed in the capture phase (otherwise every reorder would
 * flip the sort on its way out).
 *
 * NEITHER drag writes to state per frame. Both paint a line and commit exactly once, on
 * pointer-up: the column defs are what `itemData` hangs off, so a live width or a live
 * order would re-render every visible row sixty times a second — the same cost the
 * memoized rows and the imperative selection highlight exist to avoid. (It is also what
 * Excel and Sheets do.)
 */
export const useColumnDrag = ({ rootRef, containerRef, guideRef, dropRef, orderRef, minColumnWidth, setColumnWidth, setColumnOrder }) => {
  const startColResize = React.useCallback(
    (id) => (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation(); // never let the press reach the header's sort toggle
      const handle = e.currentTarget;
      const th = handle.parentElement;
      const root = rootRef.current;
      const guide = guideRef.current;
      if (!th || !root) return;
      const startX = e.clientX;
      // Measured, not configured: `width` is only a request — the rendered size is
      // `min(max(minWidth, width), maxWidth)`, so a column configured `width: 1,
      // minWidth: 90` is 90px on screen. Starting the drag from the config would make
      // the column jump on the first pixel of pointer movement.
      const startW = th.offsetWidth;
      const rootRect = root.getBoundingClientRect();
      const thLeft = th.getBoundingClientRect().left - rootRect.left;
      let width = startW;
      const paint = (clientX) => {
        width = Math.max(minColumnWidth, Math.round(startW + (clientX - startX)));
        if (!guide) return;
        guide.style.display = 'block';
        // Clamped to the table box — the pointer can travel far past either edge, and a
        // guide drawn outside the root would streak across the page around it.
        guide.style.transform = `translateX(${Math.min(Math.max(0, thLeft + width), rootRect.width - 2)}px)`;
      };
      paint(e.clientX);
      handle.classList.add('ft-resizing');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      const onMove = (ev) => paint(ev.clientX);
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (guide) guide.style.display = 'none';
        handle.classList.remove('ft-resizing');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        if (width !== startW) setColumnWidth(id, width);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [rootRef, guideRef, minColumnWidth, setColumnWidth]
  );

  const dragEndedRef = React.useRef(false);
  const startColReorder = React.useCallback(
    (id) => (e) => {
      // Mouse only: on a touch screen, dragging a header sideways is how the user pans a
      // wide table, and stealing that gesture would leave the table unscrollable.
      if (e.button !== 0 || (e.pointerType && e.pointerType !== 'mouse')) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; // the filter box
      dragEndedRef.current = false; // a previous drag that ended off-target never fired its click
      const th = e.currentTarget;
      const root = rootRef.current;
      const wrap = containerRef.current;
      const line = dropRef.current;
      if (!root || !wrap) return;
      const startX = e.clientX;
      const EDGE = 48; // auto-scroll band at either end of the scrollport
      let pointerX = startX;
      let dragging = false;
      let beforeId = null; // the column the dragged one will land in front of; null = last
      let raf = 0;

      const frame = () => {
        if (!dragging) {
          raf = 0;
          return;
        }
        const wrapRect = wrap.getBoundingClientRect();
        // Auto-scroll while the pointer rests near an edge. On a table wide enough to
        // want frozen columns, the place you are dragging TO is usually off screen, and
        // without this the drag can only reach as far as the current viewport.
        if (pointerX < wrapRect.left + EDGE) wrap.scrollLeft -= Math.ceil((wrapRect.left + EDGE - pointerX) / 4);
        else if (pointerX > wrapRect.right - EDGE) wrap.scrollLeft += Math.ceil((pointerX - (wrapRect.right - EDGE)) / 4);

        // Live rects every frame rather than a snapshot taken at pointer-down: a frozen
        // header sits nowhere near its layout position, and the auto-scroll above moves
        // every unfrozen one under the pointer.
        const rootRect = root.getBoundingClientRect();
        const heads = root.querySelectorAll('.ft-th[data-ct-col]');
        let edgeX = null;
        let lastRight = null;
        beforeId = null;
        for (let i = 0; i < heads.length; i++) {
          const cid = heads[i].getAttribute('data-ct-col');
          if (cid === '__strip') continue; // the status strip is never a drop target
          const r = heads[i].getBoundingClientRect();
          lastRight = r.right;
          if (beforeId == null && pointerX < r.left + r.width / 2) {
            beforeId = cid;
            edgeX = r.left;
          }
        }
        if (beforeId == null) edgeX = lastRight; // past the midpoint of the last one = drop at the end
        if (line && edgeX != null) {
          line.style.display = 'block';
          // Clamped to the table box, exactly like the resize guide: the pointer can
          // travel far outside it and a line drawn there would streak across the page.
          line.style.transform = `translateX(${Math.min(Math.max(0, edgeX - rootRect.left), rootRect.width - 3)}px)`;
        }
        raf = window.requestAnimationFrame(frame);
      };

      const onMove = (ev) => {
        pointerX = ev.clientX;
        if (!dragging) {
          if (Math.abs(pointerX - startX) < DRAG_SLOP) return;
          dragging = true;
          th.classList.add('ft-th-dragging');
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'grabbing';
        }
        if (!raf) raf = window.requestAnimationFrame(frame);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (raf) window.cancelAnimationFrame(raf);
        if (!dragging) return; // never armed — leave the click alone, it is a sort
        dragging = false;
        th.classList.remove('ft-th-dragging');
        if (line) line.style.display = 'none';
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        dragEndedRef.current = true;
        const cur = orderRef.current.filter((x) => x !== id);
        const at = beforeId && beforeId !== id ? cur.indexOf(beforeId) : -1;
        cur.splice(at < 0 ? cur.length : at, 0, id);
        // Dropping a column back where it started is a no-op, not a layout change worth
        // persisting or telling the caller about.
        if (cur.some((x, i) => x !== orderRef.current[i])) setColumnOrder(cur);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [rootRef, containerRef, dropRef, orderRef, setColumnOrder]
  );

  // Swallow the click a completed reorder drag leaves behind (it would reach the
  // header's sort toggle). Capture phase, because the toggle's own onClick sits deeper.
  const onHeaderClickCapture = React.useCallback((e) => {
    if (!dragEndedRef.current) return;
    dragEndedRef.current = false;
    e.stopPropagation();
    e.preventDefault();
  }, []);

  return { startColResize, startColReorder, onHeaderClickCapture };
};

export default useColumnDrag;
