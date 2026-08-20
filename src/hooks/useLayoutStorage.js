import React from 'react';

/**
 * The `pinStorageKey` side of the layout: every per-user choice rides on the same key,
 * each in its own `localStorage` entry — the freeze boundaries (`ctPin:` / `ctPinR:`,
 * plain numbers), the dragged column widths (`ctW:`, an id -> px map), the hidden
 * columns (`ctHide:`, a list of ids) and the column order (`ctOrd:`, a list of ids).
 * Without the key nothing is persisted and every choice is per-mount.
 *
 * Every read is wrapped: `localStorage` throws outright in a sandboxed iframe and in
 * Safari's private mode, and a stored value can be left over from an older version of
 * the column config. A bad read always falls back to the config default rather than
 * taking the table down.
 */
export const useLayoutStorage = (pinStorageKey) => {
  const readNumber = React.useCallback(
    (key) => {
      if (!pinStorageKey) return null;
      try {
        const v = window.localStorage.getItem(`${key}:${pinStorageKey}`);
        if (v != null && v !== '') {
          const n = parseInt(v, 10);
          if (!Number.isNaN(n) && n >= 0) return n;
        }
      } catch (e) { /* storage unavailable — fall back to config default */ }
      return null;
    },
    [pinStorageKey]
  );

  const readJson = React.useCallback(
    (key) => {
      if (!pinStorageKey) return null;
      try {
        const v = window.localStorage.getItem(`${key}:${pinStorageKey}`);
        if (v) {
          const parsed = JSON.parse(v);
          if (parsed && typeof parsed === 'object') return parsed;
        }
      } catch (e) { /* unreadable or no longer JSON — fall back to the config default */ }
      return null;
    },
    [pinStorageKey]
  );

  const persist = React.useCallback(
    (key, value) => {
      if (!pinStorageKey) return;
      try {
        window.localStorage.setItem(
          `${key}:${pinStorageKey}`,
          typeof value === 'object' ? JSON.stringify(value) : String(value)
        );
      } catch (e) { /* ignore */ }
    },
    [pinStorageKey]
  );

  return { readNumber, readJson, persist };
};

export default useLayoutStorage;
