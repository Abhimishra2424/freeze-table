/**
 * The design-token layer: every colour, radius and shadow the table paints, named once.
 *
 * ## Why tokens and not props
 *
 * Before 1.1 every visual was a hex literal sitting in an inline style object, and a
 * consumer had no way to reach any of it. Three separate walls made that so:
 *
 *  - an inline style beats a stylesheet rule, so the `ft-*` classes the component has
 *    always carried were decorative — you could select `.ft-row` but not repaint it;
 *  - the injected stylesheet's `:hover`, `:focus-visible` and `[aria-checked]` rules
 *    cannot be expressed as a prop at all, and that is where two thirds of the colours
 *    lived (the toolbar buttons, the menus, the scrollbar thumb, the resize line);
 *  - the row hover is painted by a JS handler writing `style.backgroundColor` directly
 *    (see VirtualRow) — nothing in a stylesheet can beat that.
 *
 * A CSS custom property walks through all three: an inline style may *hold* a `var()`,
 * and it resolves against the element's own cascade, so `.ft-root { --ft-row-bg: … }`
 * from the consumer's own CSS reaches a value that JS wrote onto the element.
 *
 * ## The two tiers
 *
 * `LIGHT` is the flat, fully-resolved palette: every token with a literal value. It is
 * what an inline `var(--ft-x, <fallback>)` falls back to, which is what keeps the table
 * looking right when the stylesheet never arrives (a strict `style-src` CSP, a shadow
 * root the injector could not reach).
 *
 * `LADDER` is the part that makes the system usable: the derived tokens point at core
 * ones rather than repeating a literal, so setting six variables re-themes the whole
 * table and setting one re-themes exactly one thing. It is only expressible in a
 * stylesheet, so `themeCss` emits the ladder and the inline fallbacks stay flat.
 *
 * Adding a token means: a `LIGHT` entry (required), a `LADDER` entry if it derives from
 * a core one, and a `DARK` entry if the light value would be unreadable on a dark
 * surface. `tokenNames()` is the reconciled list and the unit tests assert the three
 * maps agree.
 */

/** The `--ft-` prefix, in one place, so a rename is one edit. */
export const TOKEN_PREFIX = '--ft-';

/**
 * The ten core tokens. Everything else derives from these, so this is the list to put in
 * front of someone asking "how do I make it match my app?".
 */
export const CORE_TOKENS = [
  'bg',
  'surface',
  'text',
  'text-muted',
  'border',
  'accent',
  'accent-soft',
  'accent-text',
  'radius',
  'font',
];

/**
 * Every token, fully resolved. This IS the light theme, and it is also the inline
 * fallback table — so each value has to be a literal, never a `var()`.
 */
export const LIGHT = {
  // --- core ---
  bg: '#ffffff',
  surface: '#f4f5f7',
  text: '#000000',
  'text-muted': '#8a94a6',
  border: '#e3e8ee',
  accent: '#0070C2',
  'accent-soft': '#e9f2fb',
  'accent-text': '#0a4d84',
  radius: '4px',
  font: 'inherit',

  // --- header ---
  'header-bg': '#ffffff',
  'header-text': '#000000',

  // --- rows ---
  'row-bg': '#ffffff',
  'row-hover': '#eef4fb',
  'row-selected': '#d3e5f8',
  'row-border': '#edf0f3',

  // --- footer ---
  'foot-bg': '#f4f5f7',
  'foot-text': '#000000',

  // --- toolbar ---
  'toolbar-bg': '#fbfcfd',

  // --- menus ---
  'menu-bg': '#ffffff',
  'menu-border': '#dde3ea',
  'menu-text': '#243447',
  'menu-head-text': '#66738a',
  'menu-item-hover': '#f0f5fa',
  'menu-item-active-bg': '#e9f2fb',
  'menu-item-active-text': '#0a4d84',
  'menu-sep': '#eceff3',
  'menu-move-text': '#8794a8',
  'menu-move-hover': '#dfe7f0',
  'radius-menu': '6px',

  // --- toolbar buttons ---
  'btn-bg': '#ffffff',
  'btn-text': '#243447',
  'btn-border': '#d7dde5',
  'btn-hover-bg': '#f2f6fa',
  'btn-hover-border': '#c2ccd8',
  'btn-active-bg': '#e9f2fb',
  'btn-active-border': '#9dc4e8',

  // --- the per-column filter box ---
  'input-bg': '#ffffff',
  'input-text': 'rgba(0,0,0,.87)',
  'input-border': 'rgba(34,36,38,.15)',
  'input-focus-border': '#85b7d9',
  'input-placeholder': 'rgba(0,0,0,.35)',

  // --- icons ---
  icon: '#5a6b82',
  'icon-muted': '#c2cbd6',
  'sort-icon': '#000000',
  'search-icon': 'rgba(0,0,0,.45)',
  'spinner-track': 'rgba(0,0,0,.10)',

  // --- overlay scrollbars ---
  scrollbar: '#c3ccd6',
  'scrollbar-hover': '#a7b3c1',
  'scrollbar-active': '#8c9bab',

  // --- drag affordances ---
  'resize-line': '#0070C2',
  'drop-line': '#0070C2',
  'focus-ring': '#0070C2',

  // --- elevation ---
  'shadow-menu': '0 6px 20px rgba(20,32,48,.16)',
  // The separator cast by the last left-frozen column once the table is scrolled, and its
  // mirror on the first right-frozen one. They are what makes a frozen block read as
  // floating above the columns sliding underneath it.
  'shadow-pin': '6px 0 6px -4px rgba(0,0,0,0.18)',
  'shadow-pin-right': '-6px 0 6px -4px rgba(0,0,0,0.18)',
};

