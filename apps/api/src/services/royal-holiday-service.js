import { ServiceError } from "../lib/service-error.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import {
  calcularFechaPagoComision,
  toDateStr,
  lookupBottomLine,
  lookupCostoAdministrativo,
  lookupComision,
  plazosDisponibles,
  calcularMensualidad,
  calcularTotalesWorksheet,
  regalosDisponibles,
  diferenciaComisionPct,
  montoComision,
  membresiaDebeActivarse,
  dentroVentanaCancelacion,
  normalizeEnganchePct,
} from "@salesapp/shared/calculations/royal-holiday.js";

async function loadCatalogBundle(admin, catalogoId) {
  const [
    { data: catalogo },
    { data: bottom_line },
    { data: financiamiento },
    { data: comisiones },
    { data: regalos },
    { data: costo_administrativo },
    { data: parametros },
  ] = await Promise.all([
    admin.from("catalogo_configuracion").select("*").eq("id", catalogoId).single(),
    admin.from("rh_bottom_line").select("*").eq("catalogo_configuracion_id", catalogoId).order("holiday_credits"),
    admin.from("rh_financiamiento").select("*").eq("catalogo_configuracion_id", catalogoId),
    admin.from("rh_comisiones").select("*").eq("catalogo_configuracion_id", catalogoId),
    admin.from("rh_regalos").select("*").eq("catalogo_configuracion_id", catalogoId),
    admin.from("rh_costo_administrativo").select("*").eq("catalogo_configuracion_id", catalogoId).order("enganche_pct_min"),
    admin.from("rh_parametros_generales").select("*").eq("catalogo_configuracion_id", catalogoId).maybeSingle(),
  ]);
  return {
    catalogo,
    bottom_line: bottom_line || [],
    financiamiento: financiamiento || [],
    comisiones: comisiones || [],
    regalos: regalos || [],
    costo_administrativo: costo_administrativo || [],
    parametros: parametros || null,
  };
}

export async function getCatalogoVigente(empresaId) {
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  if (!empresaId) throw new ServiceError("empresa_id requerido.", 400);
  const { data: cat, error } = await admin
    .from("catalogo_configuracion")
    .select("*")
    .eq("empresa_id", empresaId)
    .is("vigente_hasta", null)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  if (!cat) throw new ServiceError("No hay catálogo vigente para esta empresa.", 404);
  return loadCatalogBundle(admin, cat.id);
}

export async function previewCalculo(empresaId, body) {
  const bundle = await getCatalogoVigente(empresaId);
  const hc = Number(body.holiday_credits) || 0;
  const monto = Number(body.monto_venta) || 0;
  const eng = normalizeEnganchePct(body.enganche_pct);
  const posicion = String(body.posicion || "liner").toLowerCase();
  const nacionalidad = String(body.nacionalidad || "mexicano").toLowerCase();
  const bl = lookupBottomLine(bundle.bottom_line, hc);
  const ca = lookupCostoAdministrativo(bundle.costo_administrativo, eng);
  const com = lookupComision(bundle.comisiones, { downPaymentPct: eng, holidayCredits: hc, posicion });
  const plazos = plazosDisponibles(bundle.financiamiento, { enganchePct: eng, nacionalidad });
  const plazo = Number(body.plazo_meses);
  const finRow = plazos.find((p) => Number(p.plazo_meses) === plazo) || null;
  const costoAdmin = body.costo_administrativo_usd != null
    ? Number(body.costo_administrativo_usd)
    : Number(ca?.monto_usd) || 0;
  const totales = calcularTotalesWorksheet({
    montoVenta: monto,
    enganchePct: eng,
    costoAdmin,
    balanceAnterior: Number(body.balance_anterior) || 0,
  });
  const board = bl ? Number(bl.precio_minimo_con_iva) : null;
  return {
    catalogo_configuracion_id: bundle.catalogo.id,
    bottom_line: bl,
    board_online: board,
    precio_ok: board == null || monto <= 0 ? null : monto >= board,
    costo_administrativo: ca,
    costo_administrativo_usd: costoAdmin,
    comision: com
      ? {
          porcentaje: Number(com.porcentaje_comision),
          monto: montoComision(monto, com.porcentaje_comision),
          fecha_pago: toDateStr(calcularFechaPagoComision(body.fecha_evento || new Date())),
        }
      : { pendiente: true, mensaje: "Comisión pendiente de configurar para esta posición/franja." },
    plazos,
    financiamiento_seleccionado: finRow,
    mensualidad: finRow ? calcularMensualidad(monto, finRow.factor_mensual) : null,
    totales,
    regalos: regalosDisponibles(bundle.regalos, { holidayCredits: hc, montoVenta: monto }),
    parametros: bundle.parametros,
  };
}

