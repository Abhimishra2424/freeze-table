/**
 * Small prop helpers, kept out of the component so they can be read (and tested) on
 * their own.
 */

/**
 * The `height` prop, as a CSS value.
 *
 * It used to be `parseFloat(height)`, which quietly turned `height="100%"` into a 100px
 * table and `height="60vh"` into a 60px one — the number parsed, the unit was thrown
 * away, and nothing complained. A bare number (or a numeric string) is still pixels;
 * anything carrying a unit is passed straight through, and `'fill'` is the readable
 * spelling of "as tall as whatever contains me".
 *
 * A percentage only resolves against a parent with a definite height — the usual reason
 * `height="100%"` collapses to nothing is that the parent has none.
 */
export const resolveHeight = (height) => {
  if (height == null) return undefined;
  if (typeof height === 'number') return height;
  const s = String(height).trim();
  if (s === 'fill' || s === 'full') return '100%';
  if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s); // '500' -> 500px, as before
  return s; // '100%', '60vh', 'calc(100vh - 120px)'
};
