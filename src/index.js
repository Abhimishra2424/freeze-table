export { FreezeTable, ELLIPSIS, default } from './FreezeTable';
// Drop-in alias for projects migrating off a local `CommonTable`.
export { FreezeTable as CommonTable } from './FreezeTable';

/**
 * The theming surface (1.1).
 *
 * `styleText` is the stylesheet the component would inject, for an app that would rather
 * place it itself — an SSR head, or a CSP that forbids injected tags (the same text ships
 * as `freeze-table/styles.css`).
 *
 * The palettes and `tokenNames` are exported so a consumer can build a theme
 * programmatically — read the names, map them onto their own design tokens, hand the
 * result back through the `tokens` prop — instead of copying a list out of the README
 * and finding it stale a version later.
 */
export { styleText } from './lib/stylesheet';
export { CORE_TOKENS, DARK, LIGHT, tokenNames, tokenProp } from './lib/theme';
export { CLASS_SLOTS, COMPONENT_SLOTS } from './lib/slots';
