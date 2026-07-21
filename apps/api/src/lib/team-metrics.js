/**
 * Helpers de métricas de equipo (API).
 * Alineados a las reglas del dashboard vendedor / admin overview.
 * No inventar datos: solo interpretar filas reales.
 */

export function isSaleCountable(sale) {
  const status = String(sale?.status || "venta").toLowerCase();
  const processing = String(sale?.processing || "venta").toLowerCase();
  if (status === "cancelada") return false;
  if (status === "pendiente" || processing === "pendiente") return false;
  return true;
}

export function isQuantifiableTourProspect(p) {
  if (!p?.tour_date) return false;
  if (p.tour_cuantificable === false) return false;
  return true;
}

export function isProspectFinalized(p) {
  if (p?.completed === true) return true;
  const st = String(p?.status || "").toLowerCase();
  return st === "venta" || st === "cerrado" || st === "procesado";
}

/** Discovery = sección disc_json del Survey con ≥1 respuesta. */
export function discoveryAnswerCount(data) {
  if (!data || typeof data !== "object") return 0;
  const raw = data.disc_json;
  if (!raw) return 0;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const answers = parsed?.answers && typeof parsed.answers === "object" ? parsed.answers : {};
    let n = 0;
    for (const sel of Object.values(answers)) {
      if (Array.isArray(sel) && sel.length > 0) n += 1;
      else if (typeof sel === "string" && sel.trim()) n += 1;
    }
    if (typeof parsed?.hasTs === "string" && parsed.hasTs.trim()) n += 1;
    return n;
  } catch {
    return 0;
  }
}

export function hasDiscoveryProgress(data) {
  return discoveryAnswerCount(data) > 0;
}

/** Survey con datos suficientes para Analysis (heurística de surveyHasData). */
export function surveyHasAnalysisData(data) {
  if (!data || typeof data !== "object") return false;
  return Object.keys(data).some((k) => {
    if (k === "disc_json") return hasDiscoveryProgress(data);
    const v = data[k];
    if (v == null) return false;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return String(v).trim() !== "";
  });
}

export function pctDelta(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c > 0 ? 100 : 0;
  return Math.round(((c - p) / p) * 1000) / 10;
}

export function pctOf(part, whole) {
  const w = Number(whole) || 0;
  if (w <= 0) return 0;
  return Math.round(((Number(part) || 0) / w) * 1000) / 10;
}

export function monthBounds(year, month1to12) {
  const y = Number(year);
  const m = Number(month1to12);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(y, m, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end, daysInMonth: endDate.getUTCDate() };
}

export function shiftMonth(year, month1to12, delta) {
  const d = new Date(Date.UTC(year, month1to12 - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function inDateRange(isoDate, start, end) {
  if (!isoDate) return false;
  const d = String(isoDate).slice(0, 10);
  return d >= start && d <= end;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
