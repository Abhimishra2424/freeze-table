import * as React from 'react';
import type { Column as RTColumn, Row, TableInstance } from 'react-table';

/** Reusable single-line ellipsis style for custom `Cell` renderers. */
export declare const ELLIPSIS: React.CSSProperties;

export type FreezeTableAlign = 'left' | 'center' | 'right';

/** Built-in cell shorthands — see `FreezeTableColumn.type`. */
export type FreezeTableColumnType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'serial';

/** Built-in footer shorthands — see `FreezeTableColumn.footer`. */
export type FreezeTableFooterKind = 'sum' | 'avg' | 'min' | 'max' | 'count';

/** Built-in themes for the `theme` prop — see {@link FreezeTableProps.theme}. */
export type FreezeTableTheme = 'light' | 'dark' | 'auto';

/**
 * A design token, with or without its `--ft-` prefix. The full list is in README §12;
 * `tokenNames()` returns it at runtime, and the ten in {@link CORE_TOKENS} are the ones
 * everything else derives from.
 */
export type FreezeTableToken = string;

/** The `tokens` prop: token name -> CSS value. */
export type FreezeTableTokens = Record<FreezeTableToken, string | number>;

/**
 * Per-slot class names, merged AFTER the component's own `ft-*` class so that in a
 * flat-specificity setup (Tailwind and friends) yours wins.
 */
export interface FreezeTableClassNames {
  /** The outer box. Joined with the `className` prop, which still comes last. */
  root?: string;
  /** The toolbar strip (`toolbar` only). */
  toolbar?: string;
  /** Each toolbar button. */
  button?: string;
  /** An open toolbar popover. */
  menu?: string;
  /** One entry in a menu. */
  menuItem?: string;
  /** The scrollport. */
  wrap?: string;
  /** The flex box holding header, body and footer. */
  table?: string;
  /** The header row. */
  head?: string;
  /** Each header cell. */
  th?: string;
  /** The label + sort-arrow row inside a header cell. */
  thLabel?: string;
  /** The wrapper around a column's filter box. */
  thFilter?: string;
  /** The drag-to-resize grip. */
  resizer?: string;
  /** The row band. */
  body?: string;
  /** Each row. */
  row?: string;
  /** Each body cell. */
  cell?: string;
  /** The footer row. */
  foot?: string;
  /** Each footer cell. */
  footCell?: string;
  /** The empty state. */
  empty?: string;
  /** The loading state. */
  loading?: string;
  /** Both overlay scrollbar tracks. */
  track?: string;
  /** Both overlay scrollbar thumbs. */
  thumb?: string;
}

/**
 * Replaceable UI pieces. Each key defaults to the built-in; `null` renders nothing at
 * all (that is how the sort arrows or the pin marker are dropped without supplying a
 * replacement), and `undefined` falls back to the default.
 *
 * Memoize this object — like `columns`, a fresh literal each render costs work
 * downstream.
 */
export interface FreezeTableComponents {
  /** The per-column search box. Props: `{ value, onChange, onClick, placeholder }` — `onClick` must reach the input, it is what stops the click toggling the sort. */
  FilterInput?: React.ComponentType<any> | null;
  /** A toolbar button. Props: `{ children, className, onClick, ...aria }` — spread the rest onto a real `<button>`, `aria-expanded` carries the open state. */
  Button?: React.ComponentType<any> | null;
  /** A toolbar popover. Props: `{ children, align, className }`. Must not portal to `document.body` — it lives inside `.ft-root` so it inherits the tokens. */
  Menu?: React.ComponentType<any> | null;
  /** One menu entry. Props: `{ children, checked, icon, className, ...rest }` — forward `role` / `aria-checked` / `disabled` / `onClick` / `title`. */
  MenuItem?: React.ComponentType<any> | null;
  /** A group label in a menu. Props: `{ children }`. */
  MenuHeading?: React.ComponentType<any> | null;
  /** A rule between menu groups. No props. */
  MenuSeparator?: React.ComponentType<any> | null;
  /** The loading state. Props: `{ text }`. */
  Spinner?: React.ComponentType<any> | null;
  /** The empty state. Props: `{ text }`. */
  Empty?: React.ComponentType<any> | null;
  /** The header sort arrow. Props: `{ direction: 'asc' | 'desc' | null }`. */
  SortIcon?: React.ComponentType<any> | null;
  /** The freeze-boundary marker. Props: `{ title, color, size }`. */
  PinIcon?: React.ComponentType<any> | null;
  /** The tick on a checked menu entry. Props: `{ checked }`. */
  CheckIcon?: React.ComponentType<any> | null;
  /** The toolbar's column-menu glyph. No required props. */
  ColumnsIcon?: React.ComponentType<any> | null;
}