export async function saveVenta(userId, body) {
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  const empresaId = body.empresa_id;
  const workspaceId = body.workspace_id;
  if (!empresaId || !workspaceId) throw new ServiceError("empresa_id y workspace_id requeridos.", 400);

  const preview = await previewCalculo(empresaId, body);
  if (preview.comision?.pendiente && !body.allow_pending_commission) {
    throw new ServiceError(preview.comision.mensaje, 400);
  }

  const eng = normalizeEnganchePct(body.enganche_pct);
  const extras = Array.isArray(body.extras) ? body.extras : [];
  // Acumulado parte del enganche base; Extra DP suman solo al cumplirse (cron/processDue).
  const engAcum = eng;

  const fechaEvento = body.fecha_evento ? new Date(body.fecha_evento) : new Date();
  const { data: venta, error } = await admin
    .from("rh_ventas")
    .insert({
      empresa_id: empresaId,
      workspace_id: workspaceId,
      usuario_id: userId,
      prospect_id: body.prospect_id || null,
      sale_id: body.sale_id || null,
      catalogo_configuracion_id: preview.catalogo_configuracion_id,
      holiday_credits: Number(body.holiday_credits) || 0,
      monto_venta: Number(body.monto_venta) || 0,
      enganche_pct: eng,
      enganche_acumulado_pct: engAcum,
      nacionalidad: String(body.nacionalidad || "mexicano").toLowerCase(),
      posicion: String(body.posicion || "liner").toLowerCase(),
      costo_administrativo_usd: preview.costo_administrativo_usd,
      plazo_meses: body.plazo_meses || null,
      factor_mensual: preview.financiamiento_seleccionado?.factor_mensual || null,
      mensualidad: preview.mensualidad,
      board_online: preview.board_online,
      regalos: body.regalos || [],
      payload: { preview_totales: preview.totales, raw: body },
      membresia_activada_at: membresiaDebeActivarse(engAcum) ? fechaEvento.toISOString() : null,
    })
    .select()
    .single();
  if (error) throw new ServiceError(error.message, 400);

  // Extra DP/CC
  const extraRows = [];
  for (const ex of extras) {
    extraRows.push({
      rh_venta_id: venta.id,
      tipo: ex.tipo === "extra_cc" ? "extra_cc" : "extra_dp",
      porcentaje: normalizeEnganchePct(ex.porcentaje),
      fecha_programada: String(ex.fecha).slice(0, 10),
      metodo_pago: ex.metodo_pago || null,
      cumplido: false,
    });
  }
  if (extraRows.length) {
    const { error: eErr } = await admin.from("rh_extra_pagos").insert(extraRows);
    if (eErr) throw new ServiceError(eErr.message, 400);

    // Recordatorios en agenda del vendedor
    for (const ex of extraRows) {
      const { error: calErr } = await admin.from("calendar_entries").insert({
        user_id: userId,
        workspace_id: workspaceId,
        type: "follow",
        entry_date: ex.fecha_programada,
        note: `RH ${ex.tipo === "extra_cc" ? "Extra CC" : "Extra DP"} ${ex.porcentaje}% — venta ${venta.id}`,
        prospect_id: body.prospect_id || null,
      });
      if (calErr) console.warn("[rh] calendar reminder:", calErr.message);
    }
  }

  // Comisión inicial
  if (preview.comision && !preview.comision.pendiente) {
    const { error: mErr } = await admin.from("rh_comision_movimientos").insert({
      rh_venta_id: venta.id,
      tipo: "inicial",
      porcentaje: preview.comision.porcentaje,
      monto_base: Number(body.monto_venta) || 0,
      monto_comision: preview.comision.monto,
      fecha_evento: toDateStr(fechaEvento),
      fecha_pago: preview.comision.fecha_pago,
      estado: "programada",
      detalle: { posicion: body.posicion, enganche_pct: eng },
    });
    if (mErr) throw new ServiceError(mErr.message, 400);
  }

  // Procesar extras ya vencidos de inmediato
  await processDueExtraPagos({ ventaId: venta.id });

  const { data: full } = await admin
    .from("rh_ventas")
    .select("*, rh_extra_pagos(*), rh_comision_movimientos(*)")
    .eq("id", venta.id)
    .single();
  return full;
}

