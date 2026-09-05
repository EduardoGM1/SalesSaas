/**
 * Permisos delegados (Asistentes) y acceso cruzado de Gerente entre salas.
 */
import { ServiceError, assertFound } from "../lib/service-error.js";
import { adminClient, requireEmpresaAdmin, empresaFromWorkspace } from "../lib/tenant-access.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { rpcEffectiveWorkspacePermissions } from "../lib/workspace-permission-rpc.js";

async function keysToPermisoIds(admin, keys) {
  const list = [...new Set((keys || []).filter((k) => typeof k === "string" && k.length))];
  if (!list.length) return [];
  const { data, error } = await admin.from("permisos").select("id, clave").in("clave", list);
  if (error) throw new ServiceError(error.message, 500);
  const byClave = new Map((data || []).map((p) => [p.clave, p.id]));
  const missing = list.filter((k) => !byClave.has(k));
  if (missing.length) {
    throw new ServiceError(`Permisos desconocidos: ${missing.join(", ")}`, 400);
  }
  return list.map((k) => ({ clave: k, id: byClave.get(k) }));
}

/** Catálogo tenant (capa:app). El techo del delegante nunca incluye capa:admin. */
async function loadAppPermissionKeys(admin) {
  const { data, error } = await admin.from("permisos").select("clave").eq("capa", "app");
  if (error) throw new ServiceError(error.message, 500);
  return new Set((data || []).map((p) => p.clave).filter(Boolean));
}

async function effectiveKeysForActor(admin, actorId, { empresaId, salaId }) {
  const appKeys = await loadAppPermissionKeys(admin);
  if (salaId) {
    const data = await rpcEffectiveWorkspacePermissions(admin, actorId, salaId);
    // Alcance del delegante (no techo de gobierno): set efectivo ∩ capa:app.
    return new Set((data || []).filter((k) => appKeys.has(k)));
  }
  const { data: isAdmin } = await admin.rpc("user_is_empresa_admin", {
    p_usuario_id: actorId,
    p_empresa_id: empresaId,
  });
  if (isAdmin === true) {
    return appKeys;
  }
  throw new ServiceError("Solo el Admin de Empresa o el Gerente pueden delegar.", 403);
}

function assertCeiling(requestedKeys, ceiling) {
  const overflow = requestedKeys.filter((k) => !ceiling.has(k));
  if (overflow.length) {
    throw new ServiceError(
      `No puedes delegar permisos fuera de tu alcance: ${overflow.join(", ")}`,
      403,
    );
  }
}

/** Lista claves que el actor puede ofrecer en el checklist. */
export async function listCeilingKeys(actorId, { empresaId, salaId }) {
  const admin = adminClient();
  if (empresaId) await requireEmpresaAdmin(actorId, empresaId);
  if (salaId) {
    const emp = await empresaFromWorkspace(admin, salaId);
    // Gerente de esa sala o admin empresa
    const { data: mem } = await admin
      .from("workspace_miembros")
      .select("rol_en_workspace, roles(slug)")
      .eq("workspace_id", salaId)
      .eq("usuario_id", actorId)
      .maybeSingle();
    const isGerente = mem?.rol_en_workspace === "gerente" || mem?.roles?.slug === "gerente";
    const { data: isAdmin } = await admin.rpc("user_is_empresa_admin", {
      p_usuario_id: actorId,
      p_empresa_id: emp,
    });
    if (!isGerente && isAdmin !== true) {
      throw new ServiceError("Solo el Gerente de la sala o Admin de Empresa pueden delegar aquí.", 403);
    }
  }
  const ceiling = await effectiveKeysForActor(admin, actorId, { empresaId, salaId });
  return [...ceiling].sort();
}

export async function listDelegatedKeys(actorId, { asistenteId, empresaId, salaId }) {
  const admin = adminClient();
  if (empresaId) await requireEmpresaAdmin(actorId, empresaId);
  if (salaId) {
    const emp = await empresaFromWorkspace(admin, salaId);
    const { data: mem } = await admin
      .from("workspace_miembros")
      .select("rol_en_workspace, roles(slug)")
      .eq("workspace_id", salaId)
      .eq("usuario_id", actorId)
      .maybeSingle();
    const isGerente = mem?.rol_en_workspace === "gerente" || mem?.roles?.slug === "gerente";
    const { data: isAdmin } = await admin.rpc("user_is_empresa_admin", {
      p_usuario_id: actorId,
      p_empresa_id: emp,
    });
    if (!isGerente && isAdmin !== true) {
      throw new ServiceError("Solo el Gerente de la sala o Admin de Empresa pueden ver delegaciones aquí.", 403);
    }
  }
  const { data, error } = await admin.rpc("list_permisos_delegados_keys", {
    p_asistente_id: asistenteId,
    p_empresa_id: empresaId || null,
    p_sala_id: salaId || null,
  });
  if (error) throw new ServiceError(error.message, 500);
  return Array.isArray(data) ? data : [];
}

/**
 * Reemplaza el conjunto de permisos delegados (PUT semántico).
 * Valida el alcance del delegante (capa:app; no es un techo de gobierno de plataforma).
 */