/** What the table is currently doing. Replaces the `loading` + `dataFetched` pair. */
export type FreezeTableStatus = 'idle' | 'loading' | 'ready';

/**
 * The user's whole layout as one value — both freeze boundaries, the dragged widths, the
 * hidden set and the column order. Read it with `getLayout()`, hand it back with
 * `setLayout()`, seed a fresh table with `defaultLayout`.
 */
export interface FreezeTableLayout {
  /** Frozen column counts. `null` = fall back to the column config's `pinned` flags. */
  pins?: { left?: number | null; right?: number | null };
  /** Dragged widths, as an id -> px map. Only columns the user has resized. */
  widths?: Record<string, number>;
  /** Ids of the hidden columns. */
  hidden?: string[];
  /** Display order: a complete list of ids, hidden ones included, `'__actions'` among them. */
  order?: string[];
}

/**
 * Column config. Extends react-table v7's column with the layout/pinning extras
 * FreezeTable adds. `width` / `minWidth` are **pixels**, not flex weights.
 */
export interface FreezeTableColumn<D extends object = any> {
  /** Header content. A node is fine — set {@link FreezeTableColumn.label} alongside it
   *  so the Columns and Freeze menus have something to print. */
  Header?: React.ReactNode;
  /**
   * Plain-text name for this column, used by the built-in menus and `getColumnList()`.
   *
   * Needed whenever `Header` is a node rather than a string — a sort control, a unit on
   * a second line — because a menu entry cannot render an element. Without it those
   * columns are listed by their id, i.e. by field name (`employee_code`), which reads
   * like a bug. A string `Header` is used automatically and needs no `label`.
   */
  label?: string;
  /** Field key, or `(row) => value` (an accessor fn also needs an `id`). */
  accessor?: keyof D | string | ((row: D, index: number) => any);
  /** Required when `accessor` is a function or absent. */
  id?: string;
  /** Cell renderer. Receives the table instance spread (so `userList` / `context` are readable). */
  Cell?: (props: any) => React.ReactNode;
  /**
   * Ready-made cell for the common column kinds — alignment, a sensible width floor, an
   * ellipsis cell with a `title`, and the formatting. Anything you set explicitly wins
   * over what the type would have filled in.
   *
   * - `number` / `currency`: right-aligned, locale grouping (`decimals`, default 2 for
   *   currency), and a `0` shows rather than blanking.
   * - `date` / `datetime`: parsed from a Date, epoch, ISO or `'YYYY-MM-DD HH:mm:ss'`
   *   string and formatted with `dateFormat` / `dateTimeFormat`; min width 110 / 150.
   * - `boolean`: centred tick / blank (see `booleanLabels`).
   * - `serial`: the 1..N display-order column — no accessor needed.
   */
  type?: FreezeTableColumnType;
  /** One-off formatter, when a whole `Cell` would be overkill. */
  format?: (value: any, row: D) => React.ReactNode;
  /** Decimal places for `number` / `currency` cells and their footer total. */
  decimals?: number;
  /** Per-column override of the table's `dateFormat` / `dateTimeFormat`. */
  dateFormat?: string;
  /** `[whenTrue, whenFalse]` for a `boolean` column. Default is a tick and a blank. */
  booleanLabels?: [React.ReactNode, React.ReactNode];
  /** Render `0` as blank. Default true for text (and untyped) columns, false for numeric ones. */
  blankZero?: boolean;
  /**
   * Footer shorthand, computed over the FILTERED rows and formatted like the cells above
   * it. A function or node works too — same as `Footer`, which wins if both are given.
   */
  footer?: FreezeTableFooterKind | React.ReactNode | ((info: any) => React.ReactNode);
  /** Footer content — a function receives the table instance, so `info.rows` are the FILTERED rows. */
  Footer?: React.ReactNode | ((info: any) => React.ReactNode);
  /** Custom filter UI (e.g. a dropdown for an enum column). */
  Filter?: (props: any) => React.ReactNode;
  /** Custom react-table filter fn, or the name of a built-in one. */
  filter?: string | ((rows: Row<D>[], columnIds: string[], filterValue: any) => Row<D>[]);
  /** Column width in px. On its own it also becomes the column's `minWidth`, so one
   *  number is one width — `{ width: 45 }` renders 45px, not react-table's 90px floor. */
  width?: number;
  /** Minimum width in px. Defaults to `width` when that is given, else 90. Set both to
   *  let a column render wider than its floor. */
  minWidth?: number;
  /** Maximum width in px. */
  maxWidth?: number;
  /** Applies to header, cells and footer. */
  align?: FreezeTableAlign;
  /** Hide this column's search box. */
  disableFilters?: boolean;
  /** Disable sorting on this column. */
  disableSortBy?: boolean;
  /** Drop the default cell/header padding. */
  noPadding?: boolean;
  /** DEFAULT freeze state. `true` / `'left'` freezes against the left edge (only a
   *  LEADING run counts), `'right'` against the right edge (only a TRAILING run). */
  pinned?: boolean | 'left' | 'right';
  /** DEFAULT visibility — `true` starts the column hidden. The user's choice (ref:
   *  `toggleColumn` / `setHiddenColumns`) overrides it and persists under
   *  `ctHide:<pinStorageKey>`. Needs an `id` or a string `accessor`. */
  hidden?: boolean;
  /** `false` locks the column visible — it cannot be hidden from any menu. */
  hideable?: boolean;
  /** Drop this column's drag-to-resize grip. */
  disableResizing?: boolean;
  /** Lock this column in place — its header cannot be dragged to a new position. */
  disableReordering?: boolean;
  [key: string]: any;
}

