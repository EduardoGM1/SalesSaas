/**
 * Autorización Royal Holiday — alineado con modulos-custom-service (workspace + flag + empresa).
 */
import { ServiceError } from "../lib/service-error.js";
import { adminClient } from "../lib/tenant-access.js";
import { getRequestWorkspaceId, requireWorkspaceFlag } from "../lib/workspace-scope.js";

/** Claves de flag RH (paridad con apps/web/src/lib/auth/tool-flags.js). */
export const RH_FLAGS = {
  worksheet: "worksheet.royal_holiday",
  bottomLines: "rh.tool.bottom_lines",
  comisiones: "rh.tool.comisiones",
  calendarioComisiones: "rh.tool.calendario_comisiones",
  creditos: "rh.tool.creditos",
  diasDescanso: "rh.tool.dias_descanso",
  ops: "rh.tool.ops",
  moneyBox: "worksheet.royal_holiday.money_box",
  premanifiesto: "rh.tool.premanifiesto",
  premanifiestoMarketing: "rh.tool.premanifiesto.marketing",
  premanifiestoOpc: "rh.tool.premanifiesto.opc",
  premanifiestoRep: "rh.tool.premanifiesto.rep",
  premanifiestoCsi: "rh.tool.premanifiesto.csi",
};

/** Lectura calendario/olas: gerente vía ops o cualquier flag del módulo. */
export const RH_PREMANIFIESTO_READ_FLAGS = [
  RH_FLAGS.ops,
  RH_FLAGS.premanifiesto,
  RH_FLAGS.premanifiestoMarketing,
  RH_FLAGS.premanifiestoOpc,
  RH_FLAGS.premanifiestoRep,
  RH_FLAGS.premanifiestoCsi,
];

/**
 * Lectura de ops-config para operar Premanifiesto.
 * No incluye rh.tool.ops genérico: en prod lo tienen liner/cerrador por paquete.
 */
export const RH_OPS_CONFIG_READ_FLAGS = [
  RH_FLAGS.premanifiesto,
  RH_FLAGS.premanifiestoMarketing,
  RH_FLAGS.premanifiestoOpc,
  RH_FLAGS.premanifiestoRep,
  RH_FLAGS.premanifiestoCsi,
];

/** Catálogo/preview compartidos por worksheet y calculadoras /tools/rh/* */
export const RH_CATALOG_FLAGS = [
  RH_FLAGS.worksheet,
  RH_FLAGS.bottomLines,
  RH_FLAGS.comisiones,
  RH_FLAGS.calendarioComisiones,
  RH_FLAGS.creditos,
];

const DENY = "No autorizado.";

/**
 * Valida membresía empresa (rh_can_access_empresa) y opcionalmente workspace.
 * Mensaje genérico para no facilitar enumeración de empresas.
 */
export async function assertRhEmpresaAccess(supabase, userId, empresaId, workspaceId) {
  if (!empresaId) throw new ServiceError("Empresa requerida.", 400);

  const { data: canAccess, error } = await supabase.rpc("rh_can_access_empresa", {
    p_empresa_id: empresaId,
  });
  if (error) throw new ServiceError(DENY, 403);
  if (canAccess !== true) throw new ServiceError(DENY, 403);

  if (!workspaceId) return;

  const { data: inWs, error: wsErr } = await supabase.rpc("user_in_workspace", {
    p_usuario_id: userId,
    p_workspace_id: workspaceId,
  });
  if (wsErr || inWs !== true) throw new ServiceError(DENY, 403);

  const { data: ws, error: wsReadErr } = await supabase
    .from("workspaces")
    .select("empresa_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (wsReadErr || !ws?.empresa_id || ws.empresa_id !== empresaId) {
    throw new ServiceError(DENY, 403);
  }
}

/** Equivalente a assertModuleEnabledInWorkspace para flags RH. */
export async function assertRhModuleEnabled(supabase, userId, flagClave, workspaceId) {
  const resolved = workspaceId || await getRequestWorkspaceId(supabase, userId);
  return requireWorkspaceFlag(supabase, userId, flagClave, resolved);
}