export async function replaceDelegatedPermissions(actorId, {
  asistenteId,
  empresaId = null,
  salaId = null,
  permisoKeys = [],
}) {
  if (!asistenteId) throw new ServiceError("asistente_id requerido.", 400);
  if (!empresaId && !salaId) throw new ServiceError("empresa_id o sala_id requerido.", 400);
  if (empresaId && salaId) throw new ServiceError("Indica solo empresa_id o sala_id.", 400);

  const admin = adminClient();
  if (empresaId) await requireEmpresaAdmin(actorId, empresaId);
  if (salaId) {
    const emp = await empresaFromWorkspace(admin, salaId);
    const ceilingGate = await listCeilingKeys(actorId, { salaId });
    void emp;
    void ceilingGate;
  }

  const ceiling = await effectiveKeysForActor(admin, actorId, { empresaId, salaId });
  const keys = [...new Set((permisoKeys || []).filter(Boolean))];
  assertCeiling(keys, ceiling);
  const mapped = await keysToPermisoIds(admin, keys);

  let delQ = admin.from("permisos_delegados").delete().eq("usuario_asistente_id", asistenteId);
  if (empresaId) delQ = delQ.eq("empresa_id", empresaId);
  if (salaId) delQ = delQ.eq("sala_id", salaId);
  const { error: delErr } = await delQ;
  if (delErr) throw new ServiceError(delErr.message, 500);

  if (mapped.length) {
    const rows = mapped.map((p) => ({
      usuario_delegante_id: actorId,
      usuario_asistente_id: asistenteId,
      permiso_id: p.id,
      empresa_id: empresaId,
      sala_id: salaId,
      otorgado_por: actorId,
    }));
    const { error: insErr } = await admin.from("permisos_delegados").insert(rows);
    if (insErr) throw new ServiceError(insErr.message, 400);
  }

  return { permiso_keys: keys };
}

// ---------- Acceso cruzado ----------

export async function listAccesoCruzado(actorId, empresaId, gerenteId) {
  await requireEmpresaAdmin(actorId, empresaId);
  const admin = adminClient();
  const { data: salas } = await admin
    .from("workspaces")
    .select("id, nombre, tipo")
    .eq("empresa_id", empresaId)
    .eq("tipo", "sala_de_venta")
    .eq("estado", "activo");

  const { data: grants } = await admin
    .from("gerente_acceso_cruzado")
    .select("id, sala_adicional_id, estado, fecha_otorgado")
    .eq("gerente_id", gerenteId)
    .eq("estado", "activo");

  const granted = new Set((grants || []).map((g) => g.sala_adicional_id));

  const { data: home } = await admin
    .from("workspace_miembros")
    .select("workspace_id")
    .eq("usuario_id", gerenteId);

  const homeIds = new Set((home || []).map((h) => h.workspace_id));

  return (salas || []).map((s) => ({
    sala_id: s.id,
    nombre: s.nombre,
    es_miembro: homeIds.has(s.id),
    acceso_cruzado: granted.has(s.id),
  }));
}

export async function setAccesoCruzado(actorId, empresaId, gerenteId, salaId, activo) {
  await requireEmpresaAdmin(actorId, empresaId);
  const admin = adminClient();

  const { data: sala, error: sErr } = await admin
    .from("workspaces")
    .select("id, empresa_id, tipo")
    .eq("id", salaId)
    .maybeSingle();
  if (sErr) throw new ServiceError(sErr.message, 500);
  assertFound(sala, "Sala");
  if (sala.empresa_id !== empresaId || sala.tipo !== "sala_de_venta") {
    assertWorkspaceSameEmpresa();
  }

  if (!activo) {
    const { error } = await admin
      .from("gerente_acceso_cruzado")
      .update({ estado: "revocado" })
      .eq("gerente_id", gerenteId)
      .eq("sala_adicional_id", salaId)
      .eq("estado", "activo");
    if (error) throw new ServiceError(error.message, 400);
    return { ok: true, estado: "revocado" };
  }

  const { data: existing } = await admin
    .from("gerente_acceso_cruzado")
    .select("id, estado")
    .eq("gerente_id", gerenteId)
    .eq("sala_adicional_id", salaId)
    .maybeSingle();

  if (existing?.estado === "activo") return { ok: true, estado: "activo" };

  if (existing) {
    const { error } = await admin
      .from("gerente_acceso_cruzado")
      .update({ estado: "activo", otorgado_por: actorId, fecha_otorgado: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new ServiceError(error.message, 400);
  } else {
    const { error } = await admin.from("gerente_acceso_cruzado").insert({
      gerente_id: gerenteId,
      sala_adicional_id: salaId,
      otorgado_por: actorId,
      estado: "activo",
    });
    if (error) throw new ServiceError(error.message, 400);
  }
  return { ok: true, estado: "activo" };
}

function assertWorkspaceSameEmpresa() {
  throw new ServiceError("Solo se puede otorgar acceso entre salas de la misma empresa.", 403);
}

/** Salas con acceso cruzado activo para listUserWorkspaces. */
export async function listCrossAccessSalasForUser(userId) {
  const admin = createServiceSupabaseClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("gerente_acceso_cruzado")
    .select("sala_adicional_id, workspaces(id, tipo, nombre, logo_url, logo_icono_url, colores_marca, empresa_id, estado, empresas(id, nombre, logo_url, logo_icono_url, colores_marca))")
    .eq("gerente_id", userId)
    .eq("estado", "activo");
  if (error) return [];
  return (data || [])
    .map((row) => row.workspaces)
    .filter((w) => w && w.estado !== "archivado");
}