/** Props passed to the component rendered in the auto-appended Action column. */
export interface FreezeTableActionsProps<D extends object = any> {
  /** The raw row object. Note: no row index is passed. */
  object: D;
  /** Whatever was passed as the table's `fn` prop. */
  fn?: any;
}

export interface FreezeTableProps<D extends object = any> {
  /** Column config array. `useMemo` it in the caller. */
  columns: FreezeTableColumn<D>[];
  /** Row array. `useMemo` it in the caller. */
  data: D[];
  /** Component rendered in an auto-appended right-side Action column. */
  Actions?: React.ComponentType<FreezeTableActionsProps<D>>;
  /** Passed straight through to `Actions` as its `fn` prop. */
  fn?: any;
  /**
   * TOTAL table height (toolbar + header + body + footer). A number is pixels; a string
   * with a unit is used as-is (`'100%'`, `'60vh'`, `'calc(100vh - 120px)'`), and
   * `'fill'` means `'100%'`. Default 500. A percentage only resolves against a parent
   * with a definite height.
   */
  height?: number | string;
  /** Row height in px. Default 44 (dense list: 35). */
  rowHeight?: number;
  /** Drives cells, header labels and footer. Default 12 (dense: 11). */
  fontSize?: number;
  /** Forwarded onto the table instance → readable inside every `Cell`. */
  userList?: any;
  /**
   * Also forwarded onto the table instance, and the intended way for a `Cell` to reach
   * the caller's callbacks: `Cell: ({ value, context }) => ...`. Without it, a column
   * config carrying a callback has to be rebuilt as a factory.
   */
  context?: any;
  /** BCP-47 locale for `number` / `currency` columns (e.g. `'en-IN'`). Default: the browser's. */
  locale?: string;
  /** Prefix for `currency` cells and totals, e.g. a currency symbol. */
  currencySymbol?: string;
  /** Pattern for `date` columns. Tokens: YYYY YY MMM MM DD HH hh mm ss A. Default `'DD-MM-YYYY'`. */
  dateFormat?: string;
  /** Pattern for `datetime` columns. Default `'DD-MM-YYYY HH:mm'`. */
  dateTimeFormat?: string;
  /**
   * One prop instead of the `loading` + `dataFetched` pair: `'loading'` shows the
   * spinner, `'ready'` shows the rows (or the empty state), `'idle'` shows neither —
   * nothing has been asked for yet. Wins over the old pair when both are given.
   */
  status?: FreezeTableStatus;
  /** Master switch for sorting. Default true. */
  sortable?: boolean;
  /** Master switch for the per-column search boxes. Default true. */
  searchable?: boolean;
  /** Show the spinner instead of the body. Default false. */
  loading?: boolean;
  /** Gate for the empty state — wire this together with `loading`. Default true. */
  dataFetched?: boolean;
  /** Empty-state copy. Default 'No records found'. */
  emptyText?: React.ReactNode;
  /** Loading-state copy. Default 'Fetching records…'. */
  loadingText?: React.ReactNode;
  /** Action column min width in px. Default 110. */
  actionWidth?: number;
  /** Freeze the Action column against the edge it sits at, without pinning any data
   *  column. (It also freezes automatically whenever it lies inside a frozen run.)
   *  Ignored while the column sits in the middle of the scrolling columns — a frozen
   *  run has to stay contiguous. Default false. */
  pinActions?: boolean;
  /** DEFAULT position of the Action column among the caller's columns: `'last'`
   *  (default), `'first'`, or an index into `columns`. The user's own order (drag, or
   *  the ref methods) overrides it and persists under `ctOrd:<pinStorageKey>`. */
  actionIndex?: number | 'first' | 'last';
  /** Static left-aligned footer label — cannot see filtered rows (prefer a column `Footer`). */
  footerLeft?: React.ReactNode;
  /** Override footer visibility (auto = any column `Footer` or `footerLeft` set). */
  showFooter?: boolean;
  /** Keyboard row navigation. Default true. */
  rowNavigation?: boolean;
  /** Settle vertical scrolling on a row boundary once scrolling stops, so the top row
   *  is never cut off by the sticky header (spreadsheet behaviour). Default false. */
  rowSnap?: boolean;
  /** Fires on every selection change. */
  onRowSelect?: (rowData: D, index: number) => void;
  /** Fires on Enter — "open this row". */
  onRowEnter?: (rowData: D, index: number) => void;
  /** Selected-row highlight colour. Defaults to the `--ft-row-selected` token, so it
   *  follows the theme; an explicit value still wins. */
  selectedBg?: string;
  /** Field used by `initialSelectedId`. Default 'id'. */
  rowIdKey?: string;
  /** Re-select + scroll to this row once, after the rows load. */
  initialSelectedId?: string | number | null;
  /** Restore horizontal scroll once, after the rows load. */
  initialScrollLeft?: number;
  /** `(rowData) => color | null` — prepends a narrow coloured status-bar column. */
  rowStripColor?: (rowData: D) => string | null | undefined | false;
  /** `(rowData) => string` — hover tooltip on the strip cell. */
  rowStripTitle?: (rowData: D) => string | undefined;
  /** Full-row tint. A returned `backgroundColor` wins over selection/hover. */
  rowStyle?: (rowData: D) => { backgroundColor?: string; color?: string } | undefined;
  /** Strip column width in px. Default 14. */
  stripWidth?: number;
  /** Persist the user's layout in `localStorage`: pin boundaries (`ctPin:<key>` /
   *  `ctPinR:<key>`), dragged column widths (`ctW:<key>`), hidden columns
   *  (`ctHide:<key>`) and the column order (`ctOrd:<key>`). */
  pinStorageKey?: string;
  /** Drag-to-resize grip on every header's right edge (the status strip never gets one).
   *  Default true. */
  resizable?: boolean;
  /** Drag a header sideways to move that column (the Action column included).
   *  Default true. */
  reorderable?: boolean;
  /** Floor for a drag-resized column, in px. Default 48. */
  minColumnWidth?: number;
  /** Fires when a column is resized or reset. `width` is null on a reset; `widths` is the
   *  full id -> px map of user overrides. `id` is null when every width was reset. */
  onColumnResize?: (id: string | null, width: number | null, widths: Record<string, number>) => void;
  /** Fires whenever the hidden-column set changes. */
  onColumnVisibilityChange?: (hiddenIds: string[]) => void;
  /** Fires whenever the column order changes, with the full order (hidden columns
   *  included, and `'__actions'` when there is an Action column). */
  onColumnOrderChange?: (order: string[]) => void;
  /**
   * Starting layout for a table with nothing stored yet — e.g. one loaded from a server.
   * A layout in `localStorage` under `pinStorageKey` wins over it; the column config is
   * the fallback for anything it leaves out.
   */
  defaultLayout?: FreezeTableLayout;
  /**
   * Fires whenever ANY part of the layout changes — the one callback to persist a view
   * per user, instead of stitching together the three `onColumn*` callbacks (and finding
   * the freeze boundaries have none).
   */
  onLayoutChange?: (layout: FreezeTableLayout) => void;
  /**
   * Render the built-in toolbar: a **Columns** menu (show / hide, move, reset) and a
   * **Freeze** menu (both edges, with the entries past the viewport cap disabled). `true`
   * for both; an object to drop one or add your own content beside them. Default false —
   * the imperative ref is still there for a toolbar of your own.
   */
  toolbar?: boolean | {
    /** Show the Columns menu. Default true. */
    columns?: boolean;
    /** Show the Freeze menu. Default true. */
    pin?: boolean;
    /** Your own content, left-aligned (a title, filters, a Refresh button…). */
    left?: React.ReactNode;
    /** Your own content, right-aligned — just before the built-in menus. */
    right?: React.ReactNode;
  };
  /**
   * Which built-in palette to use: `'light'`, `'dark'`, or `'auto'` (follow the OS via
   * `prefers-color-scheme`). Omit it in an app with its own class-based dark toggle —
   * then the table simply reads whatever `--ft-*` variables are in scope, and no media
   * query overrides the choice your app already made.
   */
  theme?: FreezeTableTheme;
  /**
   * Design tokens as inline custom properties on the root — the no-CSS-file route to
   * re-theming. Keys may be written with or without the `--ft-` prefix. They outrank the
   * injected base block and are inherited by everything inside, the toolbar menus
   * included. See README §12 for the full token list.
   */
  tokens?: FreezeTableTokens;
  /** Per-slot class names, for a utility-CSS app. Merged after the built-in `ft-*` class. */
  classNames?: FreezeTableClassNames;
  /** Per-slot component replacement, for a design-system app. Memoize it. */
  components?: FreezeTableComponents;
  /**
   * Render with no paint of our own: no injected stylesheet, and no background, border,
   * text colour, padding or font weight on any element. The freeze and the virtualization
   * are untouched — `position: sticky`, the frozen offsets and the absolute row placement
   * are the engine, not decoration.
   *
   * One thing you must then supply yourself: **a background on `.ft-row`, `.ft-head` and
   * `.ft-foot`.** Frozen cells inherit their row's background, so with a transparent one
   * the scrolling columns show through the frozen block. Default false.
   */
  unstyled?: boolean;
  /**
   * `nonce` for the injected `<style>` tag, for a Content-Security-Policy whose
   * `style-src` has no `'unsafe-inline'`. Without it the browser drops the sheet and the
   * table falls back to its inline values — readable, but with no hover states, no
   * scrollbar thumbs and no theming. `import 'freeze-table/styles.css'` is the other way.
   */
  styleNonce?: string;
  /**
   * Where to inject the stylesheet. Defaults to the table's own root node, which resolves
   * to `document` normally and to the enclosing ShadowRoot inside a web component — a
   * `document.head` sheet does not cross a shadow boundary.
   */
  styleTarget?: Node | null;
  /** Extra class on the root element. Applied after `classNames.root`. */
  className?: string;
  /** Extra inline styles merged onto the root element. Wins over `tokens`. */
  style?: React.CSSProperties;
}