/** Al menos uno de los flags debe estar habilitado (p. ej. catálogo usado por varias tools). */
export async function assertRhAnyModuleEnabled(supabase, userId, flags, workspaceId) {
  if (!flags?.length) throw new ServiceError(DENY, 403);
  let denied = null;
  for (const flag of flags) {
    try {
      return await assertRhModuleEnabled(supabase, userId, flag, workspaceId);
    } catch (err) {
      if (err instanceof ServiceError && err.status === 403) denied = err;
      else throw err;
    }
  }
  throw denied || new ServiceError(DENY, 403);
}

/**
 * Guard combinado para rutas: flag de módulo + acceso empresa (+ workspace si se indica).
 * @returns {Promise<string|null>} workspaceId resuelto cuando aplica flag
 */
export async function guardRhRequest(supabase, userId, empresaId, { flag, flags, workspaceId } = {}) {
  let resolvedWs = workspaceId ?? null;
  if (flags?.length) {
    resolvedWs = await assertRhAnyModuleEnabled(supabase, userId, flags, workspaceId ?? undefined);
  } else if (flag) {
    resolvedWs = await assertRhModuleEnabled(supabase, userId, flag, workspaceId ?? undefined);
  }
  if (!resolvedWs) {
    throw new ServiceError(DENY, 403);
  }
  await assertRhEmpresaAccess(supabase, userId, empresaId, resolvedWs);
  return resolvedWs;
}

/** Rechaza si body.empresa_id difiere del path (anti-spoof). */
export function assertEmpresaIdMatch(bodyEmpresaId, pathEmpresaId) {
  if (bodyEmpresaId && bodyEmpresaId !== pathEmpresaId) {
    throw new ServiceError(DENY, 403);
  }
}

async function isSuperAdmin(admin, userId) {
  const { data } = await admin
    .from("profiles")
    .select("is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_super_admin === true;
}

async function isEmpresaAdmin(admin, userId, empresaId) {
  const { data } = await admin.rpc("user_is_empresa_admin", {
    p_usuario_id: userId,
    p_empresa_id: empresaId,
  });
  return data === true;
}

async function isSalaGerenteOfEmpresa(admin, userId, empresaId) {
  const { data, error } = await admin
    .from("workspace_miembros")
    .select("rol_en_workspace, roles(slug), workspaces!inner(empresa_id, tipo, estado)")
    .eq("usuario_id", userId)
    .eq("workspaces.empresa_id", empresaId)
    .eq("workspaces.tipo", "sala_de_venta");
  if (error) throw new ServiceError(DENY, 403);
  return (data || []).some(
    (row) =>
      row.workspaces?.estado !== "archivado"
      && (row.rol_en_workspace === "gerente" || row.roles?.slug === "gerente"),
  );
}

/**
 * Escritura ops-config: solo Admin de empresa (o super admin) o Gerente de sala de esa empresa.
 * No basta con rh.tool.ops (liner/cerrador lo tienen en prod).
 */
export async function assertOpsConfigWriteAccess(supabase, userId, empresaId) {
  await assertRhEmpresaAccess(supabase, userId, empresaId);
  const admin = adminClient();
  if (await isSuperAdmin(admin, userId)) return;
  if (await isEmpresaAdmin(admin, userId, empresaId)) return;
  if (await isSalaGerenteOfEmpresa(admin, userId, empresaId)) return;
  throw new ServiceError(DENY, 403);
}

/**
 * Lectura ops-config: quien puede escribir, o puestos con flags Premanifiesto
 * (marketing/opc/rep/csi) necesarios para operar el módulo.
 */
export async function assertOpsConfigReadAccess(supabase, userId, empresaId, workspaceId) {
  try {
    await assertOpsConfigWriteAccess(supabase, userId, empresaId);
    return;
  } catch (err) {
    if (!(err instanceof ServiceError && err.status === 403)) throw err;
  }
  await guardRhRequest(supabase, userId, empresaId, {
    flags: RH_OPS_CONFIG_READ_FLAGS,
    workspaceId,
  });
}
