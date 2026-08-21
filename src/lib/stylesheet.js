import { DARK, LIGHT, themeCss, v } from './theme';

/**
 * The one stylesheet the component injects, as pure data.
 *
 * It lives in lib/ — apart from the React tree — for two reasons. It is the only part of
 * the styling that a consumer might want without mounting anything (the build emits it as
 * `dist/freeze-table.css` for apps under a CSP that forbids injected `<style>` tags, and
 * an SSR renderer can inline it into the document head). And it is derived entirely from
 * the token maps next door, so keeping the two together means a token added to theme.js
 * cannot be forgotten here.
 *
 * What belongs in it: the token ladder, and the things an inline style cannot express —
 * keyframes, `:hover` / `:focus` / `::placeholder`, `[aria-checked]`, and the
 * frozen-column shadow selectors, which key off data attributes the scroll handler sets.
 * Everything else stays inline.
 */

/**
 * Bumped whenever STYLESHEET changes shape. It is part of the element id so that two
 * different versions of this package on one page (a micro-frontend, or a transitive
 * dependency pulling in an older copy) each inject their own sheet instead of the first
 * one silently deciding the styling for both.
 */
const STYLE_SCHEMA = 2;
export const STYLE_ID = `freeze-table-styles-${STYLE_SCHEMA}`;

export /**
 * The token blocks are wrapped in `:where()`, which contributes ZERO specificity.
 *
 * Without it the theming layer quietly does not work. `.ft-root{--ft-bg:…}` and a
 * consumer's `.my-table{--ft-bg:…}` are both specificity 0-1-0, so the winner is decided
 * by source order — and this sheet is appended when the component MOUNTS, i.e. after the
 * consumer's `<link rel=stylesheet>` in `<head>`. The library's defaults therefore beat
 * the consumer's theme, which is exactly backwards. It looks like "my CSS variables are
 * being ignored", with nothing in the markup to explain it.
 *
 * `:where(.ft-root)` drops that to 0-0-0, so ANY selector a consumer writes wins,
 * whatever order the sheets happen to load in. These are defaults; defaults should lose.
 *
 * The three blocks still beat each other in source order, since all three are now 0-0-0:
 * base, then `theme="dark"`, then the `auto` media query. And a consumer's own class
 * outranks all of them — so `theme="dark"` plus a `--ft-accent` of your own gives the
 * dark palette with your accent, not a fight.
 *
 * The rules below the tokens are deliberately NOT wrapped: `.ft-btn:hover` and friends
 * are the component's own internals, and a consumer overriding one is expected to write
 * a selector that outranks it.
 */
