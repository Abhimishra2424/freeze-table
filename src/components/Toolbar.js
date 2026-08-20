import React from 'react';
import { CheckIcon, ColumnsIcon, PinIcon } from '../internal-ui';

/**
 * The built-in toolbar — the two menus that used to be "yours to render".
 *
 * Everything it drives already existed on the imperative ref, and a caller who wants
 * their own design system's dropdowns still has that route; this is the version for the
 * far more common case, where a list wants the standard freeze / show-hide / reorder
 * menus and nobody wants to write them again per screen.
 *
 * It sits OUTSIDE `.ft-wrap`, inside `.ft-root`. That matters: the menus have their own
 * `overflow-y`, and a scroll container inside the scrollport would become the sticky
 * container for the cells beneath it and break the column freeze.
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

const Menu = ({ children, align = 'left' }) => (
  <div className="ft-menu" style={align === 'right' ? { right: 0 } : { left: 0 }} role="menu">
    {children}
  </div>
);

/** Show / hide, move up / down, and the three resets. */
const ColumnMenu = ({ list, onToggle, onMove, onShowAll, onResetWidths, onResetOrder }) => (
  <Menu>
    <div className="ft-menu-head">Columns</div>
    {list.map((c) => (
      <div key={c.id || c.position} style={{ display: 'flex', alignItems: 'center' }}>
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={!c.hidden}
          className="ft-menu-item"
          disabled={!c.hideable}
          onClick={() => onToggle(c.id)}
          // A column with no header text (or a node for one) still has to be listable, or
          // the menu would silently be missing rows the table is showing.
          title={c.hideable ? undefined : 'This column cannot be hidden'}
        >
          <CheckIcon checked={!c.hidden} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.header || c.id}
          </span>
        </button>
        <span style={{ display: 'flex', paddingRight: 4 }}>
          <button type="button" className="ft-menu-move" disabled={!c.movable || c.position === 0} onClick={() => onMove(c.id, c.position - 1)} title="Move left" aria-label={`Move ${c.header || c.id} left`}>
            ↑
          </button>
          <button type="button" className="ft-menu-move" disabled={!c.movable || c.position === list.length - 1} onClick={() => onMove(c.id, c.position + 1)} title="Move right" aria-label={`Move ${c.header || c.id} right`}>
            ↓
          </button>
        </span>
      </div>
    ))}
    <div className="ft-menu-sep" />
    <button type="button" role="menuitem" className="ft-menu-item" onClick={onShowAll}>
      Show all columns
    </button>
    <button type="button" role="menuitem" className="ft-menu-item" onClick={onResetWidths}>
      Reset widths
    </button>
    <button type="button" role="menuitem" className="ft-menu-item" onClick={onResetOrder}>
      Reset order
    </button>
  </Menu>
);

/**
 * "Pin up to here" on the left, "pin from here" on the right. Entries past the viewport
 * cap are disabled rather than hidden, so the menu shows WHY a column cannot be frozen
 * (there would be no room left to read the scrolling ones) instead of quietly omitting it.
 */
const PinMenu = ({ columns, left, maxLeft, right, maxRight, onLeft, onRight }) => (
  <Menu align="right">
    <div className="ft-menu-head">Freeze left</div>
    <button type="button" role="menuitemradio" aria-checked={left === 0} aria-current={left === 0} className="ft-menu-item" onClick={() => onLeft(0)}>
      <CheckIcon checked={left === 0} />
      <span>No freeze</span>
    </button>
    {columns.map((c, i) => (
      <button
        key={'l' + i}
        type="button"
        role="menuitemradio"
        aria-checked={left === i + 1}
        aria-current={left === i + 1}
        className="ft-menu-item"
        disabled={i + 1 > maxLeft}
        onClick={() => onLeft(i + 1)}
        title={i + 1 > maxLeft ? 'Not enough room left for the scrolling columns' : undefined}
      >
        <CheckIcon checked={left === i + 1} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Up to {c.label}</span>
      </button>
    ))}
    <div className="ft-menu-sep" />
    <div className="ft-menu-head">Freeze right</div>
    <button type="button" role="menuitemradio" aria-checked={right === 0} aria-current={right === 0} className="ft-menu-item" onClick={() => onRight(0)}>
      <CheckIcon checked={right === 0} />
      <span>No freeze</span>
    </button>
    {columns.map((c, i) => {
      const n = columns.length - i;
      return (
        <button
          key={'r' + i}
          type="button"
          role="menuitemradio"
          aria-checked={right === n}
          aria-current={right === n}
          className="ft-menu-item"
          disabled={n > maxRight}
          onClick={() => onRight(n)}
          title={n > maxRight ? 'Not enough room left for the scrolling columns' : undefined}
        >
          <CheckIcon checked={right === n} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>From {c.label}</span>
        </button>
      );
    })}
  </Menu>
);

export const Toolbar = ({ toolbarRef, fontPx, config, getColumnList, pinColumns, pin, api, refocus }) => {
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
      className="ft-toolbar ct-toolbar"
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderBottom: '1px solid #e3e8ee',
        background: '#fbfcfd',
        fontSize: fontPx,
        boxSizing: 'border-box',
      }}
    >
      {config.left != null && <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{config.left}</div>}
      <div style={{ flex: 1 }} />
      {config.right != null && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{config.right}</div>}
      <div ref={boxRef} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {showColumns && (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="ft-btn"
              aria-haspopup="menu"
              aria-expanded={open === 'columns'}
              onClick={() => setOpen(open === 'columns' ? null : 'columns')}
            >
              <ColumnsIcon />
              Columns
            </button>
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
              />
            )}
          </div>
        )}
        {showPin && (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="ft-btn"
              aria-haspopup="menu"
              aria-expanded={open === 'pin'}
              onClick={() => setOpen(open === 'pin' ? null : 'pin')}
            >
              <PinIcon color="#5a6b82" size={11} />
              Freeze
              {pin.left + pin.right > 0 && (
                <span style={{ color: '#0070C2', fontWeight: 700 }}>
                  {pin.left > 0 ? ' ' + pin.left : ''}
                  {pin.left > 0 && pin.right > 0 ? ' +' : ''}
                  {pin.right > 0 ? ' ' + pin.right : ''}
                </span>
              )}
            </button>
            {open === 'pin' && (
              <PinMenu
                columns={pinColumns}
                left={pin.left}
                maxLeft={pin.maxLeft}
                right={pin.right}
                maxRight={pin.maxRight}
                onLeft={run(api.setLeftPinCount)}
                onRight={run(api.setRightPinCount)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Toolbar;
