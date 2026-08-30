/**
 * HTTP Royal Holiday. Autorización de módulo/empresa aquí (guardRhRequest);
 * las fórmulas de comisión y Extra DP siguen en royal-holiday-service.
 */
import * as royalHolidayService from "../services/royal-holiday-service.js";
import {
  assertEmpresaIdMatch,
  guardRhRequest,
  RH_CATALOG_FLAGS,
  RH_FLAGS,
  RH_PREMANIFIESTO_READ_FLAGS,
} from "../services/rh-access.js";

function workspaceQuery(query) {
  return query?.workspaceId ? String(query.workspaceId) : undefined;
}

export async function obtenerCatalogo(auth, req) {
  const empresaId = req.params.empresaId;
  await guardRhRequest(auth.supabase, auth.userId, empresaId, { flags: RH_CATALOG_FLAGS });
  return royalHolidayService.getCatalogoVigente(auth.supabase, empresaId);
}

export async function previsualizarCalculo(auth, req, body) {
  const empresaId = req.params.empresaId;
  await guardRhRequest(auth.supabase, auth.userId, empresaId, { flags: RH_CATALOG_FLAGS });
  return royalHolidayService.previewCalculo(auth.supabase, empresaId, body);
}

export async function guardarVentaRh(auth, req, body) {
  const empresaId = req.params.empresaId;
  assertEmpresaIdMatch(body.empresa_id, empresaId);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flag: RH_FLAGS.worksheet,
    workspaceId: body.workspace_id,
  });
  return royalHolidayService.saveVenta(auth.supabase, auth.userId, { ...body, empresa_id: empresaId });
}

export async function listarMovimientosComision(auth, req) {
  const { from, to } = req.query || {};
  const empresaId = req.params.empresaId;
  const workspaceId = workspaceQuery(req.query);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flags: [RH_FLAGS.calendarioComisiones, RH_FLAGS.comisiones],
    workspaceId,
  });
  return royalHolidayService.listComisionMovimientos(auth.supabase, empresaId, { workspaceId, from, to });
}

export async function listarDiasDescanso(auth, req) {
  const { from, to } = req.query || {};
  const empresaId = req.params.empresaId;
  const workspaceId = workspaceQuery(req.query);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flags: [RH_FLAGS.diasDescanso, RH_FLAGS.ops],
    workspaceId,
  });
  return royalHolidayService.listDiasDescanso(auth.supabase, empresaId, { workspaceId, from, to });
}

export async function guardarDiaDescanso(auth, req, body) {
  const empresaId = req.params.empresaId;
  assertEmpresaIdMatch(body.empresa_id, empresaId);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flag: RH_FLAGS.diasDescanso,
    workspaceId: body.workspace_id,
  });
  return royalHolidayService.upsertDiaDescanso(auth.supabase, auth.userId, { ...body, empresa_id: empresaId });
}

export async function eliminarDiaDescanso(auth, req) {
  const empresaId = req.params.empresaId;
  await guardRhRequest(auth.supabase, auth.userId, empresaId, { flag: RH_FLAGS.diasDescanso });
  return royalHolidayService.deleteDiaDescanso(auth.supabase, empresaId, req.params.id);
}

export async function obtenerOpsConfig(auth, req) {
  const empresaId = req.params.empresaId;
  await guardRhRequest(auth.supabase, auth.userId, empresaId, { flag: RH_FLAGS.ops });
  return royalHolidayService.getOpsConfig(auth.supabase, empresaId);
}

export async function guardarOpsConfig(auth, req, body) {
  const empresaId = req.params.empresaId;
  await guardRhRequest(auth.supabase, auth.userId, empresaId, { flag: RH_FLAGS.ops });
  return royalHolidayService.saveOpsConfig(auth.supabase, auth.userId, empresaId, body.config || body);
}

export async function obtenerMoneyBoxConfig(auth, req) {
  const empresaId = req.params.empresaId;
  await guardRhRequest(auth.supabase, auth.userId, empresaId, { flag: RH_FLAGS.moneyBox });
  return royalHolidayService.getRhMoneyBoxConfig(auth.supabase, empresaId);
}

