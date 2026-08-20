/**
 * The two escape hatches above the token layer: per-slot class names, and per-slot
 * component replacement.
 *
 * Tokens (see theme.js) re-colour the table. They cannot make it *look like* someone
 * else's design system — a shadcn app wants its own button, its own popover and its own
 * input, not a recoloured copy of ours. These two props are that second step:
 *
 *   classNames  a utility-CSS app hands each slot a class string instead of writing CSS
 *   components  a design-system app hands each slot its own component outright
 *
 * Both are deliberately additive and default to nothing, so the zero-config path — the
 * package's actual selling point — stays exactly as it was.
 */

/**
 * Join the component's own class with whatever the caller assigned to that slot.
 *
 * Caller classes come LAST so that in a utility-CSS setup (Tailwind and friends, where
 * specificity is flat and source order decides) they win. Falsy entries are dropped so
 * `cx('ft-row ct-row', classNames.row)` is safe with no `classNames` at all.
 */
export const cx = (...parts) => {
  const joined = parts.filter(Boolean).join(' ');
  // `undefined`, not `''`: React omits a missing className but renders `class=""` for an
  // empty string, and the elements that pass through a possibly-absent className (the
  // table box, the body band) would otherwise gain an empty attribute in every snapshot.
  return joined || undefined;
};

/** Every `classNames` slot, so the docs, the types and the tests cannot drift apart. */
export const CLASS_SLOTS = [
  'root',
  'toolbar',
  'button',
  'menu',
  'menuItem',
  'wrap',
  'table',
  'head',
  'th',
  'thLabel',
  'thFilter',
  'resizer',
  'body',
  'row',
  'cell',
  'foot',
  'footCell',
  'empty',
  'loading',
  'track',
  'thumb',
];

/**
 * Normalize the `classNames` prop to an object that is always safe to index.
 *
 * Returns a shared frozen empty object when nothing was passed, so the common case adds
 * no allocation per render and the identity stays stable for the memo chain.
 */
const NO_CLASSES = Object.freeze({});
export const resolveClassNames = (classNames) => classNames || NO_CLASSES;

/** Every `components` slot. Same reason as CLASS_SLOTS. */
export const COMPONENT_SLOTS = [
  'FilterInput',
  'Button',
  'Menu',
  'MenuItem',
  'MenuHeading',
  'MenuSeparator',
  'Spinner',
  'Empty',
  'SortIcon',
  'PinIcon',
  'CheckIcon',
  'ColumnsIcon',
];

/**
 * Merge the caller's `components` over the built-in defaults.
 *
 * Returns the defaults object ITSELF when there is nothing to override. That identity
 * matters more than it looks: the resolved map feeds `DEFAULT_COLUMN.Filter`, and a new
 * object every render would rebuild react-table's column defs — and with them every
 * cell — on each pass.
 *
 * An explicit `null` for a slot means "render nothing here", which is how a caller drops
 * the sort arrows or the pin marker without supplying a replacement; only `undefined`
 * (or a missing key) falls back to the default.
 */
export const resolveComponents = (overrides, defaults) => {
  if (!overrides) return defaults;
  const keys = Object.keys(overrides).filter((k) => overrides[k] !== undefined);
  if (!keys.length) return defaults;
  const out = Object.assign({}, defaults);
  keys.forEach((k) => {
    out[k] = overrides[k];
  });
  return out;
};

/**
 * The `unstyled` gate for a decorative style block.
 *
 * Every style object in this package is a mix of two kinds of declaration and only one
 * of them is safe to remove:
 *
 *   ENGINE  `position: sticky` and its left/right offsets, the absolute row placement at
 *           `index * rowHeight`, the flex layout, `overflow`, `zIndex`, the measured
 *           widths. These ARE the freeze and the virtualization. Removing any of them
 *           does not produce an unstyled table, it produces a broken one.
 *   SKIN    backgrounds, borders, text colour, padding, font weight, radius.
 *
 * So `unstyled` never touches a style object wholesale — each call site spreads its skin
 * half through `skin(unstyled, {...})`, which returns `null` when the caller has opted
 * out. Keeping the split at the call site (rather than a list of "removable properties"
 * somewhere central) is what stops the next visual from landing on the wrong side of it.
 */
export const skin = (unstyled, styles) => (unstyled ? null : styles);