/** One row of {@link FreezeTableHandle.getColumnList} — enough to render a column menu. */
export interface FreezeTableColumnInfo {
  /** react-table id: the explicit `id`, else the string `accessor`. `'__actions'` for
   *  the Action column. */
  id?: string;
  /** Position in the caller's `columns` array — null for the Action column. */
  index: number | null;
  /** Position in the current display order, i.e. the index {@link
   *  FreezeTableHandle.moveColumn} takes. */
  position: number;
  /** The `Header` when it is a plain string (a node cannot be listed in a menu). */
  header?: string;
  /** Currently hidden. */
  hidden: boolean;
  /** Can be hidden at all (`hideable !== false`, and the column has an id). */
  hideable: boolean;
  /** Carries a resize grip. */
  resizable: boolean;
  /** Can be dragged / moved to another position. */
  movable: boolean;
  /** Current width in px — the user's override if there is one, else the configured one. */
  width: number;
}

/** Imperative API exposed through `ref`. */
export interface FreezeTableHandle {
  /** Re-focus the table container (e.g. after a modal closes). */
  focus(): void;
  /** Current horizontal offset — stash it before navigating away. */
  getScrollLeft(): number;
  /** Current EFFECTIVE left-hand freeze boundary (viewport-capped; 0 = none). */
  getLeftPinCount(): number;
  /** Largest left-hand boundary the viewport allows — disable menu entries beyond it. */
  getMaxLeftPinCount(): number;
  /** Freeze the FIRST N caller columns against the left edge (0 = none). */
  setLeftPinCount(n: number): void;
  /** Current EFFECTIVE right-hand freeze boundary (viewport-capped; 0 = none). */
  getRightPinCount(): number;
  /** Largest right-hand boundary the viewport allows. */
  getMaxRightPinCount(): number;
  /** Freeze the LAST N caller columns against the right edge (0 = none; the Action
   *  column, if any, freezes with them). */
  setRightPinCount(n: number): void;

