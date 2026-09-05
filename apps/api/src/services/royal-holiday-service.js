import { ServiceError } from "../lib/service-error.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import {
  calcularFechaPagoComision,
  toDateStr,
  lookupBottomLine,
  lookupCostoAdministrativo,
  lookupComision,
  resolveComisionTier,
  resolveFinanciamientoEngancheTier,
  calcularMensualidadFinanciamiento,
  calcularTotalesWorksheet,
  regalosParaWorksheet,
  diferenciaComisionPct,
  montoComision,
  membresiaDebeActivarse,
  dentroVentanaCancelacion,
  normalizeEnganchePct,
  extraDpFechaDentroPlazo,
  plazoExtraDpVencido,
  validarComisionesFtb,
  RH_EXTRA_DP_PLAZO_DIAS,
} from "@salesapp/shared/calculations/royal-holiday.js";

async function loadCatalogBundle(client, catalogoId) {
  const [
    { data: catalogo },
    { data: bottom_line },
    { data: financiamiento },
    { data: comisiones },
    { data: regalos },
    { data: costo_administrativo },
    { data: parametros },
  ] = await Promise.all([
    client.from("catalogo_configuracion").select("*").eq("id", catalogoId).single(),
    client.from("rh_bottom_line").select("*").eq("catalogo_configuracion_id", catalogoId).order("holiday_credits"),
    client.from("rh_financiamiento").select("*").eq("catalogo_configuracion_id", catalogoId),
    client.from("rh_comisiones").select("*").eq("catalogo_configuracion_id", catalogoId),
    client.from("rh_regalos").select("*").eq("catalogo_configuracion_id", catalogoId),
    client.from("rh_costo_administrativo").select("*").eq("catalogo_configuracion_id", catalogoId).order("enganche_pct_min"),
    client.from("rh_parametros_generales").select("*").eq("catalogo_configuracion_id", catalogoId).maybeSingle(),
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

export async function getCatalogoVigente(client, empresaId) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  if (!empresaId) throw new ServiceError("empresa_id requerido.", 400);
  const { data: cat, error } = await client
    .from("catalogo_configuracion")
    .select("*")
    .eq("empresa_id", empresaId)
    .is("vigente_hasta", null)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  if (!cat) throw new ServiceError("No hay catálogo vigente para esta empresa.", 404);
  return loadCatalogBundle(client, cat.id);
}

function assertComisionesFtb(comisiones) {
  const errors = validarComisionesFtb(comisiones);
  if (errors.length) {
    const e = errors[0];
    throw new ServiceError(
      `FTB debe ser liner+closer (${e.down_payment_pct}% HC ${e.hc_rango_min}-${e.hc_rango_max}: FTB=${e.ftb}, liner+closer=${e.liner_closer}).`,
      400,
    );
  }
}

function assertExtrasExtraDp(extras, fechaVenta, maxExtraDp) {
  const dpExtras = (extras || []).filter((e) => e.tipo !== "extra_cc");
  if (dpExtras.length > maxExtraDp) {
    throw new ServiceError(`Máximo ${maxExtraDp} Extra DP permitidos.`, 400);
  }
  const fechaVentaStr = toDateStr(fechaVenta);
  for (const ex of dpExtras) {
    const fecha = String(ex.fecha || "").slice(0, 10);
    if (!extraDpFechaDentroPlazo(fecha, fechaVentaStr)) {
      throw new ServiceError(
        `Extra DP debe programarse entre la fecha de venta y ${RH_EXTRA_DP_PLAZO_DIAS} días después (fecha ${fecha} inválida).`,
        400,
      );
    }
  }
}

export async function previewCalculo(client, empresaId, body) {
  const bundle = await getCatalogoVigente(client, empresaId);
  const hc = Number(body.holiday_credits) || 0;
  const monto = Number(body.monto_venta) || 0;
  const eng = normalizeEnganchePct(body.enganche_pct);
  const posicion = String(body.posicion || "liner").toLowerCase();
  const nacionalidad = String(body.nacionalidad || "mexicano").toLowerCase();
  const bl = lookupBottomLine(bundle.bottom_line, hc);
  const ca = lookupCostoAdministrativo(bundle.costo_administrativo, eng);
  const comTier = resolveComisionTier(bundle.comisiones, { downPaymentPct: eng, holidayCredits: hc, posicion });
  const com = comTier.row;
  const finTier = resolveFinanciamientoEngancheTier(bundle.financiamiento, { enganchePct: eng, nacionalidad });
  const plazos = finTier.rows;
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
    comision_enganche_tier: comTier.tier,
    comision_enganche_exacto: comTier.exact,
    plazos,
    financiamiento_enganche_tier: finTier.tier,
    financiamiento_enganche_exacto: finTier.exact,
    financiamiento_seleccionado: finRow,
    mensualidad: finRow
      ? calcularMensualidadFinanciamiento({
        montoVenta: monto,
        enganchePct: eng,
        factorMensual: finRow.factor_mensual,
        balanceAnterior: Number(body.balance_anterior) || 0,
      })
      : null,
    totales,
    regalos: regalosParaWorksheet(bundle.regalos, { holidayCredits: hc, montoVenta: monto }),
    parametros: bundle.parametros,
  };
}

export async function saveVenta(client, userId, body) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const empresaId = body.empresa_id;
  const workspaceId = body.workspace_id;
  if (!empresaId || !workspaceId) throw new ServiceError("empresa_id y workspace_id requeridos.", 400);

  const preview = await previewCalculo(client, empresaId, body);
  if (preview.comision?.pendiente && !body.allow_pending_commission) {
    throw new ServiceError(preview.comision.mensaje, 400);
  }

  const eng = normalizeEnganchePct(body.enganche_pct);
  const extras = Array.isArray(body.extras) ? body.extras : [];
  // Acumulado parte del enganche base; Extra DP suman solo al cumplirse (cron/processDue).
  const engAcum = eng;

  const fechaEvento = body.fecha_evento ? new Date(body.fecha_evento) : new Date();
  const fechaVentaStr = toDateStr(fechaEvento);
  const maxExtraDp = Number(preview.parametros?.max_extra_dp) || 6;
  assertExtrasExtraDp(extras, fechaVentaStr, maxExtraDp);

  const { data: venta, error } = await client
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
      fecha_venta: fechaVentaStr,
      payload: { preview_totales: preview.totales, raw: body },
      membresia_activada_at: membresiaDebeActivarse(engAcum) ? fechaEvento.toISOString() : null,
    })
    .select()
    .single();
  if (error) throw new ServiceError(error.message, 400);

  try {
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
      const { error: eErr } = await client.from("rh_extra_pagos").insert(extraRows);
      if (eErr) throw new ServiceError(eErr.message, 400);

      for (const ex of extraRows) {
        const { error: calErr } = await client.from("calendar_entries").insert({
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

    if (preview.comision && !preview.comision.pendiente) {
      const { error: mErr } = await client.from("rh_comision_movimientos").insert({
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
  } catch (err) {
    await client.from("rh_extra_pagos").delete().eq("rh_venta_id", venta.id);
    await client.from("rh_comision_movimientos").delete().eq("rh_venta_id", venta.id);
    await client.from("rh_ventas").delete().eq("id", venta.id);
    throw err;
  }

  await processExtraDpJobs({ ventaId: venta.id });

  const { data: full } = await client
    .from("rh_ventas")
    .select("*, rh_extra_pagos(*), rh_comision_movimientos(*)")
    .eq("id", venta.id)
    .single();
  return full;
}

export async function processForfeitExpiredExtraPagos({ ventaId = null, limit = 100 } = {}) {
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  let q = admin
    .from("rh_extra_pagos")
    .select("*, rh_ventas(*)")
    .eq("cumplido", false)
    .eq("forfeit", false)
    .eq("tipo", "extra_dp")
    .limit(limit);
  if (ventaId) q = q.eq("rh_venta_id", ventaId);
  const { data: pendientes, error } = await q;
  if (error) throw new ServiceError(error.message, 400);

  const results = [];
  const today = new Date();
  for (const extra of pendientes || []) {
    const venta = extra.rh_ventas;
    if (!venta || venta.comision_firme) continue;
    const fechaVenta = venta.fecha_venta || toDateStr(venta.created_at);
    if (!plazoExtraDpVencido(fechaVenta, today)) continue;

    await admin
      .from("rh_extra_pagos")
      .update({ forfeit: true, forfeit_at: new Date().toISOString() })
      .eq("id", extra.id);
    results.push({ extra_id: extra.id, venta_id: venta.id, action: "forfeit" });
  }
  return { forfeited: results.length, results };
}

export async function processDueExtraPagos({ ventaId = null, limit = 100 } = {}) {
  // EXCEPCIÓN service-role: cron / job programado sin sesión de usuario (CRON_SECRET en v1.js).
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  const today = toDateStr(new Date());
  let q = admin
    .from("rh_extra_pagos")
    .select("*, rh_ventas(*)")
    .eq("cumplido", false)
    .eq("forfeit", false)
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

    const fechaVenta = venta.fecha_venta || toDateStr(venta.created_at);
    if (plazoExtraDpVencido(fechaVenta)) {
      await admin
        .from("rh_extra_pagos")
        .update({ forfeit: true, forfeit_at: new Date().toISOString() })
        .eq("id", extra.id);
      results.push({ extra_id: extra.id, venta_id: venta.id, action: "forfeit" });
      continue;
    }

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
    results.push({ extra_id: extra.id, venta_id: venta.id, nuevo_enganche: nuevoEng, action: "cumplido" });
  }
  return { processed: results.length, results };
}

/** Forfeit por plazo vencido, luego Extra DP con fecha programada cumplida (dentro de 90 días). */
export async function processExtraDpJobs(opts = {}) {
  const forfeit = await processForfeitExpiredExtraPagos(opts);
  const due = await processDueExtraPagos(opts);
  return {
    forfeited: forfeit.forfeited,
    processed: due.processed,
    forfeit_results: forfeit.results,
    due_results: due.results,
  };
}

export async function handleCancelacionVenta(saleId) {
  // EXCEPCIÓN service-role: side-effect desde sales-service tras validar permiso de venta; no expone endpoint directo.
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

/** Publica nueva versión clonando el catálogo vigente (copy-on-write). Requiere cliente admin (requireEmpresaAdmin). */
export async function publishNuevaVersion(admin, empresaId, actorId, patch = {}) {
  if (!admin) throw new ServiceError("Cliente admin requerido.", 500);
  const vigente = await getCatalogoVigente(admin, empresaId);
  const now = new Date().toISOString();
  const prevCatalogoId = vigente.catalogo.id;
  await admin
    .from("catalogo_configuracion")
    .update({ vigente_hasta: now })
    .eq("id", prevCatalogoId);

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
  try {
    const mapRows = (rows, omit = ["id", "created_at", "updated_at"]) =>
      (rows || []).map((r) => {
        const o = { ...r, catalogo_configuracion_id: cid };
        for (const k of omit) delete o[k];
        for (const [k, v] of Object.entries(o)) {
          if (k === "catalogo_configuracion_id" || k === "programa" || k === "nacionalidad" || k === "posicion" || k === "nombre" || k === "notas") continue;
          if (k === "cargas_permitidas") {
            o[k] = Array.isArray(v) ? v : String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
            continue;
          }
          if (k === "restricciones" || k === "impuestos") continue;
          if (typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) && k !== "vigente_desde" && k !== "vigente_hasta") {
            o[k] = Number(v);
          }
        }
        return o;
      });

    const bl = mapRows(patch.bottom_line || vigente.bottom_line);
    const fin = mapRows(patch.financiamiento || vigente.financiamiento);
    const com = mapRows(patch.comisiones || vigente.comisiones);
    const reg = mapRows(patch.regalos || vigente.regalos);
    const ca = mapRows(patch.costo_administrativo || vigente.costo_administrativo);
    assertComisionesFtb(com);
    if (bl.length) await admin.from("rh_bottom_line").insert(bl);
    if (fin.length) await admin.from("rh_financiamiento").insert(fin);
    if (com.length) await admin.from("rh_comisiones").insert(com);
    if (reg.length) await admin.from("rh_regalos").insert(reg);
    if (ca.length) await admin.from("rh_costo_administrativo").insert(ca);

    const pg = { ...(patch.parametros || vigente.parametros || {}) };
    delete pg.id;
    pg.catalogo_configuracion_id = cid;
    await admin.from("rh_parametros_generales").insert(pg);
  } catch (err) {
    await admin.from("catalogo_configuracion").delete().eq("id", cid);
    await admin
      .from("catalogo_configuracion")
      .update({ vigente_hasta: null })
      .eq("id", prevCatalogoId);
    throw err instanceof ServiceError ? err : new ServiceError(
      err instanceof Error ? err.message : "Error al publicar catálogo.",
      400,
    );
  }

  return loadCatalogBundle(admin, cid);
}

export async function listComisionMovimientos(client, empresaId, { workspaceId, from, to, limit = 200 } = {}) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  let q = client
    .from("rh_comision_movimientos")
    .select("*, rh_ventas!inner(id, empresa_id, workspace_id, holiday_credits, monto_venta, posicion, enganche_pct)")
    .eq("rh_ventas.empresa_id", empresaId)
    .order("fecha_pago", { ascending: true })
    .limit(limit);
  if (workspaceId) q = q.eq("rh_ventas.workspace_id", workspaceId);
  if (from) q = q.gte("fecha_pago", from);
  if (to) q = q.lte("fecha_pago", to);
  const { data, error } = await q;
  if (error) throw new ServiceError(error.message, 400);
  return data || [];
}

export async function listDiasDescanso(client, empresaId, { workspaceId, from, to } = {}) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  let q = client.from("rh_dias_descanso").select("*").eq("empresa_id", empresaId).order("fecha");
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  if (from) q = q.gte("fecha", from);
  if (to) q = q.lte("fecha", to);
  const { data, error } = await q;
  if (error) throw new ServiceError(error.message, 400);
  return data || [];
}

export async function upsertDiaDescanso(client, userId, body) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const { empresa_id, workspace_id, usuario_id, fecha, tipo, notas } = body || {};
  if (!empresa_id || !workspace_id || !usuario_id || !fecha) {
    throw new ServiceError("empresa_id, workspace_id, usuario_id y fecha requeridos.", 400);
  }
  const { data, error } = await client
    .from("rh_dias_descanso")
    .upsert(
      {
        empresa_id,
        workspace_id,
        usuario_id,
        fecha,
        tipo: tipo || "descanso",
        notas: notas || null,
        created_by: userId,
      },
      { onConflict: "workspace_id,usuario_id,fecha" },
    )
    .select()
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function deleteDiaDescanso(client, empresaId, id) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const { data, error } = await client
    .from("rh_dias_descanso")
    .delete()
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .select("id")
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  if (!data) throw new ServiceError("No autorizado.", 403);
  return { ok: true };
}

export async function getOpsConfig(client, empresaId) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const { data, error } = await client.from("rh_ops_config").select("*").eq("empresa_id", empresaId).maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return data || { empresa_id: empresaId, config: {} };
}

