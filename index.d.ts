import * as React from 'react';
import type { Column as RTColumn, Row, TableInstance } from 'react-table';

/** Reusable single-line ellipsis style for custom `Cell` renderers. */
export declare const ELLIPSIS: React.CSSProperties;

export type FreezeTableAlign = 'left' | 'center' | 'right';

/**
 * Column config. Extends react-table v7's column with the layout/pinning extras
 * FreezeTable adds. `width` / `minWidth` are **pixels**, not flex weights.
 */
export interface FreezeTableColumn<D extends object = any> {
  /** Header content. A plain string is recommended (a toolbar pin menu can list it). */
  Header?: React.ReactNode;
  /** Field key, or `(row) => value` (an accessor fn also needs an `id`). */
  accessor?: keyof D | string | ((row: D, index: number) => any);
  /** Required when `accessor` is a function or absent. */
  id?: string;
  /** Cell renderer. Receives the table instance spread (so `userList` is readable). */
  Cell?: (props: any) => React.ReactNode;
  /** Footer content — a function receives the table instance, so `info.rows` are the FILTERED rows. */
  Footer?: React.ReactNode | ((info: any) => React.ReactNode);
  /** Custom filter UI (e.g. a dropdown for an enum column). */
  Filter?: (props: any) => React.ReactNode;
  /** Custom react-table filter fn, or the name of a built-in one. */
  filter?: string | ((rows: Row<D>[], columnIds: string[], filterValue: any) => Row<D>[]);
  /** Column width in px (default 1 — i.e. effectively `minWidth`). */
  width?: number;
  /** Minimum width in px (default 90). A `width` below this is silently ignored. */
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
  /** DEFAULT freeze state. Only a leading run counts (col 1..N all flagged). */
  pinned?: boolean;
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
  /** TOTAL table height in px (header + body + footer). Default 500. */
  height?: number | string;
  /** Row height in px. Default 44 (dense list: 35). */
  rowHeight?: number;
  /** Drives cells, header labels and footer. Default 12 (dense: 11). */
  fontSize?: number;
  /** Forwarded onto the table instance → readable inside every `Cell`. */
  userList?: any;
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
  /** Static left-aligned footer label — cannot see filtered rows (prefer a column `Footer`). */
  footerLeft?: React.ReactNode;
  /** Override footer visibility (auto = any column `Footer` or `footerLeft` set). */
  showFooter?: boolean;
  /** Keyboard row navigation. Default true. */
  rowNavigation?: boolean;
  /** Settle vertical scrolling on a row boundary instead of leaving a half-row cut
   *  off by the sticky header (spreadsheet behaviour). Default true. */
  rowSnap?: boolean;
  /** Fires on every selection change. */
  onRowSelect?: (rowData: D, index: number) => void;
  /** Fires on Enter — "open this row". */
  onRowEnter?: (rowData: D, index: number) => void;
  /** Selected-row highlight colour. Default '#d3e5f8'. */
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
  /** Persist the user's pin boundary in `localStorage["ctPin:<key>"]`. */
  pinStorageKey?: string;
  /** Extra class on the outer scroller. */
  className?: string;
  /** Extra inline styles merged onto the outer scroller. */
  style?: React.CSSProperties;
}

/** Imperative API exposed through `ref`. */
export interface FreezeTableHandle {
  /** Re-focus the table container (e.g. after a modal closes). */
  focus(): void;
  /** Current horizontal offset — stash it before navigating away. */
  getScrollLeft(): number;
  /** Current EFFECTIVE freeze boundary (viewpoft-capped; 0 = none). */
  getPinCount(): number;
  /** Largest boundary the current viewport allows — disable menu entries beyond it. */
  getMaxPinCount(): number;
  /** Set the freeze boundary (0 = none, N = first N caller columns). */
  setPinCount(n: number): void;
  /** Select + scroll to + focus a row. */
  selectRow(index: number): void;
}

export declare const FreezeTable: React.ForwardRefExoticComponent<
  FreezeTableProps<any> & React.RefAttributes<FreezeTableHandle>
>;

/** Drop-in alias for projects migrating off a local `CommonTable`. */
export declare const CommonTable: typeof FreezeTable;

export default FreezeTable;

export type { RTColumn, Row, TableInstance };
