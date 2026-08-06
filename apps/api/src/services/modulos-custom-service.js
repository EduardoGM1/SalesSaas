/**
 * CRUD de módulos custom por tenant (sobre `flags` + `modulo_custom_datos`).
 * Sin tablas nuevas por cliente: datos en JSONB genérico.
 */
import { ServiceError, assertFound } from "../lib/service-error.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { requireEmpresaAdmin } from "../lib/tenant-access.js";
import { getRequestWorkspaceId } from "../lib/workspace-scope.js";

const PUNTOS_EXTENSION = new Set([
  "expediente.tab",
  "dashboard.sala.bloque",
  "clientes.columna",
]);

function adminClient() {
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  return admin;
}

function assertSchemaUi(schema) {
  if (schema == null) return {};
  if (typeof schema !== "object" || Array.isArray(schema)) {
    throw new ServiceError("schema_ui debe ser un objeto.", 400);
  }
  return schema;
}

/** Catálogo visible para una empresa: estándar globales + custom propios. */
export async function listFlagsForEmpresa(actorId, empresaId) {
  await requireEmpresaAdmin(actorId, empresaId);
  const admin = adminClient();
  const { data, error } = await admin
    .from("flags")
    .select("id, clave, nombre_visible, flag_padre, default_global, tipo, empresa_id, schema_ui, punto_extension, created_at")
    .or(`empresa_id.is.null,empresa_id.eq.${empresaId}`)
    .order("clave");
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}

