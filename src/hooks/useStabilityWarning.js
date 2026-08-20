import React from 'react';

/**
 * Development-only warning about a prop that is rebuilt, unchanged, on every render.
 *
 * `columns` and `data` are the memo roots of the whole component: a new array identity
 * rebuilds the layout, the column defs and `itemData`, which re-renders every visible
 * row. Passing an inline `[...]`, or a fresh `Object.values(byId)`, therefore turns every
 * parent render into a full table re-render — and the symptom (an arrow-key list that
 * feels heavy) never points back at the cause. The README has always said "memoize
 * these"; this says it at the moment it matters instead.
 *
 * The signal is a NEW ARRAY WITH THE SAME CONTENTS, several renders running — not merely
 * a changed identity, which is exactly what a list that refetches is supposed to produce.
 */

// Cheap enough for a dev-only check: every element for a short array, an even sample for
// a long one. Identity comparison only — the point is "the same objects, re-wrapped".
const sameContents = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const step = a.length > 500 ? Math.ceil(a.length / 50) : 1;
  for (let i = 0; i < a.length; i += step) if (a[i] !== b[i]) return false;
  return true;
};

export const useStabilityWarning = (name, value) => {
  const seen = React.useRef({ last: null, strikes: 0, warned: false });
  if (process.env.NODE_ENV === 'production') return;
  const s = seen.current;
  if (s.warned) return;
  if (s.last !== null && s.last !== value) {
    s.strikes = sameContents(s.last, value) ? s.strikes + 1 : 0;
    // Three renders in a row, so a single unlucky coincidence cannot trip it.
    if (s.strikes >= 3) {
      s.warned = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[freeze-table] the \`${name}\` prop is a new array on every render, with the ` +
          'same contents each time. Wrap it in useMemo — otherwise every parent render ' +
          'rebuilds the column layout and re-renders every visible row.'
      );
    }
  }
  s.last = value;
};

export default useStabilityWarning;
