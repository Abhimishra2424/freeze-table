import React from 'react';
import { FilterInput } from '../internal-ui';
import { ELLIPSIS } from '../lib/columns';

/**
 * What a column renders when it configures neither a `Cell` nor a `Filter`.
 *
 * The default cell prints the raw value on one line with an ellipsis and a `title`, so a
 * clipped value is still readable on hover. `0` / `'0'` / `'NULL'` are blanked
 * deliberately: these lists are financial, and a column of zeros is noise that hides the
 * rows that do carry a figure.
 */
export const DefaultCell = ({ value }) => {
  const show = value !== undefined && value !== null && value !== 'NULL' && value !== 0 && value !== '0';
  return (
    <div style={ELLIPSIS} title={show ? String(value) : ''}>
      {show ? value : ''}
    </div>
  );
};

/** The per-column search box. Its click is stopped so it never toggles the sort. */
export const DefaultColumnFilter = ({ column: { filterValue, setFilter, preFilteredRows } }) => (
  <FilterInput
    value={filterValue || ''}
    onClick={(e) => e.stopPropagation()}
    onChange={(e) => setFilter(e.target.value || undefined)}
    placeholder={`Search ${preFilteredRows.length}...`}
  />
);
