import { ServiceError } from "../lib/service-error.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { getRequestWorkspaceId } from "../lib/workspace-scope.js";

const NEXT_STAGE = {
  representante: "survey",
  survey: "worksheet",
  worksheet: "proyeccion",
  money_box: "tipo_cambio",
  tipo_cambio: "venta",
  venta: "completado",
};

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
  if (!prospect) throw new ServiceError("Expediente no encontrado.", 404);
  if (prospect.workspaces?.tipo !== "sala_de_venta") {
    throw new ServiceError("El workflow comercial solo aplica a Salas de Ventas.", 409);
  }

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
    throw new ServiceError("No puedes acceder a este expediente.", 403);
  }

  const { data: permissionKeys } = await admin.rpc("effective_workspace_permissions", {
    p_usuario_id: actorId,
    p_workspace_id: prospect.workspace_id,
  });
  const permissions = new Set(Array.isArray(permissionKeys) ? permissionKeys : []);
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
      || permissions.has("workflow:revisar"),
  };
}

async function ensureWorkflow(access, actorId) {
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
    .insert({
      prospect_id: prospect.id,
      workspace_id: prospect.workspace_id,
      representante_id: prospect.user_id,
      gerente_id: managerMembership?.usuario_id || null,
      created_by: actorId,
    })
    .select()
    .single();
  if (insertError) throw new ServiceError(insertError.message, 400);
  return data;
}

function assertWorkflowVisibility(access, workflow, actorId) {
  const visible = access.isManager
    || workflow.representante_id === actorId
    || workflow.cerrador_id === actorId
    || access.permissions.has("workflow:ver");
  if (!visible) throw new ServiceError("No puedes ver este workflow.", 403);
}

async function workflowPayload(admin, prospectId) {
  const { data: workflow, error } = await admin
    .from("prospect_workflows")
    .select("*, representante:profiles!prospect_workflows_representante_id_fkey(id, full_name, email), gerente:profiles!prospect_workflows_gerente_id_fkey(id, full_name, email), cerrador:profiles!prospect_workflows_cerrador_id_fkey(id, full_name, email)")
    .eq("prospect_id", prospectId)
    .single();
  if (error) throw new ServiceError(error.message, 500);
  return workflow;
}

export async function getWorkflow(_supabase, actorId, prospectId) {
  const access = await loadAccess(actorId, prospectId);
  const workflow = await ensureWorkflow(access, actorId);
  assertWorkflowVisibility(access, workflow, actorId);
  const [state, timeline] = await Promise.all([
    workflowPayload(access.admin, prospectId),
    listWorkflowTimeline(_supabase, actorId, prospectId),
  ]);
  const representativeStage = ["representante", "survey", "worksheet"].includes(state.etapa_actual);
  const closerStage = ["money_box", "tipo_cambio", "venta"].includes(state.etapa_actual);
  return {
    state,
    timeline,
    context: {
      sala_nombre: access.prospect.workspaces?.nombre ?? null,
      empresa_nombre: access.prospect.workspaces?.empresas?.nombre ?? null,
    },
    capabilities: {
      can_advance: (
        (representativeStage && (
          state.representante_id === actorId
          || access.isManager
          || access.permissions.has("workflow:avanzar")
        ))
        || (closerStage && (state.cerrador_id === actorId || access.isManager))
      ),
      can_send_review: state.etapa_actual === "proyeccion"
        && (state.representante_id === actorId || access.isManager),
      can_review: state.etapa_actual === "revision_gerente" && access.isManager,
      can_assign_closer: state.etapa_actual === "asignacion_cerrador" && access.isManager,
    },
  };
}

export async function listWorkflowTimeline(_supabase, actorId, prospectId) {
  const access = await loadAccess(actorId, prospectId);
  const workflow = await ensureWorkflow(access, actorId);
  assertWorkflowVisibility(access, workflow, actorId);
  const { data, error } = await access.admin
    .from("prospect_workflow_events")
    .select("id, prospect_id, actor_id, actor_role, event_type, etapa_origen, etapa_destino, metadata, created_at, actor:profiles(full_name, email)")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}

