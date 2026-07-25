import { ServiceError } from "../lib/service-error.js";

export const RESOURCE_AUDIT_ACTIONS = {
  COMPARTIR: "compartir",
  CAMBIAR_PERMISO: "cambiar_permiso",
  AGREGAR_A_ESPACIO: "agregar_a_espacio",
  REVOCAR_ACCESO: "revocar_acceso",
  DUPLICAR: "duplicar",
  TRANSFERIR_PROPIEDAD: "transferir_propiedad",
  EDITAR_RECURSO: "editar_recurso",
};

/**
 * Inserta auditoría de recurso (append-only). No tumba la acción principal.
 */
export async function writeResourceAudit(supabase, {
  actorId,
  accion,
  entidadAfectada = "prospect",
  entidadId = null,
  detalle = {},
}) {
  if (!actorId || !accion) return null;
  try {
    const { data, error } = await supabase.rpc("insert_resource_audit", {
      p_actor_id: actorId,
      p_accion: accion,
      p_entidad_afectada: entidadAfectada || "desconocido",
      p_entidad_id: entidadId || null,
      p_detalle: detalle && typeof detalle === "object" ? detalle : {},
    });
    if (error) {
      console.warn("[resource-audit] insert falló:", error.message, { accion, actorId });
      return null;
    }
    return data;
  } catch (err) {
    console.warn("[resource-audit] excepción:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function listResourceAudit(supabase, userId, { entidadId, limit = 50 } = {}) {
  if (!entidadId) throw new ServiceError("Expediente inválido.");

  const { data: owned } = await supabase
    .from("prospects")
    .select("id")
    .eq("id", entidadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!owned) {
    const { data: share } = await supabase
      .from("prospect_shares")
      .select("id")
      .eq("prospect_id", entidadId)
      .eq("shared_with_id", userId)
      .maybeSingle();
    if (!share) throw new ServiceError("No autorizado.", 403);
  }

  let q = supabase
    .from("historial_auditoria")
    .select("id, actor_id, ambito, accion, entidad_afectada, entidad_id, detalle, created_at")
    .eq("ambito", "recurso")
    .eq("entidad_id", entidadId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(limit) || 50, 200));
  const { data, error } = await q;
  if (error) {
    if (String(error.message || "").includes("does not exist") || error.code === "PGRST205") {
      return [];
    }
    throw new ServiceError(error.message, 500);
  }
  return data ?? [];
}

export const RESOURCE_AUDIT_LABELS = {
  [RESOURCE_AUDIT_ACTIONS.COMPARTIR]: "Compartir",
  [RESOURCE_AUDIT_ACTIONS.CAMBIAR_PERMISO]: "Cambiar permiso",
  [RESOURCE_AUDIT_ACTIONS.AGREGAR_A_ESPACIO]: "Agregar a espacio",
  [RESOURCE_AUDIT_ACTIONS.REVOCAR_ACCESO]: "Revocar acceso",
  [RESOURCE_AUDIT_ACTIONS.DUPLICAR]: "Duplicar",
  [RESOURCE_AUDIT_ACTIONS.TRANSFERIR_PROPIEDAD]: "Transferir propiedad",
  [RESOURCE_AUDIT_ACTIONS.EDITAR_RECURSO]: "Editar recurso",
};