export async function saveOpsConfig(client, userId, empresaId, config) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const { data, error } = await client
    .from("rh_ops_config")
    .upsert(
      { empresa_id: empresaId, config: config || {}, updated_at: new Date().toISOString(), updated_by: userId },
      { onConflict: "empresa_id" },
    )
    .select()
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

async function listByFecha(client, table, empresaId, workspaceId, fecha) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  let q = client.from(table).select("*").eq("empresa_id", empresaId).order("created_at", { ascending: false });
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  if (fecha) q = q.eq("fecha", fecha);
  const { data, error } = await q;
  if (error) throw new ServiceError(error.message, 400);
  return data || [];
}

function mapPremanifiestoRpcError(error) {
  const msg = String(error?.message || "");
  if (msg.includes("PM_CUPO_LLENO")) {
    throw new ServiceError("Cupo de la ola lleno.", 409);
  }
  if (error?.code === "42501" || msg.includes("No autorizado")) {
    throw new ServiceError("No autorizado.", 403);
  }
  throw new ServiceError(msg || "Error Premanifiesto.", 400);
}

/** @deprecated Use getPremanifiestoDia — mantiene compat mínima sin CSI en claro. */
export async function listPremanifiesto(client, empresaId, opts) {
  if (opts?.fecha && opts?.workspaceId) {
    return getPremanifiestoDia(client, empresaId, opts.workspaceId, opts.fecha, opts.userId);
  }
  return listByFecha(client, "rh_premanifiesto", empresaId, opts?.workspaceId, opts?.fecha);
}

