import { useCallback, useState } from "react";

/**
 * Preferencia tabla/gráfica persistida en localStorage por clave.
 * @param {string} key
 * @param {"table"|"chart"} fallback
 */
export function useAdminViewPref(key, fallback = "chart") {
  const storageKey = `admin.tools.view.${key}`;
  const [view, setViewState] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === "table" || raw === "chart") return raw;
    } catch {
      /* ignore */
    }
    return fallback;
  });

  const setView = useCallback(
    (next) => {
      const value = next === "table" ? "table" : "chart";
      setViewState(value);
      try {
        localStorage.setItem(storageKey, value);
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  return [view, setView];
}
