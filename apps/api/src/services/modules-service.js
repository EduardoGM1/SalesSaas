import { ServiceError } from "../lib/service-error.js";
import { isSuperAdmin } from "@salesapp/shared/auth/permissions.js";
import { MODULE_CATALOG } from "@salesapp/shared/auth/permission-catalog.js";

function assertSuperAdmin(profile) {
  if (!isSuperAdmin(profile)) throw new ServiceError("No autorizado.", 403);
}

export async function listModules(supabase, adminProfile) {
  assertSuperAdmin(adminProfile);
  const { data: mods, error } = await supabase
    .from("modulos")
    .select("clave, nombre_visible, activo_por_default, requiere_plan, descripcion")
    .order("clave");
  if (error) throw new ServiceError(error.message, 400);

  const { data: acts } = await supabase
    .from("modulo_activacion")
    .select("id, modulo_clave, scope_tipo, organizacion_id, grupo_id, usuario_id, activo");

  return {
    catalog: mods?.length ? mods : MODULE_CATALOG,
    activations: acts ?? [],
  };
}

export async function setModuleActivation(supabase, adminProfile, body) {
  assertSuperAdmin(adminProfile);
  const clave = String(body?.modulo_clave || body?.clave || "").trim();
  const scope = String(body?.scope_tipo || "").trim();
  if (!clave || !["organizacion", "grupo", "usuario"].includes(scope)) {
    throw new ServiceError("Datos de activación inválidos.");
  }
  if (typeof body?.activo !== "boolean") throw new ServiceError("activo debe ser boolean.");

  const { data, error } = await supabase.rpc("admin_set_modulo_activacion", {
    p_modulo_clave: clave,
    p_scope_tipo: scope,
    p_activo: body.activo,
    p_organizacion_id: body.organizacion_id || null,
    p_grupo_id: body.grupo_id || null,
    p_usuario_id: body.usuario_id || null,
  });
  if (error) throw new ServiceError(error.message, 400);
  return { id: data };
}

export async function clearModuleActivation(supabase, adminProfile, activationId) {
  assertSuperAdmin(adminProfile);
  if (!activationId) throw new ServiceError("Activación inválida.");
  const { error } = await supabase.from("modulo_activacion").delete().eq("id", activationId);
  if (error) throw new ServiceError(error.message, 400);
  return { ok: true };
}
