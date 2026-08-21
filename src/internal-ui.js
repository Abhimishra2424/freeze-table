import React from 'react';
import { LIGHT, v } from './lib/theme';
import { cx } from './lib/slots';
import { STYLESHEET, STYLE_ID, styleText } from './lib/stylesheet';

/**
 * Zero-dependency stand-ins for the three Semantic UI React pieces the table
 * originally used: `Icon` (sort arrows, pin, empty-state inbox, search),
 * `Input` (per-column filter box) and `Loader` (loading state) — plus the menu atoms
 * the toolbar is built from.
 *
 * Everything is inline SVG + inline styles, so the package needs no CSS import
 * and no UI library. The one stylesheet the component injects (see `injectStyles`)
 * carries the token ladder plus what inline styles cannot express: keyframes, `:focus`,
 * `::placeholder` and the pinned-column shadow selector.
 *
 * Every component here is also the DEFAULT for a `components` slot — see
 * `DEFAULT_COMPONENTS` at the bottom. Each one's props are its public contract from 1.1
 * onwards, because a caller replacing it receives exactly them.
 */

// Kept as exports because they were public before the tokens existed. They now resolve
// through `--ft-shadow-pin` / `--ft-shadow-pin-right`, so a consumer who themed by
// importing these constants still gets a working (if un-themeable) value.
export const PIN_SHADOW = LIGHT['shadow-pin'];
export const PIN_SHADOW_RIGHT = LIGHT['shadow-pin-right'];

// Which roots have been injected into. A Set rather than a boolean because `styleTarget`
// lets a caller inject into a shadow root, and each shadow root needs its own copy — a
// document.head stylesheet does not cross the boundary.
const injectedInto = new Set();

/**
 * Idempotent — safe to call from every mount and under React StrictMode.
 *
 * `nonce` is forwarded onto the `<style>` element for apps whose Content-Security-Policy
 * has a `style-src` without `'unsafe-inline'`; without it the browser drops the sheet and
 * the table renders with only its inline `var()` fallbacks (readable, but no hover
 * states, no scrollbar thumbs and no theming).
 *
 * `target` may be a ShadowRoot or any node with a `getRootNode`, for a table mounted
 * inside a web component — `document.head` is invisible from in there.
 */
export const injectStyles = ({ nonce, target } = {}) => {
  if (typeof document === 'undefined') return;
  const root = target && typeof target.getRootNode === 'function' ? target.getRootNode() : document;
  // A shadow root takes the <style> directly; a document takes it in <head>.
  const host = root && root !== document && root.appendChild ? root : document.head;
  if (!host || injectedInto.has(host)) return;
  if (host.querySelector && host.querySelector(`#${STYLE_ID}`)) {
    injectedInto.add(host);
    return;
  }
  const el = document.createElement('style');
  el.id = STYLE_ID;
  if (nonce) el.setAttribute('nonce', nonce);
  el.textContent = STYLESHEET;
  // FIRST, not appended. The sheet lands when the component mounts, which is after every
  // stylesheet the page loaded — so appending would put the library's rules last and let
  // them win every specificity tie against the consumer's own CSS. The token blocks are
  // additionally `:where()`-wrapped (see lib/stylesheet.js), which handles the tie for
  // the variables no matter where this ends up; putting the element first extends the
  // same courtesy to the rest of the rules.
  host.insertBefore(el, host.firstChild);
  injectedInto.add(host);
};

export { styleText };

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
export const SortIcon = ({ direction, color = v('sort-icon'), size = 9 }) => (
  <svg viewBox="0 0 10 14" aria-hidden="true" focusable="false" style={{ ...svgBase(size), fill: color }}>
    {direction !== 'desc' && <polygon points="5,1 9.2,5.8 0.8,5.8" opacity={direction === 'asc' ? 1 : 0.85} />}
    {direction !== 'asc' && <polygon points="5,13 9.2,8.2 0.8,8.2" opacity={direction === 'desc' ? 1 : 0.85} />}
  </svg>
);

/** Pin / thumbtack — marks the freeze-boundary column. */
export const PinIcon = ({ color = v('accent'), size = 10, title }) => (
  <svg viewBox="0 0 16 16" focusable="false" style={{ ...svgBase(size), fill: color }} role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'}>
    {title ? <title>{title}</title> : null}
    <path d="M9.6 1a1 1 0 0 0-.7 1.7l.3.3-3.4 2.5-2-.4a1 1 0 0 0-.9 1.7l3 3-3.4 4 4.6-3 3 3a1 1 0 0 0 1.7-.9l-.4-2 2.5-3.4.3.3A1 1 0 0 0 15.6 7L9.6 1z" />
  </svg>
);

/** Soft empty-state glyph (Semantic's `inbox`). */
export const InboxIcon = ({ color = v('icon-muted'), size = 34 }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ ...svgBase(size), fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
    <path d="M3 13h4l1.5 3h7L17 13h4" />
    <path d="M5.2 4.5h13.6L21 13v5.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V13z" />
  </svg>
);

const SearchIcon = ({ color = v('search-icon'), size = 11 }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" style={{ ...svgBase(size), fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' }}>
    <circle cx="6.8" cy="6.8" r="4.6" />
    <path d="M10.4 10.4 14 14" />
  </svg>
);

