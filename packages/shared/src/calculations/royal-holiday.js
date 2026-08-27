/**
 * Motor puro Worksheet Royal Holiday — lookups y reglas de comisión.
 * Reutilizable por API y web.
 */

import { claveRegaloExcel, normalizarNombreRegalo, RH_REGALOS_EXCEL } from "./royal-holiday-regalos-catalog.js";

const ORDEN_REGALOS_EXCEL = RH_REGALOS_EXCEL.map((g) => claveRegaloExcel(g.nombre, g.restricciones));

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

/** Mayor tier cuyo precio mínimo c/IVA no supera el monto de venta. */
export function lookupBottomLineByMonto(rows, monto) {
  const m = Number(monto) || 0;
  if (m <= 0) return null;
  const sorted = [...(rows || [])].sort(
    (a, b) => Number(a.precio_minimo_con_iva) - Number(b.precio_minimo_con_iva),
  );
  let best = null;
  for (const row of sorted) {
    if (Number(row.precio_minimo_con_iva) <= m) best = row;
  }
  return best;
}

/** Monto capturado − precio mínimo c/IVA de un tier BL (positivo = por encima). */
export function deltaMontoVsBottomLine(monto, blRow) {
  const m = Number(monto) || 0;
  const p = Number(blRow?.precio_minimo_con_iva);
  if (!blRow || !Number.isFinite(p) || m <= 0) return null;
  return m - p;
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

/** Token de carga dual — solo Flyback. No contiene "venta" ni "closing" para no romper if/else existentes. */
export const CARGA_REGALO_AMBOS = "ambos";

function roundMoneyRegalo(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function cargaEsVenta(carga) {
  const s = String(carga || "").toLowerCase();
  return s === "venta" || (s.includes("venta") && !cargaEsAmbos(carga));
}

function cargaEsClosing(carga) {
  const s = String(carga || "").toLowerCase();
  return s === "closing_cost" || (s.includes("closing") && !cargaEsAmbos(carga));
}

function cargaEsSinCosto(carga) {
  const s = String(carga || "").toLowerCase().replace(/\s+/g, "_");
  return s === "sin_costo" || s.startsWith("sin_costo");
}

export function cargaEsAmbos(carga) {
  const s = String(carga || "").toLowerCase().replace(/\s+/g, "");
  return s === CARGA_REGALO_AMBOS || s === "venta+closing" || s === "venta+closing_cost";
}

export function cargaIncluyeVenta(carga) {
  return cargaEsAmbos(carga) || cargaEsVenta(carga);
}

export function cargaIncluyeClosing(carga) {
  return cargaEsAmbos(carga) || cargaEsClosing(carga);
}

export function esRegaloFlyback(regalo) {
  const nombre = regalo?.nombre;
  const restricciones = regalo?.restricciones;
  if (claveRegaloExcel(nombre, restricciones) === "flyback") return true;
  const compact = normalizarNombreRegalo(nombre).replace(/[\s\-_./]/g, "");
  if (compact.includes("flyback")) return true;
  const r = restriccionesRegalo(regalo);
  if (r.costo_es_cuota_anual || compact.includes("bono")) return false;
  const cargas = Array.isArray(regalo?.cargas_permitidas) ? regalo.cargas_permitidas : [];
  const bothCargas = cargas.some(cargaEsVenta) && cargas.some(cargaEsClosing);
  const huellaExcel = Number(r.cantidad_default) === 2 && r.venta_minima_usd != null;
  return bothCargas && huellaExcel;
}

/** Doble casilla venta+closing: excepción exclusiva de Flyback. */
export function permiteCargaDualRegalo(regalo) {
  return esRegaloFlyback(regalo);
}

/**
 * Resuelve el siguiente estado de carga al marcar/desmarcar una columna.
 * Flyback (dual): las dos casillas pueden quedar activas → token "ambos" + split.
 * Resto de regalos: last-write-wins (excluyente).
 */
export function resolverToggleCargaRegalo({
  dual,
  current,
  column,
  checked,
  tokenVenta = "venta",
  tokenClosing = "closing_cost",
  lineTotal = 0,
} = {}) {
  if (dual) {
    let ventaOn = cargaIncluyeVenta(current);
    let closingOn = cargaIncluyeClosing(current);
    if (column === "venta") ventaOn = !!checked;
    else closingOn = !!checked;
    if (ventaOn && closingOn) {
      return { carga: CARGA_REGALO_AMBOS, split: defaultSplitMontos(lineTotal) };
    }
    if (ventaOn) return { carga: tokenVenta || "venta", split: null };
    if (closingOn) return { carga: tokenClosing || "closing_cost", split: null };
    return { carga: "", split: null };
  }
  if (!checked) return { carga: "", split: undefined };
  const carga = column === "venta" ? (tokenVenta || "venta") : (tokenClosing || "closing_cost");
  return { carga, split: undefined };
}

export function defaultSplitMontos(lineTotal) {
  const total = roundMoneyRegalo(lineTotal);
  const venta = roundMoneyRegalo(total / 2);
  return { venta, closing: roundMoneyRegalo(total - venta) };
}

export function splitMontosValido(split, lineTotal) {
  const v = roundMoneyRegalo(split?.venta);
  const c = roundMoneyRegalo(split?.closing);
  const total = roundMoneyRegalo(lineTotal);
  if (!Number.isFinite(v) || !Number.isFinite(c) || v < 0 || c < 0) return false;
  return Math.abs(v + c - total) < 0.015;
}

export function escalarSplitMontos(split, fromTotal, toTotal) {
  const next = roundMoneyRegalo(toTotal);
  if (!splitMontosValido(split, fromTotal) || roundMoneyRegalo(fromTotal) <= 0) {
    return defaultSplitMontos(next);
  }
  const venta = roundMoneyRegalo((Number(split.venta) / Number(fromTotal)) * next);
  return { venta, closing: roundMoneyRegalo(next - venta) };
}

export function restriccionesRegalo(regalo) {
  return regalo?.restricciones && typeof regalo.restricciones === "object" ? regalo.restricciones : {};
}

export function cantidadDefaultRegalo(regalo) {
  const r = restriccionesRegalo(regalo);
  if (r.cantidad_default != null && Number.isFinite(Number(r.cantidad_default))) {
    return Number(r.cantidad_default);
  }
  if (r.cantidad_es_monto) return 0;
  return 1;
}

export function cantidadRegalo(regalo, regalosCantidad) {
  const raw = regalosCantidad?.[regalo.id];
  if (raw === "" || raw == null) return cantidadDefaultRegalo(regalo);
  const n = Number(raw);
  return Number.isFinite(n) ? n : cantidadDefaultRegalo(regalo);
}

/** Cantidad editable solo si el Excel lo permite (monto capturado o unidades variables). */
export function cantidadEsEditable(regalo) {
  const r = restriccionesRegalo(regalo);
  if (r.cantidad_editable === false) return false;
  if (r.cantidad_es_monto) return true;
  if (r.costo_es_cuota_anual) return false;
  const cargas = Array.isArray(regalo?.cargas_permitidas) ? regalo.cargas_permitidas : [];
  const permiteVenta = cargas.some(cargaEsVenta);
  const permiteClosing = cargas.some(cargaEsClosing);
  const permiteSinCosto = cargas.some(cargaEsSinCosto) && !permiteVenta && !permiteClosing;
  if (permiteSinCosto) return false;
  if (String(r.moneda_costo || "").toUpperCase() === "MXN") return false;
  return true;
}

/** Orden de Tabla 4 del Excel Saletse. */
export function ordenarRegalosExcel(regalos) {
  return [...(regalos || [])].sort((a, b) => {
    const ia = ORDEN_REGALOS_EXCEL.indexOf(claveRegaloExcel(a.nombre, a.restricciones));
    const ib = ORDEN_REGALOS_EXCEL.indexOf(claveRegaloExcel(b.nombre, b.restricciones));
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
}

/** Costo unitario efectivo (cuota anual, catálogo o nulo si el usuario captura el monto). */
export function costoUnitarioRegalo(regalo, { cuotaAnual } = {}) {
  const r = restriccionesRegalo(regalo);
  if (r.cantidad_es_monto) return null;
  if (r.costo_es_cuota_anual) {
    const n = Number(cuotaAnual);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(regalo?.costo);
  return Number.isFinite(n) ? n : null;
}

/** Total de línea en la moneda del regalo (MXN o USD). */
export function totalLineaRegalo(regalo, { qty, cuotaAnual } = {}) {
  const r = restriccionesRegalo(regalo);
  if (r.cantidad_es_monto) {
    const n = Number(qty);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  const unit = costoUnitarioRegalo(regalo, { cuotaAnual });
  if (unit == null) return 0;
  return unit * Math.max(0, Number(qty) || 0);
}

export function totalLineaRegaloUsd(regalo, opts, mxnToUsd) {
  const total = totalLineaRegalo(regalo, opts);
  if (restriccionesRegalo(regalo).moneda_costo === "MXN") {
    const converted = typeof mxnToUsd === "function" ? mxnToUsd(total) : null;
    return Number.isFinite(converted) ? converted : 0;
  }
  return total;
}

/**
 * Evalúa un regalo del catálogo RH para la UI del worksheet (sin filtrar la lista).
 * estado: elegible | pendiente_monto | no_elegible
 */
export function evaluarRegaloWorksheet(regalo, {
  holidayCredits,
  montoVenta,
  cuotaAnual,
  qty,
  grupoMontosOtros = {},
} = {}) {
  const r = restriccionesRegalo(regalo);
  const hc = Number(holidayCredits) || 0;
  const mv = Number(montoVenta) || 0;
  const cargas = Array.isArray(regalo?.cargas_permitidas) ? regalo.cargas_permitidas : [];
  const permiteVenta = cargas.some(cargaEsVenta);
  const permiteClosing = cargas.some(cargaEsClosing);
  const permiteSinCosto = cargas.some(cargaEsSinCosto) && !permiteVenta && !permiteClosing;
  const costoUnitario = costoUnitarioRegalo(regalo, { cuotaAnual });
  const monedaCosto = r.moneda_costo || "USD";
  const qtyEff = qty == null ? cantidadDefaultRegalo(regalo) : qty;

  const base = { permiteVenta, permiteClosing, permiteSinCosto, costoUnitario, monedaCosto };

  if (r.venta_minima_hc != null && hc < Number(r.venta_minima_hc)) {
    return { ...base, estado: "no_elegible", motivo: `Requiere mínimo ${Number(r.venta_minima_hc).toLocaleString("es-MX")} HC` };
  }

  const requiereMonto = r.venta_minima_usd != null;
  if (mv <= 0 && requiereMonto) {
    return { ...base, estado: "pendiente_monto", motivo: "Captura monto de venta en Datos Financiamiento" };
  }

  if (mv > 0 && r.venta_minima_usd != null && mv < Number(r.venta_minima_usd)) {
    return {
      ...base,
      estado: "no_elegible",
      motivo: `Venta mínima ${Number(r.venta_minima_usd).toLocaleString("es-MX")} USD`,
    };
  }

  let aviso = null;
  if (r.ppd_min != null && r.ppd_max != null) {
    aviso = `Tarifa p/p entre ${r.ppd_min} y ${r.ppd_max} USD`;
  }

  if (r.grupo_tope && r.grupo_tope_usd != null) {
    const others = Number(grupoMontosOtros[r.grupo_tope] || 0);
    const mine = totalLineaRegalo(regalo, { qty: qtyEff, cuotaAnual });
    const cap = Number(r.grupo_tope_usd);
    if (mine + others > cap + 0.009) {
      aviso = `All inclusive + vuelo no puede exceder ${cap.toLocaleString("es-MX")} USD`;
    }
  }

  const bonoHc = r.hc_bonus_factor != null && hc > 0
    ? Math.min(hc * Number(r.hc_bonus_factor), Number(r.hc_bonus_max) || hc * Number(r.hc_bonus_factor))
    : null;

  return { ...base, estado: "elegible", motivo: null, aviso, bonoHc };
}

export function totalesRegalosAplicados(regalos, form, { holidayCredits, montoVenta, cuotaAnual, mxnToUsd } = {}) {
  let venta = 0;
  let closing = 0;
  const grupoMontosOtros = {};
  const list = regalos || [];
  for (const g of list) {
    const carga = form?.regalosElegidos?.[g.id];
    if (!carga || cargaEsSinCosto(carga)) continue;
    const r = restriccionesRegalo(g);
    if (!r.grupo_tope) continue;
    const qty = cantidadRegalo(g, form?.regalosCantidad);
    const line = totalLineaRegaloUsd(g, { qty, cuotaAnual }, mxnToUsd);
    grupoMontosOtros[r.grupo_tope] = (grupoMontosOtros[r.grupo_tope] || 0) + line;
  }

  for (const g of list) {
    const carga = form?.regalosElegidos?.[g.id];
    if (!carga || cargaEsSinCosto(carga)) continue;
    const qty = cantidadRegalo(g, form?.regalosCantidad);
    const r = restriccionesRegalo(g);
    const others = { ...grupoMontosOtros };
    if (r.grupo_tope) {
      others[r.grupo_tope] = Math.max(0, (others[r.grupo_tope] || 0) - totalLineaRegaloUsd(g, { qty, cuotaAnual }, mxnToUsd));
    }
    const ev = evaluarRegaloWorksheet(g, {
      holidayCredits,
      montoVenta,
      cuotaAnual,
      qty,
      grupoMontosOtros: others,
    });
    if (ev.estado !== "elegible") continue;
    const line = totalLineaRegaloUsd(g, { qty, cuotaAnual }, mxnToUsd);
    if (cargaEsAmbos(carga) && permiteCargaDualRegalo(g)) {
      const split = form?.regalosSplit?.[g.id];
      const effective = splitMontosValido(split, line)
        ? split
        : (split == null ? defaultSplitMontos(line) : null);
      if (!effective) continue;
      venta += roundMoneyRegalo(effective.venta);
      closing += roundMoneyRegalo(effective.closing);
      continue;
    }
    if (cargaEsVenta(carga)) venta += line;
    else if (cargaEsClosing(carga)) closing += line;
  }
  return { venta, closing, total: venta + closing };
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