export async function createCustomModule(actorId, empresaId, body) {
  await requireEmpresaAdmin(actorId, empresaId);
  const clave = String(body?.clave || "").trim();
  const nombre = String(body?.nombre_visible || body?.nombre || "").trim();
  if (!clave || !nombre) throw new ServiceError("clave y nombre_visible requeridos.", 400);
  if (!/^[a-z][a-z0-9_.-]{1,63}$/.test(clave)) {
    throw new ServiceError("clave inválida (minúsculas, números, _ . -).", 400);
  }
  const punto = body?.punto_extension ?? null;
  if (punto && !PUNTOS_EXTENSION.has(punto)) {
    throw new ServiceError(`punto_extension inválido. Permitidos: ${[...PUNTOS_EXTENSION].join(", ")}`, 400);
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from("flags")
    .insert({
      clave,
      nombre_visible: nombre,
      tipo: "custom",
      empresa_id: empresaId,
      default_global: false,
      schema_ui: assertSchemaUi(body?.schema_ui),
      punto_extension: punto,
      flag_padre: body?.flag_padre || null,
    })
    .select("id, clave, nombre_visible, tipo, empresa_id, schema_ui, punto_extension")
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function updateCustomModule(actorId, empresaId, moduloId, body) {
  await requireEmpresaAdmin(actorId, empresaId);
  const admin = adminClient();
  const { data: existing, error: findErr } = await admin
    .from("flags")
    .select("id, tipo, empresa_id")
    .eq("id", moduloId)
    .maybeSingle();
  if (findErr) throw new ServiceError(findErr.message, 500);
  assertFound(existing, "Módulo");
  if (existing.tipo !== "custom" || existing.empresa_id !== empresaId) {
    throw new ServiceError("Solo se pueden editar módulos custom de esta empresa.", 403);
  }

  const patch = {};
  if (body?.nombre_visible != null) patch.nombre_visible = String(body.nombre_visible).trim();
  if (body?.schema_ui != null) patch.schema_ui = assertSchemaUi(body.schema_ui);
  if (body?.punto_extension !== undefined) {
    const punto = body.punto_extension;
    if (punto && !PUNTOS_EXTENSION.has(punto)) {
      throw new ServiceError(`punto_extension inválido.`, 400);
    }
    patch.punto_extension = punto;
  }
  if (!Object.keys(patch).length) throw new ServiceError("Nada que actualizar.", 400);

  const { data, error } = await admin
    .from("flags")
    .update(patch)
    .eq("id", moduloId)
    .select("id, clave, nombre_visible, tipo, empresa_id, schema_ui, punto_extension")
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function upsertModuloCustomDatos(actorId, empresaId, moduloId, body) {
  await requireEmpresaAdmin(actorId, empresaId);
  const admin = adminClient();
  const { data: mod, error: modErr } = await admin
    .from("flags")
    .select("id, tipo, empresa_id")
    .eq("id", moduloId)
    .maybeSingle();
  if (modErr) throw new ServiceError(modErr.message, 500);
  assertFound(mod, "Módulo");
  if (mod.tipo !== "custom" || mod.empresa_id !== empresaId) {
    throw new ServiceError("Módulo no pertenece a esta empresa.", 403);
  }

  const entidad = body?.entidad_relacionada_id ?? null;
  const datos = body?.datos;
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw new ServiceError("datos debe ser un objeto JSON.", 400);
  }

  const { data, error } = await admin
    .from("modulo_custom_datos")
    .upsert(
      {
        modulo_id: moduloId,
        empresa_id: empresaId,
        entidad_relacionada_id: entidad,
        datos,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "modulo_id,empresa_id,entidad_relacionada_id" },
    )
    .select("id, modulo_id, empresa_id, entidad_relacionada_id, datos, updated_at")
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function listModuloCustomDatos(actorId, empresaId, moduloId, { entidadId } = {}) {
  await requireEmpresaAdmin(actorId, empresaId);
  const admin = adminClient();
  const { data: mod, error: modErr } = await admin
    .from("flags")
    .select("id, tipo, empresa_id")
    .eq("id", moduloId)
    .maybeSingle();
  if (modErr) throw new ServiceError(modErr.message, 500);
  assertFound(mod, "Módulo");
  if (mod.tipo !== "custom" || mod.empresa_id !== empresaId) {
    throw new ServiceError("Módulo no pertenece a esta empresa.", 403);
  }
  let q = admin
    .from("modulo_custom_datos")
    .select("id, modulo_id, empresa_id, entidad_relacionada_id, datos, updated_at")
    .eq("empresa_id", empresaId)
    .eq("modulo_id", moduloId);
  if (entidadId) q = q.eq("entidad_relacionada_id", entidadId);
  const { data, error } = await q.order("updated_at", { ascending: false });
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}

async function assertWorkspaceEmpresaAccess(supabase, userId, workspaceId) {
  const resolvedId = workspaceId || await getRequestWorkspaceId(supabase, userId);
  if (!resolvedId) throw new ServiceError("Workspace activo requerido.", 403);

  const admin = adminClient();
  const { data: ws, error } = await admin
    .from("workspaces")
    .select("id, tipo, empresa_id")
    .eq("id", resolvedId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  assertFound(ws, "Workspace");
  if (ws.tipo !== "sala_de_venta" || !ws.empresa_id) {
    throw new ServiceError("Solo disponible en una Sala de Ventas.", 403);
  }

  const { data: member } = await admin
    .from("workspace_miembros")
    .select("usuario_id")
    .eq("workspace_id", resolvedId)
    .eq("usuario_id", userId)
    .maybeSingle();
  if (!member) {
    const { data: profile } = await admin
      .from("profiles")
      .select("is_super_admin")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.is_super_admin !== true) {
      throw new ServiceError("No perteneces a esta sala.", 403);
    }
  }
  return { workspaceId: resolvedId, empresaId: ws.empresa_id };
}

async function assertModuleEnabledInWorkspace(supabase, userId, workspaceId, modulo) {
  const { data, error } = await supabase.rpc("resolver_workspace_flag", {
    p_clave: modulo.clave,
    p_usuario_id: userId,
    p_workspace_id: workspaceId,
  });
  if (error) throw new ServiceError(error.message, 500);
  if (data !== true) throw new ServiceError("Módulo no habilitado en este workspace.", 403);
}

/** Módulos custom habilitados en el workspace activo (operacional, no admin). */
export async function listEnabledCustomModulesForWorkspace(supabase, userId, { punto } = {}) {
  const { workspaceId, empresaId } = await assertWorkspaceEmpresaAccess(supabase, userId);
  const admin = adminClient();
  const { data: mods, error } = await admin
    .from("flags")
    .select("id, clave, nombre_visible, schema_ui, punto_extension, tipo, empresa_id")
    .eq("tipo", "custom")
    .eq("empresa_id", empresaId)
    .order("nombre_visible");
  if (error) throw new ServiceError(error.message, 500);

  const out = [];
  for (const mod of mods ?? []) {
    if (punto && mod.punto_extension !== punto) continue;
    const { data: enabled } = await supabase.rpc("resolver_workspace_flag", {
      p_clave: mod.clave,
      p_usuario_id: userId,
      p_workspace_id: workspaceId,
    });
    if (enabled === true) out.push(mod);
  }
  return out;
}

export async function getCustomModuleEntityDatos(supabase, userId, moduloId, entidadId) {
  if (!entidadId) throw new ServiceError("entidad_id requerido.", 400);
  const { workspaceId, empresaId } = await assertWorkspaceEmpresaAccess(supabase, userId);
  const admin = adminClient();
  const { data: mod, error } = await admin
    .from("flags")
    .select("id, clave, tipo, empresa_id, schema_ui, nombre_visible, punto_extension")
    .eq("id", moduloId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  assertFound(mod, "Módulo");
  if (mod.tipo !== "custom" || mod.empresa_id !== empresaId) {
    throw new ServiceError("Módulo no pertenece a esta empresa.", 403);
  }
  await assertModuleEnabledInWorkspace(supabase, userId, workspaceId, mod);

  const { data: row, error: dErr } = await admin
    .from("modulo_custom_datos")
    .select("id, modulo_id, empresa_id, entidad_relacionada_id, datos, updated_at")
    .eq("modulo_id", moduloId)
    .eq("empresa_id", empresaId)
    .eq("entidad_relacionada_id", entidadId)
    .maybeSingle();
  if (dErr) throw new ServiceError(dErr.message, 500);
  return {
    modulo: {
      id: mod.id,
      clave: mod.clave,
      nombre_visible: mod.nombre_visible,
      schema_ui: mod.schema_ui,
      punto_extension: mod.punto_extension,
    },
    datos: row?.datos ?? {},
    updated_at: row?.updated_at ?? null,
  };
}

export async function upsertCustomModuleEntityDatos(supabase, userId, moduloId, body) {
  const entidadId = body?.entidad_relacionada_id ?? body?.entidad_id;
  if (!entidadId) throw new ServiceError("entidad_relacionada_id requerido.", 400);
  const datos = body?.datos;
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw new ServiceError("datos debe ser un objeto JSON.", 400);
  }

  const { workspaceId, empresaId } = await assertWorkspaceEmpresaAccess(supabase, userId);
  const admin = adminClient();
  const { data: mod, error } = await admin
    .from("flags")
    .select("id, clave, tipo, empresa_id")
    .eq("id", moduloId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  assertFound(mod, "Módulo");
  if (mod.tipo !== "custom" || mod.empresa_id !== empresaId) {
    throw new ServiceError("Módulo no pertenece a esta empresa.", 403);
  }
  await assertModuleEnabledInWorkspace(supabase, userId, workspaceId, mod);

  const { data, error: upErr } = await admin
    .from("modulo_custom_datos")
    .upsert(
      {
        modulo_id: moduloId,
        empresa_id: empresaId,
        entidad_relacionada_id: entidadId,
        datos,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "modulo_id,empresa_id,entidad_relacionada_id" },
    )
    .select("id, modulo_id, empresa_id, entidad_relacionada_id, datos, updated_at")
    .single();
  if (upErr) throw new ServiceError(upErr.message, 400);
  return data;
}

export { PUNTOS_EXTENSION };