/**
 * Which tokens derive from which. A value here replaces the `LIGHT` literal in the
 * emitted stylesheet — `--ft-row-bg: var(--ft-bg, #ffffff)` — so overriding `--ft-bg`
 * alone moves the header, the rows, the menus and the filter boxes together.
 *
 * Only put a token here when the derivation is genuinely always right. `row-hover` is a
 * deliberate omission: it is a *tint* of the surface, not the surface, and deriving it
 * would make every theme's hover invisible.
 */
export const LADDER = {
  'header-bg': 'bg',
  'header-text': 'text',
  'row-bg': 'bg',
  'foot-bg': 'surface',
  'foot-text': 'text',
  'menu-bg': 'bg',
  'menu-item-active-bg': 'accent-soft',
  'menu-item-active-text': 'accent-text',
  'btn-bg': 'bg',
  'btn-text': 'menu-text',
  'btn-active-bg': 'accent-soft',
  'input-bg': 'bg',
  'sort-icon': 'text',
  'resize-line': 'accent',
  'drop-line': 'accent',
  'focus-ring': 'accent',
};

/**
 * The built-in dark palette, as a partial override of `LIGHT`.
 *
 * Partial on purpose: anything the ladder derives (`row-bg` from `bg`, `foot-bg` from
 * `surface`, the two accent-tinted backgrounds) follows its core token automatically and
 * must NOT be repeated here, or a consumer overriding `--ft-bg` in dark mode would find
 * the rows ignoring them. What is listed is exactly the set whose light literal would be
 * unreadable on a dark surface.
 */
export const DARK = {
  bg: '#0f172a',
  surface: '#1e293b',
  text: '#e2e8f0',
  'text-muted': '#94a3b8',
  border: '#334155',
  accent: '#38bdf8',
  'accent-soft': '#1e3a5f',
  'accent-text': '#7dd3fc',

  'row-hover': '#1e293b',
  'row-selected': '#1e3a5f',
  'row-border': '#1e293b',

  'toolbar-bg': '#111c30',

  'menu-border': '#334155',
  'menu-text': '#e2e8f0',
  'menu-head-text': '#94a3b8',
  'menu-item-hover': '#1e293b',
  'menu-sep': '#334155',
  'menu-move-text': '#94a3b8',
  'menu-move-hover': '#334155',

  'btn-border': '#334155',
  'btn-hover-bg': '#1e293b',
  'btn-hover-border': '#475569',
  'btn-active-border': '#38bdf8',

  'input-text': '#e2e8f0',
  'input-border': '#334155',
  'input-focus-border': '#38bdf8',
  'input-placeholder': '#64748b',

  icon: '#94a3b8',
  'icon-muted': '#475569',
  'search-icon': '#94a3b8',
  'spinner-track': 'rgba(255,255,255,.12)',

  scrollbar: '#475569',
  'scrollbar-hover': '#64748b',
  'scrollbar-active': '#94a3b8',

  'shadow-menu': '0 6px 20px rgba(0,0,0,.5)',
  'shadow-pin': '6px 0 6px -4px rgba(0,0,0,0.5)',
  'shadow-pin-right': '-6px 0 6px -4px rgba(0,0,0,0.5)',
};

/** Every token name, in declaration order. */
export const tokenNames = () => Object.keys(LIGHT);

/** `'row-bg'` -> `'--ft-row-bg'`. Accepts a name already carrying the prefix. */
export const tokenProp = (name) => (name.startsWith(TOKEN_PREFIX) ? name : TOKEN_PREFIX + name);

/**
 * The value an INLINE style uses: `var(--ft-row-bg, #ffffff)`.
 *
 * The literal fallback is not belt-and-braces — it is the whole reason the table still
 * renders correctly when `injectStyles` never ran (CSP, shadow DOM, `unstyled`). Pass
 * `fallback` to override it for a one-off (the `selectedBg` prop does this, so a caller
 * who set that prop keeps winning over the token).
 */
export const v = (name, fallback) => {
  const value = fallback !== undefined ? fallback : LIGHT[name];
  return value === undefined ? `var(${tokenProp(name)})` : `var(${tokenProp(name)}, ${value})`;
};

/**
 * The declaration body for one palette, e.g. `--ft-bg:#fff;--ft-row-bg:var(--ft-bg,#fff);`.
 *
 * `base` true emits every token, resolving through `LADDER`; false emits only the keys
 * the given palette actually overrides, which is what a `[data-ft-theme="dark"]` block
 * wants — a dark block that re-stated the derived tokens would pin them to literals and
 * break the ladder for anyone theming on top of it.
 */
export const themeCss = (palette, { base = false } = {}) => {
  const names = base ? tokenNames() : Object.keys(palette);
  return names
    .map((name) => {
      const derived = base && LADDER[name];
      const value = derived ? v(LADDER[name]) : palette[name];
      return value === undefined ? '' : `${tokenProp(name)}:${value};`;
    })
    .join('');
};

/**
 * The `tokens` prop -> an inline style object of custom properties.
 *
 * This is the no-CSS-file route: `tokens={{ accent: '#7c3aed', 'row-hover': '#faf5ff' }}`
 * lands as inline custom properties on `.ft-root`, which outrank the stylesheet's base
 * block and are inherited by everything inside — including the menus, which portal
 * nowhere and stay within the root. Keys may be written with or without the `--ft-`
 * prefix; unknown names are passed through rather than dropped, so a consumer can set a
 * variable of their own that their `classNames` CSS reads.
 */
export const resolveTokens = (tokens) => {
  if (!tokens) return null;
  const out = {};
  Object.keys(tokens).forEach((name) => {
    const value = tokens[name];
    if (value === undefined || value === null || value === false) return;
    out[tokenProp(name)] = String(value);
  });
  return Object.keys(out).length ? out : null;
};
