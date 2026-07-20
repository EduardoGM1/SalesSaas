import { optionTitleKey } from "@/lib/survey/discovery-questions.js";

export function isCustomOptionKey(key) {
  return String(key || "").startsWith("custom_");
}

/** Parsea opciones_override → keys activas + labels custom. */
export function parseOpcionesOverride(raw, bankKeys = []) {
  if (!Array.isArray(raw)) {
    return { optionKeys: [...bankKeys], optionLabels: {} };
  }
  const bankSet = new Set(bankKeys);
  const optionKeys = [];
  const optionLabels = {};
  for (const item of raw) {
    const key = typeof item === "string" ? item : item?.key;
    if (!key) continue;
    const k = String(key);
    if (!isCustomOptionKey(k) && bankSet.size && !bankSet.has(k)) continue;
    optionKeys.push(k);
    const label = typeof item === "object" && item?.label != null ? String(item.label).trim() : "";
    if (label) optionLabels[k] = label;
  }
  return { optionKeys, optionLabels };
}

/**
 * Label a mostrar (activo o histórico 2C):
 * - label override si existe
 * - key activa de banco / i18n
 * - eliminada custom → "Opción eliminada"
 * - eliminada de banco → i18n original
 */
export function resolveOptionDisplayLabel(questionId, key, ctx, t) {
  const k = String(key || "");
  if (!k) return "";
  const labels = ctx?.optionLabels || {};
  if (labels[k]) return labels[k];

  const activeKeys = ctx?.activeKeys;
  const inActive = !Array.isArray(activeKeys) || activeKeys.includes(k);
  const custom = isCustomOptionKey(k);

  if (!inActive && custom) {
    return t("survey.disc.optionDeleted");
  }
  if (custom) {
    return labels[k] || t("survey.disc.optionDeleted");
  }
  return t(optionTitleKey(questionId, k));
}

export function newCustomOptionKey() {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `custom_${id}`;
}

/**
 * Compara editor vs banco para decidir si persistir null.
 * `bankLabelOf(key)` opcional: si el label del editor coincide con el del banco,
 * se trata como sin override (permite precargar value en UI sin forzar persistencia).
 */
export function opcionesOverrideOrNull(editorOptions, bankKeys, bankLabelOf) {
  if (!Array.isArray(editorOptions)) return null;
  const bank = bankKeys || [];
  const normalized = editorOptions.map((o) => {
    let label = String(o.label || "").trim();
    if (label && !isCustomOptionKey(o.key) && typeof bankLabelOf === "function") {
      const bankLabel = String(bankLabelOf(o.key) || "").trim();
      if (bankLabel && label === bankLabel) label = "";
    }
    if (label) return { key: o.key, label };
    return { key: o.key };
  });
  const sameKeys =
    normalized.length === bank.length
    && normalized.every((o, i) => o.key === bank[i] && !o.label);
  if (sameKeys) return null;
  return normalized;
}