export async function processDueExtraPagos({ ventaId = null, limit = 100 } = {}) {
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  const today = toDateStr(new Date());
  let q = admin
    .from("rh_extra_pagos")
    .select("*, rh_ventas(*)")
    .eq("cumplido", false)
    .eq("tipo", "extra_dp")
    .lte("fecha_programada", today)
    .limit(limit);
  if (ventaId) q = q.eq("rh_venta_id", ventaId);
  const { data: pendientes, error } = await q;
  if (error) throw new ServiceError(error.message, 400);

  const results = [];
  for (const extra of pendientes || []) {
    const venta = extra.rh_ventas;
    if (!venta || venta.comision_firme) continue;

    const bundle = await loadCatalogBundle(admin, venta.catalogo_configuracion_id);
    const nuevoEng = normalizeEnganchePct(venta.enganche_acumulado_pct) + normalizeEnganchePct(extra.porcentaje);

    const { data: movs } = await admin
      .from("rh_comision_movimientos")
      .select("*")
      .eq("rh_venta_id", venta.id)
      .in("tipo", ["inicial", "diferencia_extra_dp"]);
    const pctYa = (movs || []).reduce((s, m) => s + Number(m.porcentaje), 0);

    const com = lookupComision(bundle.comisiones, {
      downPaymentPct: nuevoEng,
      holidayCredits: venta.holiday_credits,
      posicion: venta.posicion,
    });

    await admin
      .from("rh_extra_pagos")
      .update({ cumplido: true, cumplido_at: new Date().toISOString() })
      .eq("id", extra.id);

    const patch = { enganche_acumulado_pct: nuevoEng, updated_at: new Date().toISOString() };
    if (!venta.membresia_activada_at && membresiaDebeActivarse(nuevoEng)) {
      patch.membresia_activada_at = new Date(`${extra.fecha_programada}T12:00:00.000Z`).toISOString();
    }
    await admin.from("rh_ventas").update(patch).eq("id", venta.id);

    if (com) {
      const diffPct = diferenciaComisionPct(pctYa, com.porcentaje_comision);
      if (diffPct > 0) {
        const fechaEv = new Date(`${extra.fecha_programada}T12:00:00.000Z`);
        await admin.from("rh_comision_movimientos").insert({
          rh_venta_id: venta.id,
          tipo: "diferencia_extra_dp",
          porcentaje: diffPct,
          monto_base: Number(venta.monto_venta),
          monto_comision: montoComision(venta.monto_venta, diffPct),
          fecha_evento: extra.fecha_programada,
          fecha_pago: toDateStr(calcularFechaPagoComision(fechaEv)),
          extra_dp_id: extra.id,
          estado: "programada",
          detalle: {
            enganche_antes: venta.enganche_acumulado_pct,
            enganche_despues: nuevoEng,
            pct_total: Number(com.porcentaje_comision),
          },
        });
      }
    }
    results.push({ extra_id: extra.id, venta_id: venta.id, nuevo_enganche: nuevoEng });
  }
  return { processed: results.length, results };
}

