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
  return resolveComisionTier(rows, { downPaymentPct, holidayCredits, posicion }).row;
}

/**
 * Resuelve comisión por posición/HC y tier de enganche (misma lógica que financiamiento).
 */
export function resolveComisionTier(rows, { downPaymentPct, holidayCredits, posicion }) {
  const dp = normalizeEnganchePct(downPaymentPct);
  const hc = Number(holidayCredits) || 0;
  const pos = String(posicion || "").toLowerCase().trim();
  const candidates = (rows || []).filter((r) => {
    const min = Number(r.hc_rango_min);
    const max = Number(r.hc_rango_max);
    return hc >= min && hc <= max && String(r.posicion).toLowerCase() === pos;
  });
  if (!candidates.length) {
    return { row: null, tier: null, exact: false };
  }

  const tiers = [...new Set(candidates.map((r) => normalizeEnganchePct(r.down_payment_pct)))].sort((a, b) => a - b);

  if (tiers.includes(dp)) {
    const row = candidates.find((r) => normalizeEnganchePct(r.down_payment_pct) === dp) || null;
    return { row, tier: dp, exact: true };
  }

  const qualified = tiers.filter((t) => dp >= t);
  const tier = qualified.length ? Math.max(...qualified) : tiers[0];
  const row = candidates.find((r) => normalizeEnganchePct(r.down_payment_pct) === tier) || null;
  return { row, tier, exact: false };
}

export function plazosDisponibles(financiamientoRows, { enganchePct, nacionalidad }) {
  return resolveFinanciamientoEngancheTier(financiamientoRows, { enganchePct, nacionalidad }).rows;
}

/**
 * Resuelve el tier de enganche del catálogo aplicable a la venta.
 * 1) Coincidencia exacta con % enganche capturado.
 * 2) Tier más alto del catálogo que el cliente ya cumple (enganche >= tier).
 * 3) Tier mínimo del catálogo para la nacionalidad (p. ej. cotizar con 25% mientras captura 15%).
 */
export function resolveFinanciamientoEngancheTier(financiamientoRows, { enganchePct, nacionalidad }) {
  const eng = normalizeEnganchePct(enganchePct);
  const nat = String(nacionalidad || "").toLowerCase();
  const rows = (financiamientoRows || []).filter(
    (r) => String(r.nacionalidad).toLowerCase() === nat,
  );
  if (!rows.length) {
    return { tier: null, exact: false, rows: [] };
  }

  const tiers = [...new Set(rows.map((r) => normalizeEnganchePct(r.enganche_pct)))].sort((a, b) => a - b);

  if (tiers.includes(eng)) {
    return {
      tier: eng,
      exact: true,
      rows: rows
        .filter((r) => normalizeEnganchePct(r.enganche_pct) === eng)
        .sort((a, b) => Number(a.plazo_meses) - Number(b.plazo_meses)),
    };
  }

  const qualified = tiers.filter((t) => eng >= t);
  const tier = qualified.length ? Math.max(...qualified) : tiers[0];
  return {
    tier,
    exact: false,
    rows: rows
      .filter((r) => normalizeEnganchePct(r.enganche_pct) === tier)
      .sort((a, b) => Number(a.plazo_meses) - Number(b.plazo_meses)),
  };
}

/** Mensualidad = Ap × factor_mensual (Ap = monto a financiar, no venta bruta). */
export function calcularMensualidad(montoAFfinanciar, factorMensual) {
  return (Number(montoAFfinanciar) || 0) * (Number(factorMensual) || 0);
}

/** Ap = venta − enganche pactado (+ balance anterior); usa factor del catálogo. */
export function calcularMensualidadFinanciamiento({
  montoVenta,
  enganchePct,
  factorMensual,
  balanceAnterior = 0,
}) {
  const { balanceAFinanciar } = calcularTotalesWorksheet({
    montoVenta,
    enganchePct,
    costoAdmin: 0,
    balanceAnterior,
  });
  return calcularMensualidad(balanceAFinanciar, factorMensual);
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
    if (r.venta_max_usd != null && mv > Number(r.venta_max_usd)) return false;
    return true;
  });
}

/** Regalos visibles en worksheet: sin monto aún, filtra solo por HC; con monto, aplica restricciones USD. */
export function regalosParaWorksheet(regalos, { holidayCredits, montoVenta }) {
  const hc = Number(holidayCredits) || 0;
  const mv = Number(montoVenta) || 0;
  const list = regalos || [];
  if (mv <= 0) {
    return list.filter((g) => {
      const r = g.restricciones || {};
      if (r.venta_minima_hc != null && hc < Number(r.venta_minima_hc)) return false;
      return true;
    });
  }
  return regalosDisponibles(list, { holidayCredits: hc, montoVenta: mv });
}

