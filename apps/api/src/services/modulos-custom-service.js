/**
 * CRUD de módulos custom por tenant (sobre `flags` + `modulo_custom_datos`).
 * Sin tablas nuevas por cliente: datos en JSONB genérico.
 */
import { ServiceError, assertFound } from "../lib/service-error.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { requireEmpresaAdmin } from "../lib/tenant-access.js";

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

export { PUNTOS_EXTENSION };
