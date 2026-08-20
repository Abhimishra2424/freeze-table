import React from 'react';
import { FilterInput as BuiltInFilterInput } from '../internal-ui';
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

/**
 * The per-column search box. Its click is stopped so it never toggles the sort.
 *
 * ## Why the replaceable input is read off the instance and not closed over
 *
 * react-table's `decorateColumn` MUTATES each column object — `Object.assign(column,
 * {...defaultColumn, ...column})` — so whatever `Filter` is stamped on a column the
 * first time it is decorated stays there for the life of that object. Building this
 * component around a captured `FilterInput` therefore froze the `components.FilterInput`
 * slot at mount: changing it later did nothing, and the reason was three layers away
 * inside a dependency.
 *
 * `render('Filter')` spreads the table instance into these props, and FreezeTable
 * forwards the resolved slot map onto the instance as `ui` (the same route `userList`
 * and `context` take). So the stamped function is permanently identical — which is what
 * react-table wants — while the component it delegates to is read fresh on every render.
 */
export const DefaultColumnFilter = ({ ui, column: { filterValue, setFilter, preFilteredRows } }) => {
  const FilterInput = (ui && ui.FilterInput) || BuiltInFilterInput;
  return (
    <FilterInput
      value={filterValue || ''}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setFilter(e.target.value || undefined)}
      placeholder={`Search ${preFilteredRows.length}...`}
    />
  );
};