export async function guardarMoneyBoxConfig(auth, req, body) {
  const empresaId = req.params.empresaId;
  await guardRhRequest(auth.supabase, auth.userId, empresaId, { flag: RH_FLAGS.moneyBox });
  assertEmpresaIdMatch(body.empresa_id, empresaId);
  return royalHolidayService.saveRhMoneyBoxConfig(auth.supabase, auth.userId, empresaId, {
    restrictions: body.restrictions,
  });
}

export async function listarPremanifiesto(auth, req) {
  const empresaId = req.params.empresaId;
  const workspaceId = workspaceQuery(req.query);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flags: RH_PREMANIFIESTO_READ_FLAGS,
    workspaceId,
  });
  if (req.query.fecha && workspaceId) {
    return royalHolidayService.getPremanifiestoDia(
      auth.supabase,
      empresaId,
      workspaceId,
      req.query.fecha,
      auth.userId,
    );
  }
  return royalHolidayService.listPremanifiesto(auth.supabase, empresaId, {
    workspaceId,
    fecha: req.query.fecha,
    userId: auth.userId,
  });
}

export async function obtenerPremanifiestoDia(auth, req) {
  const empresaId = req.params.empresaId;
  const workspaceId = workspaceQuery(req.query);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flags: RH_PREMANIFIESTO_READ_FLAGS,
    workspaceId,
  });
  return royalHolidayService.getPremanifiestoDia(
    auth.supabase,
    empresaId,
    workspaceId,
    req.query.fecha,
    auth.userId,
  );
}

export async function listarCuposPremanifiesto(auth, req) {
  const empresaId = req.params.empresaId;
  const workspaceId = workspaceQuery(req.query);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flags: RH_PREMANIFIESTO_READ_FLAGS,
    workspaceId,
  });
  const dia = await royalHolidayService.getPremanifiestoDia(
    auth.supabase,
    empresaId,
    workspaceId,
    req.query.fecha,
    auth.userId,
  );
  const olas = dia?.olas || [];
  return olas.map((o) => ({
    ola_config_id: o.ola_config_id,
    orden: o.orden,
    etiqueta: o.etiqueta,
    hora: o.hora,
    cupo_max: o.cupo_max,
    ocupado: o.ocupado,
    disponible: o.disponible,
  }));
}

export async function registrarPremanifiesto(auth, req, body) {
  const empresaId = req.params.empresaId;
  assertEmpresaIdMatch(body.empresa_id, empresaId);
  const origen = body.origen || "marketing";
  const flag = origen === "opc" ? RH_FLAGS.premanifiestoOpc : RH_FLAGS.premanifiestoMarketing;
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flag,
    workspaceId: body.workspace_id,
  });
  return royalHolidayService.registrarPremanifiestoPareja(auth.supabase, auth.userId, {
    ...body,
    empresa_id: empresaId,
    origen,
  });
}

export async function tomarCasoPremanifiesto(auth, req, body) {
  const empresaId = req.params.empresaId;
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flag: RH_FLAGS.premanifiestoRep,
    workspaceId: body.workspace_id,
  });
  return royalHolidayService.tomarCasoPremanifiesto(
    auth.supabase,
    auth.userId,
    empresaId,
    req.params.rowId,
    body.prospect_id,
  );
}

export async function actualizarPremanifiesto(auth, req, body) {
  const empresaId = req.params.empresaId;
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flags: [
      RH_FLAGS.premanifiestoMarketing,
      RH_FLAGS.premanifiestoOpc,
      RH_FLAGS.premanifiestoRep,
    ],
    workspaceId: body.workspace_id,
  });
  return royalHolidayService.actualizarPremanifiesto(
    auth.supabase,
    auth.userId,
    empresaId,
    req.params.rowId,
    body,
  );
}