  /** User-resized widths only, as an id -> px map. A column the user has not dragged is
   *  absent (it renders at its configured `width` / `minWidth`). */
  getColumnWidths(): Record<string, number>;
  /** Set one column's width in px (clamped to `minColumnWidth`). */
  setColumnWidth(id: string, px: number): void;
  /** Replace the whole width map at once. */
  setColumnWidths(widths: Record<string, number>): void;
  /** Clear one column's width override, or every one when called with no argument. */
  resetColumnWidths(id?: string): void;
  /** Ids of the currently hidden columns. */
  getHiddenColumns(): string[];
  /** Replace the hidden set (ids of `hideable: false` columns are ignored). */
  setHiddenColumns(ids: string[]): void;
  /** Hide/show one column. Omit `visible` to flip it. */
  toggleColumn(id: string, visible?: boolean): void;
  /** Un-hide everything. */
  showAllColumns(): void;

  /** The current order as a flat list of ids — DISPLAY order, hidden columns included,
   *  and `'__actions'` in it whenever there is an Action column. */
  getColumnOrder(): string[];
  /** Replace the order. Ids left out of the list are slotted back in beside their
   *  configured neighbours; `null` drops the user's order and restores the config one. */
  setColumnOrder(ids: string[] | null): void;
  /** Move one column to a position in {@link getColumnOrder} — the index is read after
   *  the column has been lifted out, so `position - 1` / `position + 1` step it one
   *  place either way. */
  moveColumn(id: string, toIndex: number): void;
  /** Back to the order of the caller's `columns` array. */
  resetColumnOrder(): void;