export async function handleCancelacionVenta(saleId) {
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  const { data: venta } = await admin.from("rh_ventas").select("*").eq("sale_id", saleId).maybeSingle();
  if (!venta) return { skipped: true };
  if (venta.comision_firme) return { firme: true };

  if (venta.membresia_activada_at && dentroVentanaCancelacion(venta.membresia_activada_at)) {
    const { data: movs } = await admin
      .from("rh_comision_movimientos")
      .select("*")
      .eq("rh_venta_id", venta.id)
      .in("tipo", ["inicial", "diferencia_extra_dp"]);
    const totalPct = (movs || []).reduce((s, m) => s + Number(m.porcentaje), 0);
    const totalMonto = (movs || []).reduce((s, m) => s + Number(m.monto_comision), 0);
    if (totalPct > 0) {
      await admin.from("rh_comision_movimientos").insert({
        rh_venta_id: venta.id,
        tipo: "descuento_cancelacion",
        porcentaje: -totalPct,
        monto_base: Number(venta.monto_venta),
        monto_comision: -totalMonto,
        fecha_evento: toDateStr(new Date()),
        fecha_pago: toDateStr(calcularFechaPagoComision(new Date())),
        estado: "descontada",
        detalle: { motivo: "cancelacion_dentro_ventana_3_meses" },
      });
    }
    return { descontado: true };
  }
  if (venta.membresia_activada_at && !dentroVentanaCancelacion(venta.membresia_activada_at)) {
    await admin.from("rh_ventas").update({ comision_firme: true, membresia_firme_at: new Date().toISOString() }).eq("id", venta.id);
    return { firme: true };
  }
  return { sin_membresia: true };
}

/** Publica nueva versión clonando el catálogo vigente (copy-on-write). */
export async function publishNuevaVersion(empresaId, actorId, patch = {}) {
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  const vigente = await getCatalogoVigente(empresaId);
  const now = new Date().toISOString();
  await admin
    .from("catalogo_configuracion")
    .update({ vigente_hasta: now })
    .eq("id", vigente.catalogo.id);

  const { data: nuevo, error } = await admin
    .from("catalogo_configuracion")
    .insert({
      empresa_id: empresaId,
      version: Number(vigente.catalogo.version) + 1,
      vigente_desde: now,
      creado_por: actorId || null,
      notas: patch.notas || `Versión ${Number(vigente.catalogo.version) + 1}`,
    })
    .select()
    .single();
  if (error) throw new ServiceError(error.message, 400);

  const cid = nuevo.id;
  const mapRows = (rows, omit = ["id"]) =>
    (rows || []).map((r) => {
      const o = { ...r, catalogo_configuracion_id: cid };
      for (const k of omit) delete o[k];
      return o;
    });

  const bl = mapRows(patch.bottom_line || vigente.bottom_line);
  const fin = mapRows(patch.financiamiento || vigente.financiamiento);
  const com = mapRows(patch.comisiones || vigente.comisiones);
  const reg = mapRows(patch.regalos || vigente.regalos);
  const ca = mapRows(patch.costo_administrativo || vigente.costo_administrativo);
  if (bl.length) await admin.from("rh_bottom_line").insert(bl);
  if (fin.length) await admin.from("rh_financiamiento").insert(fin);
  if (com.length) await admin.from("rh_comisiones").insert(com);
  if (reg.length) await admin.from("rh_regalos").insert(reg);
  if (ca.length) await admin.from("rh_costo_administrativo").insert(ca);

  const pg = { ...(patch.parametros || vigente.parametros || {}) };
  delete pg.id;
  pg.catalogo_configuracion_id = cid;
  await admin.from("rh_parametros_generales").insert(pg);

  return loadCatalogBundle(admin, cid);
}