async function toolExists(admin, prospectId, tool) {
  const { data } = await admin
    .from("tool_calculations")
    .select("id")
    .eq("prospect_id", prospectId)
    .eq("tool", tool)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

async function transition(access, actorId, workflow, nextStage, eventType, metadata = {}) {
  const { data, error } = await access.admin.rpc("transition_prospect_workflow", {
    p_prospect_id: workflow.prospect_id,
    p_actor_id: actorId,
    p_expected_stage: workflow.etapa_actual,
    p_next_stage: nextStage,
    p_event_type: eventType,
    p_actor_role: access.roleSlug,
    p_metadata: metadata,
  });
  if (error) throw new ServiceError(error.message, 409);
  return data;
}

export async function advanceWorkflow(_supabase, actorId, prospectId, body = {}) {
  const access = await loadAccess(actorId, prospectId);
  const workflow = await ensureWorkflow(access, actorId);
  const current = workflow.etapa_actual;
  const next = NEXT_STAGE[current];
  if (!next) throw new ServiceError("Esta etapa requiere una acción gerencial específica.", 409);

  const representativeStage = ["representante", "survey", "worksheet"].includes(current);
  const closerStage = ["money_box", "tipo_cambio", "venta"].includes(current);
  if (
    representativeStage
    && workflow.representante_id !== actorId
    && !access.isManager
    && !access.permissions.has("workflow:avanzar")
  ) {
    throw new ServiceError("Solo el representante asignado puede avanzar esta etapa.", 403);
  }
  if (closerStage && workflow.cerrador_id !== actorId && !access.isManager) {
    throw new ServiceError("Solo el cerrador asignado puede avanzar esta etapa.", 403);
  }

  if (current === "survey" && !(await toolExists(access.admin, prospectId, "survey"))) {
    throw new ServiceError("Completa Survey antes de avanzar.", 409);
  }
  if (current === "worksheet" && !(await toolExists(access.admin, prospectId, "worksheet"))) {
    throw new ServiceError("Completa Worksheet antes de avanzar.", 409);
  }
  if (current === "money_box" && !(await toolExists(access.admin, prospectId, "worksheet"))) {
    throw new ServiceError("Completa Money Box antes de avanzar.", 409);
  }
  if (current === "tipo_cambio" && !body?.exchange_rate) {
    throw new ServiceError("Registra el tipo de cambio utilizado.", 409);
  }

  let metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : {};
  if (current === "tipo_cambio") {
    metadata = { ...metadata, exchange_rate: body.exchange_rate };
  }
  if (current === "venta") {
    const { data: sale } = await access.admin
      .from("sales")
      .select("*")
      .eq("prospect_id", prospectId)
      .eq("workspace_id", access.prospect.workspace_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sale) throw new ServiceError("Registra la venta antes de completar el workflow.", 409);
    metadata = { ...metadata, sale };
  }
  return transition(access, actorId, workflow, next, "etapa_completada", metadata);
}

export async function sendToManager(_supabase, actorId, prospectId, body = {}) {
  const access = await loadAccess(actorId, prospectId);
  const workflow = await ensureWorkflow(access, actorId);
  if (workflow.etapa_actual !== "proyeccion") {
    throw new ServiceError("El expediente aún no está listo para revisión gerencial.", 409);
  }
  if (workflow.representante_id !== actorId && !access.isManager) {
    throw new ServiceError("Solo el representante puede enviar a revisión.", 403);
  }
  if (!(await toolExists(access.admin, prospectId, "vacaciones"))) {
    throw new ServiceError("Completa la Proyección de Vacaciones antes de enviar.", 409);
  }
  return transition(
    access,
    actorId,
    workflow,
    "revision_gerente",
    "enviado_a_revision",
    { comentario: String(body?.comentario || "").trim() || null },
  );
}

export async function reviewWorkflow(_supabase, actorId, prospectId, body = {}) {
  const access = await loadAccess(actorId, prospectId);
  const workflow = await ensureWorkflow(access, actorId);
  if (!access.isManager) throw new ServiceError("Solo un gerente puede revisar.", 403);
  if (workflow.etapa_actual !== "revision_gerente") {
    throw new ServiceError("El expediente no está en revisión.", 409);
  }
  const approved = body?.decision === "aprobar";
  if (!approved && body?.decision !== "devolver") {
    throw new ServiceError("Decisión inválida: aprobar o devolver.", 400);
  }
  const next = approved ? "asignacion_cerrador" : "proyeccion";
  return transition(
    access,
    actorId,
    workflow,
    next,
    approved ? "revision_aprobada" : "devuelto",
    { comentario: String(body?.comentario || "").trim() || null },
  );
}

export async function assignCloser(_supabase, actorId, prospectId, closerId) {
  const access = await loadAccess(actorId, prospectId);
  const workflow = await ensureWorkflow(access, actorId);
  if (!access.isManager) throw new ServiceError("Solo un gerente puede asignar Cerrador.", 403);
  if (workflow.etapa_actual !== "asignacion_cerrador") {
    throw new ServiceError("El expediente no está listo para asignación.", 409);
  }
  const { data: member } = await access.admin
    .from("workspace_miembros")
    .select("usuario_id, role_id, roles(slug)")
    .eq("workspace_id", access.prospect.workspace_id)
    .eq("usuario_id", closerId)
    .maybeSingle();
  if (!member) throw new ServiceError("El Cerrador debe pertenecer a la misma sala.", 400);
  const { data: permissionKeys } = await access.admin.rpc("effective_workspace_permissions", {
    p_usuario_id: closerId,
    p_workspace_id: access.prospect.workspace_id,
  });
  if (
    member.roles?.slug !== "cerrador"
    && !(Array.isArray(permissionKeys) && permissionKeys.includes("workflow:cerrar"))
  ) {
    throw new ServiceError("El usuario seleccionado no tiene capacidad de Cerrador.", 400);
  }
  const { data, error } = await access.admin.rpc("assign_prospect_closer", {
    p_prospect_id: prospectId,
    p_actor_id: actorId,
    p_cerrador_id: closerId,
    p_actor_role: access.roleSlug || "gerente",
  });
  if (error) throw new ServiceError(error.message, 409);
  return data;
}

export async function listWorkflowInbox(supabase, actorId) {
  const workspaceId = await getRequestWorkspaceId(supabase, actorId);
  if (!workspaceId) throw new ServiceError("Workspace activo requerido.", 403);
  const admin = adminClient();
  const { data: member } = await admin
    .from("workspace_miembros")
    .select("rol_en_workspace, roles(slug)")
    .eq("workspace_id", workspaceId)
    .eq("usuario_id", actorId)
    .maybeSingle();
  if (!member) throw new ServiceError("No perteneces a esta sala.", 403);
  const { data: permissionKeys } = await admin.rpc("effective_workspace_permissions", {
    p_usuario_id: actorId,
    p_workspace_id: workspaceId,
  });
  const permissions = new Set(Array.isArray(permissionKeys) ? permissionKeys : []);

  let query = admin
    .from("prospect_workflows")
    .select("*, prospects(id, name, name1, prospect_code, status), representante:profiles!prospect_workflows_representante_id_fkey(full_name), cerrador:profiles!prospect_workflows_cerrador_id_fkey(full_name)")
    .eq("workspace_id", workspaceId)
    .neq("estado", "completado")
    .order("updated_at", { ascending: false });
  if (member.rol_en_workspace !== "gerente" && !permissions.has("workflow:revisar")) {
    query = member.roles?.slug === "cerrador" || permissions.has("workflow:cerrar")
      ? query.eq("cerrador_id", actorId)
      : query.eq("representante_id", actorId);
  }
  const { data, error } = await query;
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}