const STYLESHEET = `
:where(.ft-root){${themeCss(LIGHT, { base: true })}}
:where(.ft-root[data-ft-theme="dark"]){${themeCss(DARK)}}
@media (prefers-color-scheme: dark){:where(.ft-root[data-ft-theme="auto"]){${themeCss(DARK)}}}

.ft-wrap[data-ct-scrolled="1"] [data-ct-pin-last="1"]{box-shadow:${v('shadow-pin')};}
.ft-wrap[data-ct-scrolled-end="1"] [data-ct-pin-right-first="1"]{box-shadow:${v('shadow-pin-right')};}
.ft-filter-input{width:100%;box-sizing:border-box;border:1px solid ${v('input-border')};
  border-radius:${v('radius')};
  padding:4px 6px 4px 24px;line-height:1.2;outline:0;color:${v('input-text')};background:${v('input-bg')};
  font-family:inherit;-webkit-appearance:none;appearance:none;}
.ft-filter-input:focus{border-color:${v('input-focus-border')};background:${v('input-bg')};}
.ft-filter-input::placeholder{color:${v('input-placeholder')};}
.ft-filter-input::-ms-clear{display:none;}
.ft-spinner{display:inline-block;box-sizing:border-box;border-radius:50%;
  border:2px solid ${v('spinner-track')};border-top-color:${v('accent')};animation:ft-spin .6s linear infinite;}
@keyframes ft-spin{to{transform:rotate(360deg);}}
@media (prefers-reduced-motion: reduce){.ft-spinner{animation-duration:2s;}}

/* Native scrollbars are hidden and redrawn as overlays, so the vertical bar can sit
   beside the ROWS only instead of running the full height of the table (header and
   footer included). Per-axis hiding is not expressible in Firefox — scrollbar-width
   takes no axis — so both bars are drawn, which also keeps them looking the same
   across browsers. Wheel, trackpad and keyboard scrolling stay fully native. */
.ft-wrap.ft-nobar{scrollbar-width:none;-ms-overflow-style:none;}
.ft-wrap.ft-nobar::-webkit-scrollbar{width:0;height:0;}
.ft-track{position:absolute;background:transparent;z-index:6;}
.ft-track-v{width:11px;}
.ft-track-h{height:11px;}
.ft-thumb{position:absolute;background:${v('scrollbar')};border-radius:6px;transition:background .15s;}
.ft-track-v .ft-thumb{left:2px;right:2px;top:0;}
.ft-track-h .ft-thumb{top:2px;bottom:2px;left:0;}
.ft-track:hover .ft-thumb{background:${v('scrollbar-hover')};}
.ft-thumb:active,.ft-thumb.ft-thumb-drag{background:${v('scrollbar-active')};}

/* Column resize grip: a hit area straddling the header's right edge that only paints a
   line on hover / while dragging — drawn permanently, twenty columns would read as
   twenty vertical rules and bury the header text. */
.ft-resizer{position:absolute;top:0;right:0;width:9px;height:100%;cursor:col-resize;
  touch-action:none;user-select:none;z-index:6;}
.ft-resizer::after{content:"";position:absolute;top:5px;bottom:5px;right:4px;width:2px;
  border-radius:1px;background:transparent;}
.ft-resizer:hover::after,.ft-resizer.ft-resizing::after{background:${v('resize-line')};}
/* The line that follows the pointer during a resize. The drag never writes width state
   per frame (see startColResize) — this guide is the only thing that moves. */
.ft-resize-guide{position:absolute;top:0;bottom:0;left:0;width:2px;background:${v('resize-line')};
  opacity:.7;pointer-events:none;z-index:7;}

/* Toolbar: a plain button strip above the table, and the popovers its two menus open in.
   Both live OUTSIDE .ft-wrap — a menu with its own overflow inside the scrollport would
   become the sticky container for the cells beneath it and break the column freeze. */
.ft-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid ${v('btn-border')};
  border-radius:${v('radius')};
  background:${v('btn-bg')};color:${v('btn-text')};padding:4px 9px;cursor:pointer;font:inherit;line-height:1.4;
  white-space:nowrap;}
.ft-btn:hover{background:${v('btn-hover-bg')};border-color:${v('btn-hover-border')};}
.ft-btn:focus-visible{outline:2px solid ${v('focus-ring')};outline-offset:1px;}
.ft-btn[aria-expanded="true"]{background:${v('btn-active-bg')};border-color:${v('btn-active-border')};}
.ft-btn[disabled]{opacity:.45;cursor:default;}
.ft-menu{position:absolute;top:100%;margin-top:4px;z-index:9;min-width:248px;max-height:340px;
  overflow-y:auto;background:${v('menu-bg')};border:1px solid ${v('menu-border')};
  border-radius:${v('radius-menu')};
  box-shadow:${v('shadow-menu')};padding:4px;}
.ft-menu-head{padding:6px 8px 4px;font-weight:700;color:${v('menu-head-text')};text-transform:uppercase;
  letter-spacing:.4px;}
.ft-menu-row{display:flex;align-items:center;gap:2px;}
/* Inside a row that also carries the move buttons, the entry takes the space that is
   left instead of all of it: a width:100% flex child is 100% of the ROW, which pushed
   the up/down arrows past the menu's right edge and clipped them.
   (No backticks in here - this whole sheet is one JS template literal.) */
.ft-menu-row .ft-menu-item{width:auto;flex:1 1 auto;min-width:0;}
.ft-menu-item{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;
  border:0;background:none;font:inherit;color:${v('menu-text')};text-align:left;padding:5px 8px;
  border-radius:${v('radius')};cursor:pointer;}
.ft-menu-item:hover:not([disabled]){background:${v('menu-item-hover')};}
.ft-menu-item[disabled]{opacity:.4;cursor:default;}
/* The "this one is selected" tint belongs to a RADIO choice — one entry out of many, as
   in the Freeze menu. It must NOT key off aria-checked, which is what a CHECKBOX entry
   carries: in the Columns menu nearly every column is visible, so nearly every row was
   tinted and the menu read as a solid block of accent colour with no signal in it. The
   tick alone says "shown"; an unchecked row is dimmed below instead. */
.ft-menu-item[aria-current="true"]{background:${v('menu-item-active-bg')};color:${v('menu-item-active-text')};font-weight:600;}
/* A hidden column reads as hidden: no tick, and the label recedes. Scoped to a CHECKBOX
   entry — a radio list (Freeze) also marks its unselected entries aria-checked="false",
   and dimming all but one of those would say "unavailable" rather than "not chosen". */
.ft-menu-item[role="menuitemcheckbox"][aria-checked="false"]{color:${v('text-muted')};}
.ft-menu-sep{height:1px;background:${v('menu-sep')};margin:4px 0;}
.ft-menu-move{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;
  border:0;background:none;padding:0;cursor:pointer;color:${v('menu-move-text')};font:inherit;
  line-height:1;border-radius:${v('radius')};}
.ft-menu-move:hover:not([disabled]){background:${v('menu-move-hover')};color:${v('menu-text')};}
.ft-menu-move[disabled]{opacity:.25;cursor:default;}

/* Column reorder. Same deal as the resize guide: the drop line is the ONLY thing that
   moves while the pointer is down (see startColReorder), and the header being carried
   dims so the line reads as "this column lands here" rather than as a second cursor. */
.ft-th-dragging{opacity:.4;}
.ft-drop-line{position:absolute;top:0;bottom:0;left:0;width:3px;background:${v('drop-line')};
  border-radius:2px;pointer-events:none;z-index:7;}
`;

/** The stylesheet text, for the build and for anyone inlining it themselves. */
export const styleText = () => STYLESHEET;
