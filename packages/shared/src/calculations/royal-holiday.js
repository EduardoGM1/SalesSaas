/**
 * Motor puro Worksheet Royal Holiday — lookups y reglas de comisión.
 * Reutilizable por API y web.
 */

export function calcularFechaPagoComision(fechaEvento) {
  const d = fechaEvento instanceof Date ? new Date(fechaEvento) : new Date(String(fechaEvento));
  if (Number.isNaN(d.getTime())) throw new Error("Fecha de evento inválida.");
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  if (day <= 15) {
    return new Date(Date.UTC(year, month, 25));
  }
  // día 16–31 → día 10 del mes siguiente
  return new Date(Date.UTC(year, month + 1, 10));
}

export function toDateStr(d) {
  const x = d instanceof Date ? d : new Date(d);
  return x.toISOString().slice(0, 10);
}

/** Mayor tier de bottom_line con holiday_credits <= hc. */
export function lookupBottomLine(rows, holidayCredits) {
  const hc = Number(holidayCredits) || 0;
  const sorted = [...(rows || [])].sort((a, b) => Number(a.holiday_credits) - Number(b.holiday_credits));
  let best = null;
  for (const row of sorted) {
    if (Number(row.holiday_credits) <= hc) best = row;
  }
  return best;
}

export function lookupCostoAdministrativo(rows, enganchePct) {
  const eng = Number(enganchePct) || 0;
  // enganchePct en UI suele ser 15, 25…; catálogo puede estar en 0.15 o 15
  const engNorm = eng > 1 ? eng : eng * 100;
  const sorted = [...(rows || [])]
    .map((r) => ({
      ...r,
      min: Number(r.enganche_pct_min) > 1 ? Number(r.enganche_pct_min) : Number(r.enganche_pct_min) * 100,
    }))
    .sort((a, b) => a.min - b.min);
  let best = null;
  for (const row of sorted) {
    if (row.min <= engNorm) best = row;
  }
  return best;
}

export function normalizeEnganchePct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n : n * 100;
}

export function lookupComision(rows, { downPaymentPct, holidayCredits, posicion }) {
  const dp = normalizeEnganchePct(downPaymentPct);
  const hc = Number(holidayCredits) || 0;
  const pos = String(posicion || "").toLowerCase().trim();
  const match = (rows || []).find((r) => {
    const rDp = normalizeEnganchePct(r.down_payment_pct);
    const min = Number(r.hc_rango_min);
    const max = Number(r.hc_rango_max);
    return rDp === dp && hc >= min && hc <= max && String(r.posicion).toLowerCase() === pos;
  });
  return match || null;
}

export function plazosDisponibles(financiamientoRows, { enganchePct, nacionalidad }) {
  const eng = normalizeEnganchePct(enganchePct);
  const nat = String(nacionalidad || "").toLowerCase();
  return (financiamientoRows || []).filter((r) => {
    const rEng = normalizeEnganchePct(r.enganche_pct);
    return rEng === eng && String(r.nacionalidad).toLowerCase() === nat;
  });
}

export function calcularMensualidad(montoVenta, factorMensual) {
  return (Number(montoVenta) || 0) * (Number(factorMensual) || 0);
}

/** Totales alineados al Worksheet estándar: eng, eng+cc, balance. */
export function calcularTotalesWorksheet({ montoVenta, enganchePct, costoAdmin, balanceAnterior = 0 }) {
  const wv = Number(montoVenta) || 0;
  const we = normalizeEnganchePct(enganchePct);
  const eng = (wv * we) / 100;
  const cc = Number(costoAdmin) || 0;
  const wob = Number(balanceAnterior) || 0;
  return {
    enganche: eng,
    engancheMasAdmin: eng + cc,
    balanceAFinanciar: wv - eng + wob,
  };
}

export function regalosDisponibles(regalos, { holidayCredits, montoVenta }) {
  const hc = Number(holidayCredits) || 0;
  const mv = Number(montoVenta) || 0;
  return (regalos || []).filter((g) => {
    const r = g.restricciones || {};
    if (r.venta_minima_hc != null && hc < Number(r.venta_minima_hc)) return false;
    if (r.venta_minima_usd != null && mv < Number(r.venta_minima_usd)) return false;
    return true;
  });
}

/**
 * Diferencia de comisión por cambio de franja (Extra DP).
 * Ejemplo: 5.25% → 8.5% → diferencia 3.25%.
 */
export function diferenciaComisionPct(pctAnterior, pctNuevo) {
  return (Number(pctNuevo) || 0) - (Number(pctAnterior) || 0);
}

export function montoComision(montoVenta, porcentaje) {
  return (Number(montoVenta) || 0) * ((Number(porcentaje) || 0) / 100);
}

/** Membresía se activa al llegar a 25% enganche acumulado. */
export const RH_MEMBRESIA_ENGANCHE_PCT = 25;
export const RH_VENTANA_CANCELACION_DIAS = 90;

export function membresiaDebeActivarse(engancheAcumuladoPct) {
  return normalizeEnganchePct(engancheAcumuladoPct) >= RH_MEMBRESIA_ENGANCHE_PCT;
}

export function dentroVentanaCancelacion(activadaAt, ahora = new Date()) {
  if (!activadaAt) return false;
  const start = new Date(activadaAt);
  const end = new Date(start.getTime() + RH_VENTANA_CANCELACION_DIAS * 24 * 60 * 60 * 1000);
  return ahora < end;
}