export async function getPremanifiestoDia(client, empresaId, workspaceId, fecha, userId) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const { data, error } = await client.rpc("rh_premanifiesto_dia", {
    p_empresa_id: empresaId,
    p_workspace_id: workspaceId,
    p_fecha: fecha,
    p_user_id: userId,
  });
  if (error) mapPremanifiestoRpcError(error);
  return data;
}

export async function registrarPremanifiestoPareja(client, userId, body) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const { data, error } = await client.rpc("rh_premanifiesto_registrar_pareja", {
    p_empresa_id: body.empresa_id,
    p_workspace_id: body.workspace_id,
    p_fecha: body.fecha,
    p_ola_config_id: body.ola_config_id,
    p_origen: body.origen,
    p_prospect_nombre: body.prospect_nombre,
    p_user_id: userId,
    p_estado_procedencia: body.estado_procedencia ?? null,
    p_agencia: body.agencia ?? null,
    p_contrato: body.contrato ?? null,
    p_check_in: body.check_in ?? null,
    p_check_out: body.check_out ?? null,
    p_room_type: body.room_type ?? null,
    p_room_number: body.room_number ?? null,
    p_nights: body.nights ?? null,
    p_notas_csi: body.notas_csi ?? null,
    p_notes: body.notes ?? null,
    p_rate: body.rate ?? null,
    p_total: body.total ?? null,
    p_calif: body.calif ?? null,
    p_regalo_nombre: body.regalo_nombre ?? null,
    p_prospect_id: body.prospect_id ?? null,
  });
  if (error) mapPremanifiestoRpcError(error);
  return data;
}