  /** Everything a column menu needs, in the current DISPLAY order, with the Action
   *  column included so the menu can move that one too. */
  getColumnList(): FreezeTableColumnInfo[];

  /** The whole layout as one value — freeze boundaries, widths, hidden set, order.
   *  Freeze counts are reported UNCAPPED, so a boundary saved on a wide screen is not
   *  trimmed by the window it happened to be read from. */
  getLayout(): Required<FreezeTableLayout>;
  /** Apply a layout. Every key is optional — pass `{ hidden: [...] }` and the rest is
   *  left alone. `null` restores the column config. */
  setLayout(layout: FreezeTableLayout | null): void;
  /** Drop every user layout choice and go back to the column config. */
  resetLayout(): void;

  /** @deprecated Pre-0.6 name for {@link getLeftPinCount}. */
  getPinCount(): number;
  /** @deprecated Pre-0.6 name for {@link getMaxLeftPinCount}. */
  getMaxPinCount(): number;
  /** @deprecated Pre-0.6 name for {@link setLeftPinCount}. */
  setPinCount(n: number): void;
  /** Select + scroll to + focus a row. */
  selectRow(index: number): void;
}

/** The stylesheet the component injects, for an app placing it itself (SSR head, CSP). */
export declare function styleText(): string;

/** The ten tokens everything else derives from. */
export declare const CORE_TOKENS: string[];
/** The fully-resolved light palette — also the inline fallback table. */
export declare const LIGHT: Record<string, string>;
/** The built-in dark palette, as a partial override of {@link LIGHT}. */
export declare const DARK: Record<string, string>;
/** Every token name, in declaration order. */
export declare function tokenNames(): string[];
/** `'row-bg'` -> `'--ft-row-bg'`. A name already carrying the prefix is returned as-is. */
export declare function tokenProp(name: string): string;
/** Every `classNames` slot name. */
export declare const CLASS_SLOTS: Array<keyof FreezeTableClassNames>;
/** Every `components` slot name. */
export declare const COMPONENT_SLOTS: Array<keyof FreezeTableComponents>;

export declare const FreezeTable: React.ForwardRefExoticComponent<
  FreezeTableProps<any> & React.RefAttributes<FreezeTableHandle>
>;

/** Drop-in alias for projects migrating off a local `CommonTable`. */
export declare const CommonTable: typeof FreezeTable;

export default FreezeTable;

export type { RTColumn, Row, TableInstance };
