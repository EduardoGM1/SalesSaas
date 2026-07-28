/**
 * Capa de acceso tenant: autorización por empresa y helpers de alcance.
 * Los servicios tenant dependen de este módulo; nunca duplican estos chequeos.
 */
import { ServiceError } from "./service-error.js";
import { createServiceSupabaseClient } from "./supabase-server.js";

/** Cliente service-role para operaciones administrativas; falla si no está configurado. */
export function adminClient() {
  const client = createServiceSupabaseClient();
  if (!client) throw new ServiceError("Service role no configurado.", 500);
  return client;
}

/** Autoriza al actor como Super Admin o Admin activo de la empresa; retorna el cliente admin. */
export async function requireEmpresaAdmin(actorId, empresaId) {
  if (!actorId || !empresaId) throw new ServiceError("Empresa requerida.", 400);
  const admin = adminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_super_admin")
    .eq("id", actorId)
    .maybeSingle();
  if (profile?.is_super_admin === true) return admin;

  const { data: membership } = await admin
    .from("empresa_miembros")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("usuario_id", actorId)
    .eq("es_admin", true)
    .eq("estado", "activo")
    .maybeSingle();
  if (!membership) throw new ServiceError("No puedes administrar esta empresa.", 403);
  return admin;
}

/** Resuelve la empresa dueña de una Sala de Ventas; 404 si no existe. */
export async function empresaFromWorkspace(admin, workspaceId) {
  const { data, error } = await admin
    .from("workspaces")
    .select("empresa_id")
    .eq("id", workspaceId)
    .eq("tipo", "sala_de_venta")
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (!data?.empresa_id) throw new ServiceError("Sala no encontrada.", 404);
  return data.empresa_id;
}

/** Slug URL-safe a partir de un nombre visible. */
export function normalizeSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