export async function tomarCasoPremanifiesto(client, userId, empresaId, rowId, prospectId) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const { data, error } = await client.rpc("rh_premanifiesto_tomar_caso", {
    p_empresa_id: empresaId,
    p_row_id: rowId,
    p_prospect_id: prospectId ?? null,
    p_user_id: userId,
  });
  if (error) mapPremanifiestoRpcError(error);
  return data;
}

export async function actualizarPremanifiesto(client, userId, empresaId, rowId, patch) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const { data, error } = await client.rpc("rh_premanifiesto_actualizar", {
    p_empresa_id: empresaId,
    p_row_id: rowId,
    p_patch: patch || {},
    p_user_id: userId,
  });
  if (error) mapPremanifiestoRpcError(error);
  return data;
}

export async function getPremanifiestoOlaConfig(client, empresaId) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const { data, error } = await client
    .from("rh_premanifiesto_ola_config")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("orden", { ascending: true });
  if (error) throw new ServiceError(error.message, 400);
  return data || [];
}

export async function savePremanifiestoOlaConfig(client, userId, empresaId, olas) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const rows = (olas || []).map((o) => ({
    empresa_id: empresaId,
    orden: Number(o.orden),
    etiqueta: String(o.etiqueta || `OLA ${o.orden}`),
    hora: o.hora,
    cupo_max: Math.max(1, Number(o.cupo_max) || 1),
    activo: o.activo !== false,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }));
  const { data, error } = await client
    .from("rh_premanifiesto_ola_config")
    .upsert(rows, { onConflict: "empresa_id,orden" })
    .select()
    .order("orden", { ascending: true });
  if (error) throw new ServiceError(error.message, 400);
  return data || [];
}

