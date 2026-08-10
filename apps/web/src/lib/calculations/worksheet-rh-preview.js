import {
  calcularFechaPagoComision,
  calcularMensualidad,
  calcularTotalesWorksheet,
  lookupBottomLine,
  lookupCostoAdministrativo,
  montoComision,
  montoVentaWorksheet,
  regalosParaWorksheet,
  resolveComisionTier,
  resolveFinanciamientoEngancheTier,
  toDateStr,
} from "@/lib/calculations/royal-holiday.js";

/** Une preview API + catálogo vigente para que el worksheet refleje siempre la configuración RH. */
export function buildRhWorksheetState(catalogo, preview, form) {
  const hc = Number(form.holiday_credits) || 0;
  const monto = montoVentaWorksheet(form);
  const eng = form.enganche_pct;
  const nacionalidad = form.nacionalidad;

  const bl = preview?.bottom_line ?? lookupBottomLine(catalogo?.bottom_line, hc);
  const boardOnline = preview?.board_online ?? (bl ? Number(bl.precio_minimo_con_iva) : null);
  const precioOk = monto > 0 && boardOnline != null ? monto >= boardOnline : preview?.precio_ok ?? null;

  const ca = preview?.costo_administrativo
    ?? lookupCostoAdministrativo(catalogo?.costo_administrativo, eng);
  const costoAdminUsd = form.costo_administrativo_usd !== "" && form.costo_administrativo_usd != null
    ? Number(form.costo_administrativo_usd)
    : Number(preview?.costo_administrativo_usd ?? ca?.monto_usd ?? 0);

  const totales = preview?.totales ?? calcularTotalesWorksheet({
    montoVenta: monto,
    enganchePct: eng,
    costoAdmin: costoAdminUsd,
    balanceAnterior: Number(form.monto_pendiente) || 0,
  });

  const finTier = preview?.plazos?.length
    ? {
        rows: preview.plazos,
        tier: preview.financiamiento_enganche_tier,
        exact: preview.financiamiento_enganche_exacto !== false,
      }
    : resolveFinanciamientoEngancheTier(catalogo?.financiamiento, { enganchePct: eng, nacionalidad });

  const plazoSel = Number(form.plazo_meses);
  const finRow = finTier.rows.find((p) => Number(p.plazo_meses) === plazoSel) || preview?.financiamiento_seleccionado || null;
  const mensualidad = preview?.mensualidad
    ?? (finRow ? calcularMensualidad(totales.balanceAFinanciar, finRow.factor_mensual) : null);

  const comTier = preview?.comision && !preview.comision.pendiente
    ? {
        row: preview.comision,
        tier: preview.comision_enganche_tier,
        exact: preview.comision_enganche_exacto !== false,
      }
    : (() => {
        const resolved = resolveComisionTier(catalogo?.comisiones, {
          downPaymentPct: eng,
          holidayCredits: hc,
          posicion: form.posicion,
        });
        if (!resolved.row) {
          return {
            row: preview?.comision ?? { pendiente: true, mensaje: "Comisión pendiente de configurar para esta posición/franja." },
            tier: null,
            exact: true,
          };
        }
        return {
          row: {
            porcentaje: Number(resolved.row.porcentaje_comision),
            monto: montoComision(monto, resolved.row.porcentaje_comision),
            fecha_pago: toDateStr(calcularFechaPagoComision(new Date())),
            pendiente: false,
          },
          tier: resolved.tier,
          exact: resolved.exact,
        };
      })();

  const regalos = preview?.regalos?.length
    ? preview.regalos
    : regalosParaWorksheet(catalogo?.regalos, { holidayCredits: hc, montoVenta: monto });

  return {
    bottom_line: bl,
    board_online: boardOnline,
    precio_ok: precioOk,
    costo_administrativo: ca,
    costo_administrativo_usd: costoAdminUsd,
    totales,
    plazos: finTier.rows,
    financiamiento_enganche_tier: finTier.tier,
    financiamiento_enganche_exacto: finTier.exact,
    financiamiento_seleccionado: finRow,
    mensualidad,
    comision: comTier.row,
    comision_enganche_tier: comTier.tier,
    comision_enganche_exacto: comTier.exact,
    regalos,
    regalos_filtrados_por_monto: monto > 0,
    parametros: preview?.parametros ?? catalogo?.parametros ?? null,
  };
}
