/**
 * Defensa en profundidad API: mismo predicado que RLS / user_can_access_prospect.
 */
import { createServiceSupabaseClient } from "../../../lib/supabase-server.js";
import {
  isVisibilityException,
  canViewProspectByPredicate,
  workflowAssignmentOrFilter,
  WORKFLOW_PERSON_COLUMNS,
} from "../dominio/visibilidad-expediente.js";

function adminClient() {
  return createServiceSupabaseClient();
}

/**
 * @returns {Promise<{
 *   exception: boolean,
 *   isSuperAdmin: boolean,
 *   rolEnWorkspace: string | null,
 *   roleSlug: string | null,
 *   esAdminEmpresa: boolean,
 * }>}
 */
export async function loadVisibilityActor(supabase, userId, workspaceId) {
  const admin = adminClient() || supabase;
  const [{ data: profile }, { data: member }, { data: ws }] = await Promise.all([
    admin.from("profiles").select("is_super_admin").eq("id", userId).maybeSingle(),
    admin
      .from("workspace_miembros")
      .select("rol_en_workspace, roles(slug)")
      .eq("workspace_id", workspaceId)
      .eq("usuario_id", userId)
      .maybeSingle(),
    admin.from("workspaces").select("empresa_id").eq("id", workspaceId).maybeSingle(),
  ]);

  let esAdminEmpresa = false;
  if (ws?.empresa_id) {
    const { data: em } = await admin
      .from("empresa_miembros")
      .select("es_admin")
      .eq("empresa_id", ws.empresa_id)
      .eq("usuario_id", userId)
      .maybeSingle();
    esAdminEmpresa = em?.es_admin === true;
  }

  const actor = {
    isSuperAdmin: profile?.is_super_admin === true,
    rolEnWorkspace: member?.rol_en_workspace ?? null,
    roleSlug: member?.roles?.slug ?? null,
    esAdminEmpresa,
  };
  return { ...actor, exception: isVisibilityException(actor) };
}

/** Ids de prospectos asignados al actor en el workspace (cualquier columna persona). */
export async function listAssignedProspectIds(supabase, userId, workspaceId) {
  const admin = adminClient() || supabase;
  const { data, error } = await admin
    .from("prospect_workflows")
    .select(`prospect_id, ${WORKFLOW_PERSON_COLUMNS.join(", ")}`)
    .eq("workspace_id", workspaceId)
    .or(workflowAssignmentOrFilter(userId))
    .neq("estado", "cancelado");
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.prospect_id).filter(Boolean))];
}

/** Ids de expedientes de los que el actor es dueño (user_id) en el workspace. */
export async function listOwnedProspectIds(supabase, userId, workspaceId) {
  const admin = adminClient() || supabase;
  const { data, error } = await admin
    .from("prospects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.id).filter(Boolean);
}

/** Ids visibles para pull sync (sin excepción): dueño ∪ asignación ∪ share. */
export async function resolveSyncPullVisibility(supabase, userId, workspaceId, teamScope) {
  if (!teamScope || !workspaceId) {
    return { visibilityException: true, visibleProspectIds: null };
  }
  const visibility = await loadVisibilityActor(supabase, userId, workspaceId);
  if (visibility.exception) {
    return { visibilityException: true, visibleProspectIds: null };
  }
  const [assignedIds, sharedIds, ownedIds] = await Promise.all([
    listAssignedProspectIds(supabase, userId, workspaceId),
    listSharedProspectIds(supabase, userId, workspaceId),
    listOwnedProspectIds(supabase, userId, workspaceId),
  ]);
  const visibleProspectIds = [...new Set([...assignedIds, ...sharedIds, ...ownedIds])];
  return { visibilityException: false, visibleProspectIds };
}

/** Ids compartidos con el actor en el workspace. */
export async function listSharedProspectIds(supabase, userId, workspaceId) {
  const admin = adminClient() || supabase;
  const { data, error } = await admin
    .from("prospect_shares")
    .select("prospect_id, prospects!inner(workspace_id)")
    .eq("shared_with_id", userId)
    .eq("prospects.workspace_id", workspaceId);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.prospect_id).filter(Boolean))];
}

/**
 * ¿Puede el actor ver este expediente? (defense in depth; no confiar solo en RLS).
 */
export async function actorCanViewProspect(supabase, userId, workspaceId, prospectId) {
  const admin = adminClient() || supabase;
  const visibility = await loadVisibilityActor(admin, userId, workspaceId);
  if (visibility.exception) return true;

  const { data: prospect } = await admin
    .from("prospects")
    .select("id, user_id, workspace_id")
    .eq("id", prospectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!prospect) return false;
  if (prospect.user_id === userId) return true;

  const [{ data: workflow }, { data: share }] = await Promise.all([
    admin
      .from("prospect_workflows")
      .select(WORKFLOW_PERSON_COLUMNS.join(", "))
      .eq("prospect_id", prospectId)
      .maybeSingle(),
    admin
      .from("prospect_shares")
      .select("prospect_id")
      .eq("prospect_id", prospectId)
      .eq("shared_with_id", userId)
      .maybeSingle(),
  ]);

  return canViewProspectByPredicate(userId, prospect, workflow, {
    shared: !!share,
  });
}

export { workflowAssignmentOrFilter, WORKFLOW_PERSON_COLUMNS };