/** @deprecated Use registrarPremanifiestoPareja / actualizarPremanifiesto */
export async function upsertPremanifiesto(client, userId, body) {
  if (body.id) {
    return actualizarPremanifiesto(client, userId, body.empresa_id, body.id, body);
  }
  return registrarPremanifiestoPareja(client, userId, {
    ...body,
    origen: body.origen || "marketing",
    ola_config_id: body.ola_config_id,
  });
}

export async function listLineaAsignacion(client, empresaId, opts) {
  return listByFecha(client, "rh_linea_asignacion", empresaId, opts?.workspaceId, opts?.fecha);
}

export async function upsertLineaAsignacion(client, userId, body) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const row = {
    empresa_id: body.empresa_id,
    workspace_id: body.workspace_id,
    fecha: body.fecha,
    rep_id: body.rep_id || null,
    closer_id: body.closer_id || null,
    turno: body.turno || null,
    notas: body.notas || null,
  };
  if (body.id) {
    const { data, error } = await client
      .from("rh_linea_asignacion")
      .update(row)
      .eq("id", body.id)
      .eq("empresa_id", body.empresa_id)
      .select()
      .maybeSingle();
    if (error) throw new ServiceError(error.message, 400);
    if (!data) throw new ServiceError("No autorizado.", 403);
    return data;
  }
  const { data, error } = await client.from("rh_linea_asignacion").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function listLineaRotacion(client, empresaId, opts) {
  return listByFecha(client, "rh_linea_rotacion", empresaId, opts?.workspaceId, opts?.fecha);
}

