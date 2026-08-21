import React from 'react';
import { cx, skin } from '../lib/slots';
import { v } from '../lib/theme';

/**
 * The built-in toolbar — the two menus that used to be "yours to render".
 *
 * Everything it drives already existed on the imperative ref, and a caller who wants
 * their own design system's dropdowns still has that route; this is the version for the
 * far more common case, where a list wants the standard freeze / show-hide / reorder
 * menus and nobody wants to write them again per screen.
 *
 * It sits OUTSIDE `.ft-wrap`, inside `.ft-root`. That matters twice: the menus have their
 * own `overflow-y`, and a scroll container inside the scrollport would become the sticky
 * container for the cells beneath it and break the column freeze — and staying inside
 * `.ft-root` is what puts the menus in the token scope, so they inherit the table's
 * theme instead of needing one of their own.
 *
 * Every visual piece here — the buttons, the popover, each entry, the headings and the
 * rules — comes in through `ui`, so a caller can hand the toolbar their own design
 * system's components (`components` prop) and keep the behaviour.
 *
 * Menu state is local and deliberately dumb — one open menu at a time, closed by a click
 * anywhere else, by Escape, or by making a choice. Every choice hands focus back to the
 * table, so the arrow keys keep working without a click on the rows.
 */

const usePopover = (open, onClose) => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined; // nothing to dismiss — do not listen on the document
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return ref;
};

/**
 * Drag-to-reorder inside the Columns menu.
 *
 * The rows are few and not windowed, so this is deliberately simpler than the header
 * drag on the table itself: no rAF loop, no measuring cache — on each pointermove it
 * asks the DOM which row is under the pointer and remembers the edge. The commit happens
 * once, on pointerup, for the same reason the header drag commits once: the column defs
 * feed every visible row, so reordering per frame would re-render the whole table.
 */
const useMenuDrag = (onMove) => {
  const [drag, setDrag] = React.useState(null);
  const dragRef = React.useRef(null);
  dragRef.current = drag;

  const start = (id, index) => (e) => {
    // Left button only, and never let the press reach the menu's dismiss handler.
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, from: index, over: index, edge: 'above' });
  };

  const move = (e) => {
    const state = dragRef.current;
    if (!state) return;
    // elementFromPoint rather than a rect cache: the list can scroll under the pointer
    // mid-drag, and a cache taken at pointerdown would then point at the wrong rows.
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el && el.closest ? el.closest('[data-ft-menu-index]') : null;
    if (!row) return;
    const over = parseInt(row.getAttribute('data-ft-menu-index'), 10);
    const box = row.getBoundingClientRect();
    const edge = e.clientY < box.top + box.height / 2 ? 'above' : 'below';
    if (over !== state.over || edge !== state.edge) setDrag({ ...state, over, edge });
  };

  const end = () => {
    const state = dragRef.current;
    setDrag(null);
    if (!state) return;
    // moveColumn takes the index the column lands on AFTER it has been lifted out, so
    // dropping below a row that sits above the dragged one needs no adjustment, while
    // dropping above one does.
    let to = state.edge === 'below' ? state.over + 1 : state.over;
    if (state.from < to) to -= 1;
    if (to !== state.from) onMove(state.id, to);
  };

  return { drag, start, move, end };
};

/** Show / hide, drag to reorder, and the three resets. */
const ColumnMenu = ({ list, onToggle, onMove, onShowAll, onResetWidths, onResetOrder, ui, classNames }) => {
  const { drag, start, move, end } = useMenuDrag(onMove);
  const shown = list.filter((c) => !c.hidden).length;
  const Checkbox = ui.CheckboxIcon;
  return (
    <ui.Menu className={classNames.menu}>
      <ui.MenuHeading note={`${shown} of ${list.length}`}>Columns</ui.MenuHeading>
      <div onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        {list.map((c, i) => (
          <div
            key={c.id || c.position}
            className="ft-menu-row"
            data-ft-menu-index={i}
            data-ft-dragging={drag && drag.from === i ? '1' : undefined}
            data-ft-drop={drag && drag.from !== i && drag.over === i ? drag.edge : undefined}
          >
            <ui.MenuItem
              role="menuitemcheckbox"
              aria-checked={!c.hidden}
              checked={!c.hidden}
              icon={Checkbox}
              className={classNames.menuItem}
              disabled={!c.hideable}
              onClick={() => onToggle(c.id)}
              // A column with no header text (or a node for one) still has to be listable, or
              // the menu would silently be missing rows the table is showing.
              title={c.hideable ? undefined : 'This column cannot be hidden'}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.header || c.id}
              </span>
            </ui.MenuItem>
            <button
              type="button"
              className="ft-menu-move"
              disabled={!c.movable}
              onPointerDown={c.movable ? start(c.id, i) : undefined}
              // The drag is the affordance; the arrow keys are how it is reachable without
              // a pointer. Dropping the two arrow buttons cannot mean dropping keyboard
              // reordering with them.
              onKeyDown={(e) => {
                if (!c.movable) return;
                if (e.key === 'ArrowUp' && c.position > 0) { e.preventDefault(); onMove(c.id, c.position - 1); }
                if (e.key === 'ArrowDown' && c.position < list.length - 1) { e.preventDefault(); onMove(c.id, c.position + 1); }
              }}
              title="Drag to reorder · ↑ ↓ to move"
              aria-label={`Reorder ${c.header || c.id}`}
            >
              {ui.GripIcon && <ui.GripIcon />}
            </button>
          </div>
        ))}
      </div>
      <ui.MenuSeparator />
      <div className="ft-menu-actions">
        <button type="button" className="ft-menu-action" onClick={onShowAll}>Show all</button>
        <span className="ft-menu-action-sep" aria-hidden="true">·</span>
        <button type="button" className="ft-menu-action" onClick={onResetWidths}>Reset widths</button>
        <span className="ft-menu-action-sep" aria-hidden="true">·</span>
        <button type="button" className="ft-menu-action" onClick={onResetOrder}>Reset order</button>
      </div>
    </ui.Menu>
  );
};