/**
 * The per-column filter box — a plain `<input>` dressed to match the compact
 * Semantic "mini icon input" the table was designed around.
 *
 * Slot contract (`components.FilterInput`): `{ value, onChange, onClick, placeholder,
 * fontSize }`. `onClick` must be attached to the input itself — it stops the click from
 * reaching the header and toggling the sort.
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

/** Stacked-columns glyph for the toolbar's column menu. */
export const ColumnsIcon = ({ color = v('icon'), size = 12 }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" style={{ ...svgBase(size), fill: color }}>
    <rect x="1" y="2" width="3.4" height="12" rx="1" />
    <rect x="6.3" y="2" width="3.4" height="12" rx="1" opacity=".65" />
    <rect x="11.6" y="2" width="3.4" height="12" rx="1" opacity=".4" />
  </svg>
);

/**
 * The move-this-column control in the Columns menu. A chevron rather than the `↑` / `↓`
 * text glyphs it used to be: those are drawn by whatever font the host page happens to
 * use, so they came out thin, differently sized and vertically off in most of them.
 */
export const MoveIcon = ({ dir = 'up', size = 11 }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" style={{ ...svgBase(size), fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
    {dir === 'up' ? <path d="M3.5 10 8 5.5 12.5 10" /> : <path d="M3.5 6 8 10.5 12.5 6" />}
  </svg>
);

/** Tick for a checked menu entry. Rendered in a fixed-width box so labels stay aligned. */
export const CheckIcon = ({ color = v('accent'), size = 11, checked }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" style={{ ...svgBase(size), fill: 'none', stroke: checked ? color : 'transparent', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
    <path d="M2.5 8.5 6.2 12 13.5 4" />
  </svg>
);

/**
 * Centred loading spinner + caption.
 *
 * Slot contract (`components.Spinner`): `{ text }`. The `size` / `color` props are the
 * built-in's own and a replacement may ignore them.
 */
export const Spinner = ({ text, size = 32, color = v('accent') }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
    <span className="ft-spinner" style={{ width: size, height: size, borderTopColor: color }} />
    {text ? <span style={{ color, fontSize: '13px' }}>{text}</span> : null}
  </div>
);

/**
 * The "nothing to show" state.
 *
 * Slot contract (`components.Empty`): `{ text }` — whatever `emptyText` was set to.
 */
export const Empty = ({ text }) => (
  <React.Fragment>
    <InboxIcon />
    <div style={{ marginTop: 8, fontSize: '13px' }}>{text}</div>
  </React.Fragment>
);

/**
 * A toolbar button.
 *
 * Slot contract (`components.Button`): `{ children, onClick, className, ...aria }`. A
 * replacement MUST spread the rest onto its own `<button>` — `aria-expanded` is what the
 * built-in styling keys the open state off, and what a screen reader announces.
 */
export const Button = ({ children, className, ...rest }) => (
  <button type="button" className={cx('ft-btn', className)} {...rest}>
    {children}
  </button>
);

/**
 * A toolbar popover.
 *
 * Slot contract (`components.Menu`): `{ children, align, className }`. It is positioned
 * against a `position: relative` parent inside `.ft-root`, and it must NOT portal to
 * `document.body`: the menus deliberately live inside the root (but outside `.ft-wrap`)
 * so the table's own tokens are inherited and the freeze is unaffected.
 */
export const Menu = ({ children, align = 'left', className }) => (
  <div className={cx('ft-menu', className)} style={align === 'right' ? { right: 0 } : { left: 0 }} role="menu">
    {children}
  </div>
);

/**
 * One entry in a menu.
 *
 * Slot contract (`components.MenuItem`): `{ children, checked, icon: Icon, className,
 * ...rest }`. `checked` is `undefined` for a plain action entry, a boolean for a
 * checkbox/radio one; the rest (`role`, `aria-checked`, `disabled`, `onClick`, `title`)
 * is spread onto the button and a replacement must forward it.
 *
 * `icon` is the resolved `components.CheckIcon`, threaded through rather than imported
 * so that overriding CheckIcon alone still reaches the menus — otherwise the two slots
 * would silently not compose, and someone replacing the tick would have to replace the
 * whole MenuItem to see it.
 */
export const MenuItem = ({ children, checked, icon: Icon = CheckIcon, className, ...rest }) => (
  <button type="button" className={cx('ft-menu-item', className)} {...rest}>
    {checked !== undefined && Icon && <Icon checked={checked} />}
    {children}
  </button>
);

/** A group label inside a menu. Slot contract: `{ children }`. */
export const MenuHeading = ({ children }) => <div className="ft-menu-head">{children}</div>;

/** A rule between menu groups. Slot contract: no props. */
export const MenuSeparator = () => <div className="ft-menu-sep" />;

/**
 * The built-in for every `components` slot, in one object so `resolveComponents` has
 * something to merge over and the identity stays stable when nothing is overridden.
 */
export const DEFAULT_COMPONENTS = {
  FilterInput,
  Button,
  Menu,
  MenuItem,
  MenuHeading,
  MenuSeparator,
  Spinner,
  Empty,
  SortIcon,
  PinIcon,
  CheckIcon,
  ColumnsIcon,
};