export async function upsertLineaRotacion(client, userId, body) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const row = {
    empresa_id: body.empresa_id,
    workspace_id: body.workspace_id,
    fecha: body.fecha,
    orden: Number(body.orden) || 0,
    usuario_id: body.usuario_id || null,
    rol: body.rol || null,
    notas: body.notas || null,
  };
  if (body.id) {
    const { data, error } = await client
      .from("rh_linea_rotacion")
      .update(row)
      .eq("id", body.id)
      .eq("empresa_id", body.empresa_id)
      .select()
      .maybeSingle();
    if (error) throw new ServiceError(error.message, 400);
    if (!data) throw new ServiceError("No autorizado.", 403);
    return data;
  }
  const { data, error } = await client.from("rh_linea_rotacion").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function listPropinas(client, empresaId, { workspaceId, from, to } = {}) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  let q = client.from("rh_propinas").select("*").eq("empresa_id", empresaId).order("fecha", { ascending: false });
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  if (from) q = q.gte("fecha", from);
  if (to) q = q.lte("fecha", to);
  const { data, error } = await q;
  if (error) throw new ServiceError(error.message, 400);
  return data || [];
}

export async function upsertPropina(client, userId, body) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const row = {
    empresa_id: body.empresa_id,
    workspace_id: body.workspace_id,
    beneficiario_id: body.beneficiario_id || null,
    beneficiario_nombre: body.beneficiario_nombre || null,
    monto: Number(body.monto) || 0,
    fecha: body.fecha || toDateStr(new Date()),
    notas: body.notas || null,
    created_by: userId,
  };
  if (body.id) {
    const { data, error } = await client
      .from("rh_propinas")
      .update(row)
      .eq("id", body.id)
      .eq("empresa_id", body.empresa_id)
      .select()
      .maybeSingle();
    if (error) throw new ServiceError(error.message, 400);
    if (!data) throw new ServiceError("No autorizado.", 403);
    return data;
  }
  const { data, error } = await client.from("rh_propinas").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function listOkr(client, empresaId, { workspaceId, periodo } = {}) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  let q = client.from("rh_okr").select("*").eq("empresa_id", empresaId);
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  if (periodo) q = q.eq("periodo", periodo);
  const { data, error } = await q;
  if (error) throw new ServiceError(error.message, 400);
  return data || [];
}

