import { ServiceError } from "../lib/service-error.js";
import { ADMIN_AUDIT_ACTIONS } from "@salesapp/shared/auth/permission-catalog.js";
import { hasPermission, isSuperAdmin } from "@salesapp/shared/auth/permissions.js";
import { toCsv } from "../lib/admin/csv.js";

export { ADMIN_AUDIT_ACTIONS };

/**
 * Inserta un log append-only. No debe tumbar la acción principal si falla el log —
 * pero sí lo registramos en consola. Preferir llamar justo tras el éxito de la acción.
 */
export async function writeAdminLog(supabase, {
  actorId,
  accion,
  entidadAfectada,
  entidadId = null,
  detalle = {},
}) {
  if (!actorId || !accion) return null;
  try {
    const { data, error } = await supabase.rpc("insert_admin_log", {
      p_usuario_id: actorId,
      p_accion: accion,
      p_entidad_afectada: entidadAfectada || "desconocido",
      p_entidad_id: entidadId || null,
      p_detalle: detalle && typeof detalle === "object" ? detalle : {},
    });
    if (error) {
      console.warn("[admin-audit] insert falló:", error.message, { accion, actorId });
      return null;
    }
    return data;
  } catch (err) {
    console.warn("[admin-audit] excepción:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function listAdminLogs(supabase, adminProfile, filters = {}) {
  if (!isSuperAdmin(adminProfile) && !hasPermission(adminProfile, "ver_logs")) {
    throw new ServiceError("No autorizado.", 403);
  }
  const { data, error } = await supabase.rpc("admin_list_logs", {
    p_from: filters.from ? `${filters.from}T00:00:00.000Z` : null,
    p_to: filters.to ? `${filters.to}T23:59:59.999Z` : null,
    p_actor_id: filters.actorId || null,
    p_accion: filters.accion || null,
    p_limit: filters.limit ? Number(filters.limit) : 100,
    p_offset: filters.offset ? Number(filters.offset) : 0,
  });
  if (error) throw new ServiceError(error.message, 400);
  return data ?? { items: [], total: 0 };
}

export async function exportAdminLogsCsv(supabase, adminProfile, filters = {}) {
  const data = await listAdminLogs(supabase, adminProfile, { ...filters, limit: 500, offset: 0 });
  const items = Array.isArray(data.items) ? data.items : [];
  return toCsv(
    ["fecha", "actor", "email", "accion", "entidad", "entidad_id", "detalle"],
    items.map((row) => [
      row.fecha,
      row.actor_nombre,
      row.actor_email,
      row.accion,
      row.entidad_afectada,
      row.entidad_id,
      JSON.stringify(row.detalle ?? {}),
    ]),
  );
}

export const AUDIT_ACTION_LABELS = {
  [ADMIN_AUDIT_ACTIONS.CAMBIO_ROL]: "Cambio de rol",
  [ADMIN_AUDIT_ACTIONS.CAMBIO_PLAN]: "Cambio de plan",
  [ADMIN_AUDIT_ACTIONS.CREACION_ROL]: "Creación de rol",
  [ADMIN_AUDIT_ACTIONS.EDICION_ROL]: "Edición de rol",
  [ADMIN_AUDIT_ACTIONS.ELIMINACION_ROL]: "Eliminación de rol",
  [ADMIN_AUDIT_ACTIONS.EDICION_PERMISOS_USUARIO]: "Edición de permisos/funciones",
  [ADMIN_AUDIT_ACTIONS.ACTIVACION_CUENTA]: "Activación de cuenta",
  [ADMIN_AUDIT_ACTIONS.DESACTIVACION_CUENTA]: "Desactivación de cuenta",
  [ADMIN_AUDIT_ACTIONS.RESPUESTA_TICKET_SOPORTE]: "Respuesta a ticket",
  [ADMIN_AUDIT_ACTIONS.CAMBIO_ESTADO_TICKET]: "Cambio de estado de ticket",
};