export async function upsertPremanifiesto(auth, req, body) {
  const empresaId = req.params.empresaId;
  assertEmpresaIdMatch(body.empresa_id, empresaId);
  if (body.id) {
    await guardRhRequest(auth.supabase, auth.userId, empresaId, {
      flags: [
        RH_FLAGS.premanifiestoMarketing,
        RH_FLAGS.premanifiestoOpc,
        RH_FLAGS.premanifiestoRep,
      ],
      workspaceId: body.workspace_id,
    });
    return royalHolidayService.actualizarPremanifiesto(
      auth.supabase,
      auth.userId,
      empresaId,
      body.id,
      body,
    );
  }
  const origen = body.origen || "marketing";
  const flag = origen === "opc" ? RH_FLAGS.premanifiestoOpc : RH_FLAGS.premanifiestoMarketing;
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flag,
    workspaceId: body.workspace_id,
  });
  return royalHolidayService.registrarPremanifiestoPareja(auth.supabase, auth.userId, {
    ...body,
    empresa_id: empresaId,
    origen,
  });
}

export async function listarAsignacionLinea(auth, req) {
  const empresaId = req.params.empresaId;
  const workspaceId = workspaceQuery(req.query);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, { flag: RH_FLAGS.ops, workspaceId });
  return royalHolidayService.listLineaAsignacion(auth.supabase, empresaId, {
    workspaceId,
    fecha: req.query.fecha,
  });
}

export async function guardarAsignacionLinea(auth, req, body) {
  const empresaId = req.params.empresaId;
  assertEmpresaIdMatch(body.empresa_id, empresaId);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flag: RH_FLAGS.ops,
    workspaceId: body.workspace_id,
  });
  return royalHolidayService.upsertLineaAsignacion(auth.supabase, auth.userId, { ...body, empresa_id: empresaId });
}

export async function listarRotacionLinea(auth, req) {
  const empresaId = req.params.empresaId;
  const workspaceId = workspaceQuery(req.query);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, { flag: RH_FLAGS.ops, workspaceId });
  return royalHolidayService.listLineaRotacion(auth.supabase, empresaId, {
    workspaceId,
    fecha: req.query.fecha,
  });
}

export async function guardarRotacionLinea(auth, req, body) {
  const empresaId = req.params.empresaId;
  assertEmpresaIdMatch(body.empresa_id, empresaId);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flag: RH_FLAGS.ops,
    workspaceId: body.workspace_id,
  });
  return royalHolidayService.upsertLineaRotacion(auth.supabase, auth.userId, { ...body, empresa_id: empresaId });
}

export async function listarPropinas(auth, req) {
  const empresaId = req.params.empresaId;
  const workspaceId = workspaceQuery(req.query);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, { flag: RH_FLAGS.ops, workspaceId });
  return royalHolidayService.listPropinas(auth.supabase, empresaId, {
    workspaceId,
    from: req.query.from,
    to: req.query.to,
  });
}

export async function guardarPropina(auth, req, body) {
  const empresaId = req.params.empresaId;
  assertEmpresaIdMatch(body.empresa_id, empresaId);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flag: RH_FLAGS.ops,
    workspaceId: body.workspace_id,
  });
  return royalHolidayService.upsertPropina(auth.supabase, auth.userId, { ...body, empresa_id: empresaId });
}

export async function listarOkr(auth, req) {
  const empresaId = req.params.empresaId;
  const workspaceId = workspaceQuery(req.query);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, { flag: RH_FLAGS.ops, workspaceId });
  return royalHolidayService.listOkr(auth.supabase, empresaId, {
    workspaceId,
    periodo: req.query.periodo,
  });
}

export async function guardarOkr(auth, req, body) {
  const empresaId = req.params.empresaId;
  assertEmpresaIdMatch(body.empresa_id, empresaId);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, {
    flag: RH_FLAGS.ops,
    workspaceId: body.workspace_id,
  });
  return royalHolidayService.upsertOkr(auth.supabase, auth.userId, { ...body, empresa_id: empresaId });
}

export async function resumenVentasRh(auth, req) {
  const empresaId = req.params.empresaId;
  const workspaceId = workspaceQuery(req.query);
  await guardRhRequest(auth.supabase, auth.userId, empresaId, { flag: RH_FLAGS.ops, workspaceId });
  return royalHolidayService.resumenVentas(auth.supabase, empresaId, {
    workspaceId,
    from: req.query.from,
    to: req.query.to,
  });
}

export async function procesarExtraDpCron() {
  return royalHolidayService.processExtraDpJobs({ limit: 200 });
}