export async function upsertOkr(client, _userId, body) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const { data, error } = await client
    .from("rh_okr")
    .upsert(
      {
        empresa_id: body.empresa_id,
        workspace_id: body.workspace_id,
        periodo: body.periodo,
        clave: body.clave,
        meta: Number(body.meta) || 0,
        actual: Number(body.actual) || 0,
        unidad: body.unidad || "count",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,periodo,clave" },
    )
    .select()
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function resumenVentas(client, empresaId, { workspaceId, from, to } = {}) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  let q = client.from("rh_ventas").select("id, monto_venta, holiday_credits, posicion, enganche_pct, created_at, workspace_id").eq("empresa_id", empresaId);
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);
  const { data, error } = await q;
  if (error) throw new ServiceError(error.message, 400);
  const rows = data || [];
  const totalMonto = rows.reduce((s, r) => s + Number(r.monto_venta || 0), 0);
  const byPos = {};
  for (const r of rows) {
    const k = String(r.posicion || "na").toLowerCase();
    byPos[k] = (byPos[k] || 0) + 1;
  }
  return { count: rows.length, total_monto: totalMonto, by_posicion: byPos, rows };
}

const RH_MONEY_BOX_DEFAULT_PLANS = {
  wo1m: "60",
  wo1r: "12.99",
  wo2m: "48",
  wo2r: "8.90",
  wo3m: "12",
  wo3r: "0",
};

const RH_MONEY_BOX_DEFAULT_RESTRICTIONS = {
  minDownPct: "30",
  maxDownPct: "50",
  fc: "0",
  ff: "0",
  maxSale: "150,000.00",
  roundStep: "0.01",
};

function mergeRhMoneyBoxRow(data, empresaId) {
  return {
    empresa_id: empresaId,
    plans: { ...RH_MONEY_BOX_DEFAULT_PLANS, ...(data?.plans || {}) },
    restrictions: { ...RH_MONEY_BOX_DEFAULT_RESTRICTIONS, ...(data?.restrictions || {}) },
    updated_at: data?.updated_at || null,
    updated_by: data?.updated_by || null,
  };
}

export async function getRhMoneyBoxConfig(client, empresaId) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const { data, error } = await client
    .from("rh_money_box_config")
    .select("*")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return mergeRhMoneyBoxRow(data, empresaId);
}

export async function saveRhMoneyBoxConfig(client, userId, empresaId, patch = {}) {
  if (!client) throw new ServiceError("Cliente Supabase requerido.", 500);
  const current = await getRhMoneyBoxConfig(client, empresaId);
  const nextPlans = patch.plans != null
    ? { ...RH_MONEY_BOX_DEFAULT_PLANS, ...patch.plans }
    : current.plans;
  const nextRestrictions = patch.restrictions != null
    ? { ...RH_MONEY_BOX_DEFAULT_RESTRICTIONS, ...patch.restrictions }
    : current.restrictions;
  const { data, error } = await client
    .from("rh_money_box_config")
    .upsert(
      {
        empresa_id: empresaId,
        plans: nextPlans,
        restrictions: nextRestrictions,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      { onConflict: "empresa_id" },
    )
    .select()
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return mergeRhMoneyBoxRow(data, empresaId);
}
