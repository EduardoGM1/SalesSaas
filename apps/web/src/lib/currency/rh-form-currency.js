import { montoVentaWorksheet } from "@/lib/calculations/royal-holiday.js";
import { parseMoney } from "@/lib/format/money";
import {
  buildAmountRecord,
  convertCaptureMoneyFields,
  convertir,
  formatCaptureMoneyValue,
  resolveOperationalAmount,
} from "@/lib/currency/moneda-service";

/** Campos escalares del formulario RH que siguen la moneda de captura activa. */
export const RH_WORKSHEET_MONEY_FIELDS = [
  "monto_venta",
  "valor",
  "enganche_hoy",
  "gasto_adm_hoy",
  "tarjeta_inmex",
  "tarjeta_rci",
];

function convertScalarList(values, from, to, ctx, language) {
  return (values || []).map((raw) => {
    const n = parseMoney(raw);
    if (!Number.isFinite(n) || String(raw ?? "").trim() === "") return raw;
    return formatCaptureMoneyValue(convertir(n, from, to, ctx), language);
  });
}

function convertPagosMontos(pagos, from, to, ctx, language) {
  return (pagos || []).map((p) => {
    const n = parseMoney(p.monto);
    if (!Number.isFinite(n) || String(p.monto ?? "").trim() === "") return p;
    return {
      ...p,
      monto: formatCaptureMoneyValue(convertir(n, from, to, ctx), language),
    };
  });
}

function metaForValores(valores, captureCurrency, ctx) {
  const meta = {};
  (valores || []).forEach((v, i) => {
    if (String(v ?? "").trim() === "") return;
    meta[`valores_${i}`] = buildAmountRecord(v, captureCurrency, ctx);
  });
  return meta;
}

/** Convierte el formulario RH al cambiar USD ↔ MXN (incluye arreglos de pagos y valores). */
export function switchRhFormCaptureCurrency(form, from, to, ctx, language) {
  const { fields, meta: scalarMeta } = convertCaptureMoneyFields(
    form,
    RH_WORKSHEET_MONEY_FIELDS,
    from,
    to,
    ctx,
    language,
  );
  const valores = convertScalarList(form.valores, from, to, ctx, language);
  const enganche_pagos = convertPagosMontos(form.enganche_pagos, from, to, ctx, language);
  const gasto_pagos = convertPagosMontos(form.gasto_pagos, from, to, ctx, language);
  return {
    form: { ...fields, valores, enganche_pagos, gasto_pagos },
    meta: { ...scalarMeta, ...metaForValores(valores, to, ctx) },
  };
}

function fieldOperational(raw, metaKey, captureCurrency, currencyMeta, ctx) {
  return resolveOperationalAmount(raw, currencyMeta?.[metaKey], captureCurrency, ctx);
}

/** Monto de venta en USD para preview, catálogo y guardado API. */
export function rhMontoVentaOperational(form, captureCurrency, currencyMeta, ctx) {
  if (String(form.monto_venta ?? "").trim() !== "") {
    return fieldOperational(form.monto_venta, "monto_venta", captureCurrency, currencyMeta, ctx);
  }
  if (String(form.valor ?? "").trim() !== "") {
    return fieldOperational(form.valor, "valor", captureCurrency, currencyMeta, ctx);
  }
  const idx = (form.valores || []).findIndex((v) => String(v ?? "").trim() !== "");
  if (idx >= 0) {
    return fieldOperational(form.valores[idx], `valores_${idx}`, captureCurrency, currencyMeta, ctx);
  }
  return 0;
}

/** Formulario con montos monetarios normalizados a USD (motor RH / catálogo). */
export function rhFormToOperational(form, captureCurrency, currencyMeta, ctx) {
  const montoUsd = rhMontoVentaOperational(form, captureCurrency, currencyMeta, ctx);
  const out = { ...form, monto_venta: montoUsd > 0 ? String(montoUsd) : form.monto_venta };

  for (const key of RH_WORKSHEET_MONEY_FIELDS) {
    if (key === "monto_venta" || key === "valor") continue;
    if (String(form[key] ?? "").trim() === "") continue;
    out[key] = String(fieldOperational(form[key], key, captureCurrency, currencyMeta, ctx));
  }

  if (Array.isArray(form.valores)) {
    out.valores = form.valores.map((v, i) => {
      if (String(v ?? "").trim() === "") return v;
      return String(fieldOperational(v, `valores_${i}`, captureCurrency, currencyMeta, ctx));
    });
  }

  out.enganche_pagos = (form.enganche_pagos || []).map((p, i) => ({
    ...p,
    monto: String(fieldOperational(p.monto, `enganche_pago_${i}`, captureCurrency, currencyMeta, ctx)),
  }));

  out.gasto_pagos = (form.gasto_pagos || []).map((p, i) => ({
    ...p,
    monto: String(fieldOperational(p.monto, `gasto_pago_${i}`, captureCurrency, currencyMeta, ctx)),
  }));

  return out;
}

/** Monto visible en captura (pestaña activa) para cálculos locales de % y saldos. */
export function rhMontoVentaCapture(form) {
  return montoVentaWorksheet(form);
}

/** Recalcula snapshots USD al cambiar TC manual; conserva montos visibles en captura. */
export function refreshRhCurrencyMeta(form, prevMeta, captureCurrency, ctx) {
  const meta = { ...(prevMeta || {}) };
  for (const key of RH_WORKSHEET_MONEY_FIELDS) {
    const raw = form[key];
    if (String(raw ?? "").trim() === "") continue;
    meta[key] = buildAmountRecord(raw, captureCurrency, ctx);
  }
  (form.valores || []).forEach((v, i) => {
    if (String(v ?? "").trim() === "") return;
    meta[`valores_${i}`] = buildAmountRecord(v, captureCurrency, ctx);
  });
  (form.enganche_pagos || []).forEach((p, i) => {
    if (String(p.monto ?? "").trim() === "") return;
    meta[`enganche_pago_${i}`] = buildAmountRecord(p.monto, captureCurrency, ctx);
  });
  (form.gasto_pagos || []).forEach((p, i) => {
    if (String(p.monto ?? "").trim() === "") return;
    meta[`gasto_pago_${i}`] = buildAmountRecord(p.monto, captureCurrency, ctx);
  });
  return meta;
}
