import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/** Carpetas de Nivel 1 (query `tab=`). */
export const EXPEDIENTE_TABS = {
  survey: "survey",
  vacaciones: "vacaciones",
  worksheet: "worksheet",
  cliente: "cliente",
  venta: "venta",
  notas: "notas",
};

/** Sub-tabs reales de Worksheet RH (query `sub=`). No existen Resumen ni Pre VLO. */
export const WORKSHEET_RH_SUBS = {
  financiamiento: "financiamiento",
  venta: "venta",
  moneybox: "moneybox",
  worksheet: "worksheet",
};

function normalizeSub(raw) {
  if (!raw) return "";
  if (raw === "money-box") return WORKSHEET_RH_SUBS.moneybox;
  return raw;
}

/**
 * Navegación de carpetas del expediente por query params.
 * Empuja historial para que el atrás del navegador restaure tab/sub-tab.
 *
 * Pendientes de producto (no implementar aquí):
 * - Si Venta/Notas tendrán sub-tabs a futuro
 * - Persistencia del último tab entre sesiones
 * - Límite de carpetas visibles en mobile
 */
export function useExpedienteFolderNav() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "";
  const sub = normalizeSub(params.get("sub") || "");

  const setFolder = useCallback((nextTab, nextSub) => {
    const next = new URLSearchParams(params);
    if (nextTab) next.set("tab", nextTab);
    else next.delete("tab");
    if (nextTab === EXPEDIENTE_TABS.worksheet && nextSub) {
      next.set("sub", nextSub);
    } else {
      next.delete("sub");
    }
    setParams(next);
  }, [params, setParams]);

  const setSub = useCallback((nextSub) => {
    const next = new URLSearchParams(params);
    if (!tab) next.set("tab", EXPEDIENTE_TABS.worksheet);
    if (nextSub) next.set("sub", nextSub);
    else next.delete("sub");
    setParams(next);
  }, [params, setParams, tab]);

  return { tab, sub, setFolder, setSub };
}