function parseMoneyScalar(v) {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function montoVentaWorksheet(fields) {
  if (String(fields?.monto_venta ?? "").trim() !== "") {
    return parseMoneyScalar(fields.monto_venta);
  }
  if (String(fields?.valor ?? "").trim() !== "") {
    return parseMoneyScalar(fields.valor);
  }
  const raw = (fields?.valores || []).find((v) => String(v ?? "").trim() !== "");
  return raw != null ? parseMoneyScalar(raw) : 0;
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

/** Plazo máximo para cobrar Extra DP y su diferencial de comisión (Excel Comisiones). */
export const RH_EXTRA_DP_PLAZO_DIAS = 90;

/** Ventana post-activación para cancelación con descuento de comisión (~3 meses). Regla distinta a Extra DP. */
export const RH_VENTANA_CANCELACION_DIAS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateOnly(value) {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const s = String(value || "").slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/** Último día (inclusive) en que aplica el plazo Extra DP desde la fecha de venta. */
export function fechaLimiteExtraDp(fechaVenta, plazoDias = RH_EXTRA_DP_PLAZO_DIAS) {
  const base = parseDateOnly(fechaVenta);
  if (!base) return null;
  return new Date(base.getTime() + plazoDias * MS_PER_DAY);
}

export function extraDpFechaDentroPlazo(fechaProgramada, fechaVenta, plazoDias = RH_EXTRA_DP_PLAZO_DIAS) {
  const prog = parseDateOnly(fechaProgramada);
  const venta = parseDateOnly(fechaVenta);
  if (!prog || !venta) return false;
  const limite = fechaLimiteExtraDp(venta, plazoDias);
  return prog.getTime() <= limite.getTime() && prog.getTime() >= venta.getTime();
}

export function plazoExtraDpVencido(fechaVenta, ahora = new Date(), plazoDias = RH_EXTRA_DP_PLAZO_DIAS) {
  const limite = fechaLimiteExtraDp(fechaVenta, plazoDias);
  if (!limite) return false;
  const hoy = parseDateOnly(ahora);
  return hoy.getTime() > limite.getTime();
}

export function membresiaDebeActivarse(engancheAcumuladoPct) {
  return normalizeEnganchePct(engancheAcumuladoPct) >= RH_MEMBRESIA_ENGANCHE_PCT;
}

export function dentroVentanaCancelacion(activadaAt, ahora = new Date()) {
  if (!activadaAt) return false;
  const start = new Date(activadaAt);
  const end = new Date(start.getTime() + RH_VENTANA_CANCELACION_DIAS * MS_PER_DAY);
  return ahora < end;
}

/** Valida FTB = liner + closer en cada franja (%DP × rango HC). */
export function validarComisionesFtb(comisiones, tolerancia = 0.001) {
  const rows = comisiones || [];
  const errors = [];
  const ftbRows = rows.filter((r) => String(r.posicion).toLowerCase() === "ftb");
  for (const ftb of ftbRows) {
    const liner = rows.find(
      (r) =>
        String(r.posicion).toLowerCase() === "liner"
        && normalizeEnganchePct(r.down_payment_pct) === normalizeEnganchePct(ftb.down_payment_pct)
        && Number(r.hc_rango_min) === Number(ftb.hc_rango_min)
        && Number(r.hc_rango_max) === Number(ftb.hc_rango_max),
    );
    const closer = rows.find(
      (r) =>
        String(r.posicion).toLowerCase() === "closer"
        && normalizeEnganchePct(r.down_payment_pct) === normalizeEnganchePct(ftb.down_payment_pct)
        && Number(r.hc_rango_min) === Number(ftb.hc_rango_min)
        && Number(r.hc_rango_max) === Number(ftb.hc_rango_max),
    );
    if (!liner || !closer) continue;
    const sum = Number(liner.porcentaje_comision) + Number(closer.porcentaje_comision);
    const ftbPct = Number(ftb.porcentaje_comision);
    if (Math.abs(sum - ftbPct) > tolerancia) {
      errors.push({
        down_payment_pct: ftb.down_payment_pct,
        hc_rango_min: ftb.hc_rango_min,
        hc_rango_max: ftb.hc_rango_max,
        ftb: ftbPct,
        liner_closer: sum,
      });
    }
  }
  return errors;
}
