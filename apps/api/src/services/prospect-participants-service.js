/**
 * Participantes del expediente (sin pipeline de etapas).
 * Vendedor, Gerente y Cerrador colaboran sobre el mismo registro.
 */
import { ServiceError } from "../lib/service-error.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { getRequestWorkspaceContext, requireWorkspacePermission } from "../lib/workspace-scope.js";
import { canEditProspectRecord } from "../lib/prospect-edit-access.js";
import { notifyCloserAssigned } from "./push-notifications-service.js";
import { rpcEffectiveWorkspacePermissions } from "../lib/workspace-permission-rpc.js";

function adminClient() {
  const client = createServiceSupabaseClient();
  if (!client) throw new ServiceError("Service role no configurado.", 500);
  return client;
}

async function loadAccess(actorId, prospectId) {
  const admin = adminClient();
  const { data: prospect, error } = await admin
    .from("prospects")
    .select("id, user_id, workspace_id, name, name1, prospect_code, workspaces(empresa_id, tipo, nombre, empresas(nombre))")
    .eq("id", prospectId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);

  const denyAccess = () => new ServiceError("No puedes acceder a este expediente.", 403);
  // Mismo 403 si el UUID no existe o si existe y el actor no es miembro:
  // evita enumerar expedientes (404 vs 403). El SELECT admin sigue siendo interno.
  if (!prospect) throw denyAccess();

  const [{ data: profile }, { data: member }, { data: companyAdmin }] = await Promise.all([
    admin.from("profiles").select("is_super_admin").eq("id", actorId).maybeSingle(),
    admin
      .from("workspace_miembros")
      .select("role_id, rol_en_workspace, roles(slug, nombre)")
      .eq("workspace_id", prospect.workspace_id)
      .eq("usuario_id", actorId)
      .maybeSingle(),
    prospect.workspaces?.empresa_id
      ? admin
        .from("empresa_miembros")
        .select("id")
        .eq("empresa_id", prospect.workspaces.empresa_id)
        .eq("usuario_id", actorId)
        .eq("es_admin", true)
        .eq("estado", "activo")
        .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const isSuper = profile?.is_super_admin === true;
  if (!isSuper && !companyAdmin && !member) {
    throw denyAccess();
  }
  if (prospect.workspaces?.tipo !== "sala_de_venta") {
    throw new ServiceError("Los participantes solo aplican en Salas de Ventas.", 409);
  }

  const permissionKeys = await rpcEffectiveWorkspacePermissions(admin, actorId, prospect.workspace_id);
  const permissions = new Set(permissionKeys);
  const roleSlug = member?.roles?.slug || member?.rol_en_workspace || null;
  return {
    admin,
    prospect,
    member,
    permissions,
    roleSlug,
    isSuper,
    isCompanyAdmin: Boolean(companyAdmin),
    isManager: isSuper
      || Boolean(companyAdmin)
      || member?.rol_en_workspace === "gerente"
      || permissions.has("workflow:revisar")
      || permissions.has("expedientes:ver_equipo"),
  };
}

async function loadExistingParticipants(access) {
  const { data, error } = await access.admin
    .from("prospect_workflows")
    .select("*")
    .eq("prospect_id", access.prospect.id)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return data || null;
}

/** Inserta el row de participantes. Solo llamar DESPUÉS de autorizar al actor. */
async function ensureParticipants(access, actorId) {
  const { admin, prospect } = access;
  const { data: existing, error } = await admin
    .from("prospect_workflows")
    .select("*")
    .eq("prospect_id", prospect.id)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (existing) return existing;

  const { data: managerMembership } = await admin
    .from("workspace_miembros")
    .select("usuario_id")
    .eq("workspace_id", prospect.workspace_id)
    .eq("rol_en_workspace", "gerente")
    .limit(1)
    .maybeSingle();
  const { data, error: insertError } = await admin
    .from("prospect_workflows")
    .upsert({
      prospect_id: prospect.id,
      workspace_id: prospect.workspace_id,
      representante_id: prospect.user_id,
      gerente_id: managerMembership?.usuario_id || null,
      created_by: actorId,
      // etapa_actual deprecada: default de columna; no hay pipeline.
      estado: "en_progreso",
    }, { onConflict: "prospect_id", ignoreDuplicates: true })
    .select()
    .maybeSingle();
  if (insertError) throw new ServiceError(insertError.message, 400);
  if (data) return data;

  const { data: again, error: againError } = await admin
    .from("prospect_workflows")
    .select("*")
    .eq("prospect_id", prospect.id)
    .maybeSingle();
  if (againError) throw new ServiceError(againError.message, 500);
  if (!again) throw new ServiceError("No se pudo inicializar participantes.", 500);
  return again;
}

function canViewParticipants(access, participants, actorId) {
  const representanteId = participants?.representante_id ?? access.prospect.user_id;
  const cerradorId = participants?.cerrador_id ?? null;
  return access.isManager
    || representanteId === actorId
    || cerradorId === actorId
    || access.permissions.has("workflow:ver")
    || access.permissions.has("expedientes:ver_propios");
}

function assertCanManageParticipants(access, message) {
  if (!access.isManager) throw new ServiceError(message, 403);
}

/**
 * Autoriza la vista y solo entonces inicializa el row si falta.
 * Quien no pasa el check grosero (gerente/dueño/ver_propios) solo puede ser
 * representante/cerrador de un row YA existente — nunca provoca un insert.
 */
async function participantsAfterAuth(access, actorId) {
  if (canViewParticipants(access, null, actorId)) {
    return ensureParticipants(access, actorId);
  }
  const existing = await loadExistingParticipants(access);
  if (existing && (existing.representante_id === actorId || existing.cerrador_id === actorId)) {
    return existing;
  }
  throw new ServiceError("No puedes ver este expediente.", 403);
}

async function participantsPayload(admin, prospectId) {
  const { data, error } = await admin
    .from("prospect_workflows")
    .select("prospect_id, workspace_id, representante_id, gerente_id, cerrador_id, estado, updated_at, created_at, representante:profiles!prospect_workflows_representante_id_fkey(id, full_name, email), gerente:profiles!prospect_workflows_gerente_id_fkey(id, full_name, email), cerrador:profiles!prospect_workflows_cerrador_id_fkey(id, full_name, email)")
    .eq("prospect_id", prospectId)
    .single();
  if (error) throw new ServiceError(error.message, 500);
  return data;
}

/** Estado de participantes + historial (sin etapas). */
export async function getParticipants(_supabase, actorId, prospectId) {
  const access = await loadAccess(actorId, prospectId);
  await participantsAfterAuth(access, actorId);
  const [state, timeline, conversation] = await Promise.all([
    participantsPayload(access.admin, prospectId),
    listEventTimeline(_supabase, actorId, prospectId),
    access.admin
      .from("chat_conversations")
      .select("id")
      .eq("prospect_id", prospectId)
      .maybeSingle()
      .then(({ data }) => data?.id || null)
      .catch(() => null),
  ]);
  return {
    state,
    timeline,
    conversation_id: conversation,
    context: {
      sala_nombre: access.prospect.workspaces?.nombre ?? null,
      empresa_nombre: access.prospect.workspaces?.empresas?.nombre ?? null,
    },
    capabilities: {
      can_edit: canEditProspectRecord({
        actorId,
        prospect: access.prospect,
        workflow: state,
        permissions: access.permissions,
        memberRole: access.member?.rol_en_workspace || null,
      }),
      can_assign_closer: access.isManager && !state.cerrador_id && state.estado !== "cancelado",
      can_reassign_closer: access.isManager && Boolean(state.cerrador_id) && state.estado !== "cancelado",
      can_assign_representante: access.isManager && !state.representante_id && state.estado !== "cancelado",
      can_reassign_representante: access.isManager && Boolean(state.representante_id) && state.estado !== "cancelado",
    },
  };
}

export async function listEventTimeline(_supabase, actorId, prospectId) {
  const access = await loadAccess(actorId, prospectId);
  await participantsAfterAuth(access, actorId);
  const { data, error } = await access.admin
    .from("prospect_workflow_events")
    .select("id, prospect_id, actor_id, actor_role, event_type, metadata, created_at, actor:profiles(full_name, email)")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}

/** Asigna o reasigna Cerrador; sincroniza chat y notifica. */
export async function assignCloser(_supabase, actorId, prospectId, closerId) {
  const access = await loadAccess(actorId, prospectId);
  assertCanManageParticipants(access, "Solo un gerente puede asignar Cerrador.");
  const participants = await ensureParticipants(access, actorId);
  if (participants.estado === "cancelado") {
    throw new ServiceError("El expediente está cancelado.", 409);
  }
  if (!closerId) throw new ServiceError("cerrador_id requerido.", 400);

  const { data: member } = await access.admin
    .from("workspace_miembros")
    .select("usuario_id, role_id, roles(slug)")
    .eq("workspace_id", access.prospect.workspace_id)
    .eq("usuario_id", closerId)
    .maybeSingle();
  if (!member) throw new ServiceError("El Cerrador debe pertenecer a la misma sala.", 400);

  const permissionKeys = await rpcEffectiveWorkspacePermissions(
    access.admin,
    closerId,
    access.prospect.workspace_id,
  );
  if (
    member.roles?.slug !== "cerrador"
    && !permissionKeys.includes("workflow:cerrar")
  ) {
    throw new ServiceError("El usuario seleccionado no tiene capacidad de Cerrador.", 400);
  }

  const previousCloserId = participants.cerrador_id;
  const { data, error } = await access.admin.rpc("assign_prospect_closer", {
    p_prospect_id: prospectId,
    p_actor_id: actorId,
    p_cerrador_id: closerId,
    p_actor_role: access.roleSlug || "gerente",
  });
  if (error) throw new ServiceError(error.message, 409);

  try {
    await access.admin.rpc("sync_prospect_chat_members", { p_prospect_id: prospectId });
  } catch {
    /* el chat no bloquea la asignación */
  }

  const prospectName = access.prospect.name1 || access.prospect.name || access.prospect.prospect_code || "Expediente";
  const { data: actorProfile } = await access.admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", actorId)
    .maybeSingle();
  notifyCloserAssigned({
    closerId,
    vendedorId: participants.representante_id || access.prospect.user_id,
    actorId,
    actorName: actorProfile?.full_name || actorProfile?.email || "Gerente",
    prospectId,
    prospectName,
    reassigned: Boolean(previousCloserId) && previousCloserId !== closerId,
  }).catch(() => {});

  return data;
}

/** Asigna o reasigna Vendedor (representante); sincroniza chat. */
export async function assignRepresentante(_supabase, actorId, prospectId, representanteId) {
  const access = await loadAccess(actorId, prospectId);
  assertCanManageParticipants(access, "Solo un gerente puede asignar Vendedor.");
  const participants = await ensureParticipants(access, actorId);
  if (participants.estado === "cancelado") {
    throw new ServiceError("El expediente está cancelado.", 409);
  }
  if (!representanteId) throw new ServiceError("representante_id requerido.", 400);

  const { data: member } = await access.admin
    .from("workspace_miembros")
    .select("usuario_id, rol_en_workspace, role_id, roles(slug)")
    .eq("workspace_id", access.prospect.workspace_id)
    .eq("usuario_id", representanteId)
    .maybeSingle();
  if (!member) throw new ServiceError("El Vendedor debe pertenecer a la misma sala.", 400);
  if (member.rol_en_workspace === "gerente") {
    throw new ServiceError("El gerente de la sala no puede ser asignado como Vendedor.", 400);
  }

  const permissionKeys = await rpcEffectiveWorkspacePermissions(
    access.admin,
    representanteId,
    access.prospect.workspace_id,
  );
  const permissions = new Set(permissionKeys);
  const isCloserOnly = (member.roles?.slug === "cerrador" || permissions.has("workflow:cerrar"))
    && !permissions.has("expedientes:crear")
    && member.rol_en_workspace !== "vendedor";
  if (isCloserOnly) {
    throw new ServiceError("El usuario seleccionado no puede actuar como Vendedor.", 400);
  }

  const { data, error } = await access.admin.rpc("assign_prospect_representante", {
    p_prospect_id: prospectId,
    p_actor_id: actorId,
    p_representante_id: representanteId,
    p_actor_role: access.roleSlug || "gerente",
  });
  if (error) throw new ServiceError(error.message, 409);

  try {
    await access.admin.rpc("sync_prospect_chat_members", { p_prospect_id: prospectId });
  } catch {
    /* el chat no bloquea la asignación */
  }

  return data;
}

/** Lista expedientes activos de la sala según rol (sin filtrar por etapa). */
export async function listActiveProspects(supabase, actorId) {
  const ctx = await getRequestWorkspaceContext(supabase, actorId);
  const required = ctx.teamScope ? "expedientes:ver_equipo" : "expedientes:ver_propios";
  const workspaceId = await requireWorkspacePermission(supabase, actorId, required, ctx.workspaceId);
  const admin = adminClient();
  const { data: member } = await admin
    .from("workspace_miembros")
    .select("rol_en_workspace, roles(slug)")
    .eq("workspace_id", workspaceId)
    .eq("usuario_id", actorId)
    .maybeSingle();
  if (!member) throw new ServiceError("No perteneces a esta sala.", 403, "WORKSPACE_ACCESS_DENIED");
  const permissionKeys = await rpcEffectiveWorkspacePermissions(admin, actorId, workspaceId);
  const permissions = new Set(permissionKeys);
  const isManager = member.rol_en_workspace === "gerente" || permissions.has("expedientes:ver_equipo");

  let query = admin
    .from("prospect_workflows")
    .select("prospect_id, workspace_id, representante_id, gerente_id, cerrador_id, estado, updated_at, prospects(id, name, name1, prospect_code, status, updated_at), representante:profiles!prospect_workflows_representante_id_fkey(full_name), cerrador:profiles!prospect_workflows_cerrador_id_fkey(full_name)")
    .eq("workspace_id", workspaceId)
    .neq("estado", "cancelado")
    .order("updated_at", { ascending: false });

  if (!isManager) {
    const isCloser = member.roles?.slug === "cerrador" || permissions.has("workflow:cerrar");
    query = isCloser
      ? query.or(`cerrador_id.eq.${actorId},representante_id.eq.${actorId}`)
      : query.eq("representante_id", actorId);
  }

  const { data, error } = await query;
  if (error) throw new ServiceError(error.message, 500);

  const rows = data ?? [];
  const prospectIds = rows.map((row) => row.prospect_id).filter(Boolean);
  /** @type {Map<string, { full_name?: string | null, created_at?: string }>} */
  const lastActivityByProspect = new Map();
  if (prospectIds.length) {
    const { data: events } = await admin
      .from("prospect_workflow_events")
      .select("prospect_id, created_at, actor:profiles(full_name)")
      .in("prospect_id", prospectIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(prospectIds.length * 8, 400));
    for (const event of events || []) {
      if (!event?.prospect_id || lastActivityByProspect.has(event.prospect_id)) continue;
      lastActivityByProspect.set(event.prospect_id, {
        full_name: event.actor?.full_name || null,
        created_at: event.created_at,
      });
    }
  }

  return rows.map((row) => {
    const last = lastActivityByProspect.get(row.prospect_id);
    return {
      prospect_id: row.prospect_id,
      estado: row.estado,
      updated_at: row.updated_at,
      last_activity_at: last?.created_at || row.updated_at || null,
      last_activity_by: last?.full_name || null,
      prospects: row.prospects,
      representante: row.representante,
      cerrador: row.cerrador,
      representante_id: row.representante_id,
      cerrador_id: row.cerrador_id,
    };
  });
}

// Compat aliases usados por rutas antiguas durante la migración.
export const getWorkflow = getParticipants;
export const listWorkflowTimeline = listEventTimeline;
export const listWorkflowInbox = listActiveProspects;
