import React from 'react';

/**
 * Zero-dependency stand-ins for the three Semantic UI React pieces the table
 * originally used: `Icon` (sort arrows, pin, empty-state inbox, search),
 * `Input` (per-column filter box) and `Loader` (loading state).
 *
 * Everything is inline SVG + inline styles, so the package needs no CSS import
 * and no UI library. The one stylesheet the component injects (see `injectStyles`)
 * only carries what inline styles cannot express: keyframes, `:focus`,
 * `::placeholder` and the pinned-column shadow selector.
 */

// Separator shadow on the last pinned column while horizontally scrolled.
export const PIN_SHADOW = '6px 0 6px -4px rgba(0,0,0,0.18)';
// Mirror of PIN_SHADOW for a right-frozen block: cast leftwards, over the scrolling
// columns sliding underneath it.
export const PIN_SHADOW_RIGHT = '-6px 0 6px -4px rgba(0,0,0,0.18)';

const STYLE_ID = 'freeze-table-styles';

const STYLESHEET = `
.ft-wrap[data-ct-scrolled="1"] [data-ct-pin-last="1"]{box-shadow:${PIN_SHADOW};}
.ft-wrap[data-ct-scrolled-end="1"] [data-ct-pin-right-first="1"]{box-shadow:${PIN_SHADOW_RIGHT};}
.ft-filter-input{width:100%;box-sizing:border-box;border:1px solid rgba(34,36,38,.15);border-radius:4px;
  padding:4px 6px 4px 24px;line-height:1.2;outline:0;color:rgba(0,0,0,.87);background:#fff;
  font-family:inherit;-webkit-appearance:none;appearance:none;}
.ft-filter-input:focus{border-color:#85b7d9;background:#fff;}
.ft-filter-input::placeholder{color:rgba(0,0,0,.35);}
.ft-filter-input::-ms-clear{display:none;}
.ft-spinner{display:inline-block;box-sizing:border-box;border-radius:50%;
  border:2px solid rgba(0,0,0,.10);border-top-color:#0070C2;animation:ft-spin .6s linear infinite;}
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
.ft-thumb{position:absolute;background:#c3ccd6;border-radius:6px;transition:background .15s;}
.ft-track-v .ft-thumb{left:2px;right:2px;top:0;}
.ft-track-h .ft-thumb{top:2px;bottom:2px;left:0;}
.ft-track:hover .ft-thumb{background:#a7b3c1;}
.ft-thumb:active,.ft-thumb.ft-thumb-drag{background:#8c9bab;}
`;

let injected = false;

/** Idempotent — safe to call from every mount and under React StrictMode. */
export const injectStyles = () => {
  if (injected || typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) {
    injected = true;
    return;
  }
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = STYLESHEET;
  document.head.appendChild(el);
  injected = true;
};

/** `useLayoutEffect` that degrades to `useEffect` on the server (no SSR warning). */
export const useIsoLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

const svgBase = (size) => ({
  width: size,
  height: size,
  display: 'inline-block',
  verticalAlign: 'middle',
  flexShrink: 0,
});

/**
 * Sort indicator. `direction`: 'asc' | 'desc' | null (null = sortable but unsorted,
 * shown as the two-arrow "sortable" glyph, matching Semantic's `sort` icon).
 */
export const SortIcon = ({ direction, color = '#000000', size = 9 }) => (
  <svg viewBox="0 0 10 14" aria-hidden="true" focusable="false" style={{ ...svgBase(size), fill: color }}>
    {direction !== 'desc' && <polygon points="5,1 9.2,5.8 0.8,5.8" opacity={direction === 'asc' ? 1 : 0.85} />}
    {direction !== 'asc' && <polygon points="5,13 9.2,8.2 0.8,8.2" opacity={direction === 'desc' ? 1 : 0.85} />}
  </svg>
);

/** Pin / thumbtack — marks the freeze-boundary column. */
export const PinIcon = ({ color = '#0070C2', size = 10, title }) => (
  <svg viewBox="0 0 16 16" focusable="false" style={{ ...svgBase(size), fill: color }} role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'}>
    {title ? <title>{title}</title> : null}
    <path d="M9.6 1a1 1 0 0 0-.7 1.7l.3.3-3.4 2.5-2-.4a1 1 0 0 0-.9 1.7l3 3-3.4 4 4.6-3 3 3a1 1 0 0 0 1.7-.9l-.4-2 2.5-3.4.3.3A1 1 0 0 0 15.6 7L9.6 1z" />
  </svg>
);

/** Soft empty-state glyph (Semantic's `inbox`). */
export const InboxIcon = ({ color = '#c2cbd6', size = 34 }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ ...svgBase(size), fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
    <path d="M3 13h4l1.5 3h7L17 13h4" />
    <path d="M5.2 4.5h13.6L21 13v5.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V13z" />
  </svg>
);

const SearchIcon = ({ color = 'rgba(0,0,0,.45)', size = 11 }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" style={{ ...svgBase(size), fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' }}>
    <circle cx="6.8" cy="6.8" r="4.6" />
    <path d="M10.4 10.4 14 14" />
  </svg>
);

/**
 * The per-column filter box — a plain `<input>` dressed to match the compact
 * Semantic "mini icon input" the table was designed around.
 */
export const FilterInput = ({ value, onChange, onClick, placeholder, fontSize = 11 }) => (
  <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
    <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', pointerEvents: 'none' }}>
      <SearchIcon size={Math.max(10, fontSize)} />
    </span>
    <input
      type="text"
      className="ft-filter-input"
      value={value}
      onClick={onClick}
      onChange={onChange}
      placeholder={placeholder}
      style={{ fontSize: `${fontSize}px` }}
    />
  </div>
);

/** Centred loading spinner + caption. */
export const Spinner = ({ text, size = 32, color = '#0070C2' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
    <span className="ft-spinner" style={{ width: size, height: size, borderTopColor: color }} />
    {text ? <span style={{ color, fontSize: '13px' }}>{text}</span> : null}
  </div>
);