/**
 * "Pin up to here" on the left, "pin from here" on the right, as two radio groups with
 * the current state spelled out in the title bar — before that the only way to know how
 * much was frozen was to find the marked entry somewhere in a list of forty.
 *
 * Entries past the viewport cap are disabled rather than hidden, so the menu shows WHY a
 * column cannot be frozen (there would be no room left to read the scrolling ones)
 * instead of quietly omitting it.
 */
const PinMenu = ({ columns, left, maxLeft, right, maxRight, onLeft, onRight, ui, classNames }) => {
  const Radio = ui.RadioIcon;
  const note = left || right
    ? `${left ? `${left} left` : 'none left'} · ${right ? `${right} right` : 'none right'}`
    : 'none';
  const entry = (key, label, checked, disabled, onClick) => (
    <ui.MenuItem
      key={key}
      role="menuitemradio"
      aria-checked={checked}
      aria-current={checked}
      checked={checked}
      icon={Radio}
      className={classNames.menuItem}
      disabled={disabled}
      onClick={onClick}
      title={disabled ? 'Not enough room left for the scrolling columns' : undefined}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </ui.MenuItem>
  );
  return (
    <ui.Menu align="right" className={classNames.menu}>
      <ui.MenuHeading note={note}>Freeze</ui.MenuHeading>
      <div className="ft-menu-group">Left edge</div>
      {entry('l0', 'No freeze', left === 0, false, () => onLeft(0))}
      {columns.map((c, i) => entry('l' + i, `Up to ${c.label}`, left === i + 1, i + 1 > maxLeft, () => onLeft(i + 1)))}
      <ui.MenuSeparator />
      <div className="ft-menu-group">Right edge</div>
      {entry('r0', 'No freeze', right === 0, false, () => onRight(0))}
      {columns.map((c, i) => {
        const n = columns.length - i;
        return entry('r' + i, `From ${c.label}`, right === n, n > maxRight, () => onRight(n));
      })}
    </ui.Menu>
  );
};

export const Toolbar = ({ toolbarRef, fontPx, config, getColumnList, pinColumns, pin, api, refocus, ui, classNames, unstyled }) => {
  const [open, setOpen] = React.useState(null);
  const close = React.useCallback(() => setOpen(null), []);
  const boxRef = usePopover(open !== null, close);

  // An action that ends the job closes the menu and hands the keyboard back to the rows —
  // a menu left open after a choice leaves the table unfocused, and the arrow keys dead.
  // Show/hide and move are deliberately NOT wrapped: the point of those is to make
  // several changes in one visit.
  const run = (f) => (...args) => {
    f(...args);
    close();
    refocus();
  };

  const showColumns = config.columns !== false;
  const showPin = config.pin !== false && pinColumns.length > 0;

  return (
    <div
      ref={toolbarRef}
      className={cx('ft-toolbar ct-toolbar', classNames.toolbar)}
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxSizing: 'border-box',
        ...skin(unstyled, {
          padding: '6px 8px',
          borderBottom: `1px solid ${v('border')}`,
          background: v('toolbar-bg'),
          fontSize: fontPx,
        }),
      }}
    >
      {config.left != null && <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{config.left}</div>}
      <div style={{ flex: 1 }} />
      {config.right != null && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{config.right}</div>}
      <div ref={boxRef} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {showColumns && (
          <div style={{ position: 'relative' }}>
            <ui.Button
              className={classNames.button}
              aria-haspopup="menu"
              aria-expanded={open === 'columns'}
              onClick={() => setOpen(open === 'columns' ? null : 'columns')}
            >
              {ui.ColumnsIcon && <ui.ColumnsIcon />}
              Columns
            </ui.Button>
            {open === 'columns' && (
              <ColumnMenu
                // Derived only while the menu is open: the shell re-renders on every
                // scroll frame (the windowing offset is state), and walking the column
                // order each of those frames for a menu nobody is looking at is waste.
                list={getColumnList()}
                onToggle={api.toggleColumn}
                onMove={api.moveColumn}
                onShowAll={run(api.showAllColumns)}
                onResetWidths={run(api.resetColumnWidths)}
                onResetOrder={run(api.resetColumnOrder)}
                ui={ui}
                classNames={classNames}
              />
            )}
          </div>
        )}
        {showPin && (
          <div style={{ position: 'relative' }}>
            <ui.Button
              className={classNames.button}
              aria-haspopup="menu"
              aria-expanded={open === 'pin'}
              onClick={() => setOpen(open === 'pin' ? null : 'pin')}
            >
              {ui.PinIcon && <ui.PinIcon color={v('icon')} size={11} />}
              Freeze
              {pin.left + pin.right > 0 && (
                <span style={{ color: v('accent'), fontWeight: 700 }}>
                  {pin.left > 0 ? ' ' + pin.left : ''}
                  {pin.left > 0 && pin.right > 0 ? ' +' : ''}
                  {pin.right > 0 ? ' ' + pin.right : ''}
                </span>
              )}
            </ui.Button>
            {open === 'pin' && (
              <PinMenu
                columns={pinColumns}
                left={pin.left}
                maxLeft={pin.maxLeft}
                right={pin.right}
                maxRight={pin.maxRight}
                onLeft={run(api.setLeftPinCount)}
                onRight={run(api.setRightPinCount)}
                ui={ui}
                classNames={classNames}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Toolbar;
