/**
 * Predicado de visibilidad Etapa 1 (D1–D5), espejo de SQL:
 * excepción (gerente/asistente/es_admin/superadmin) ∨ dueño ∨ asignación workflow ∨ share.
 * NUNCA usa expedientes:ver_equipo como excepción.
 */

/** Columnas de persona en prospect_workflows (core + collab 0093). */
export const WORKFLOW_PERSON_COLUMNS = [
  "gerente_id",
  "representante_id",
  "cerrador_id",
  "hostes_id",
  "filtro_id",
  "opc_id",
  "liner_id",
  "ftb_id",
  "inhouse_closer1_id",
  "inhouse_closer2_id",
  "imagen_id",
  "self_gen_id",
  "members_closer1_id",
  "members_closer2_id",
];

/**
 * @param {{
 *   isSuperAdmin?: boolean,
 *   rolEnWorkspace?: string | null,
 *   roleSlug?: string | null,
 *   esAdminEmpresa?: boolean,
 * }} actor
 */
export function isVisibilityException(actor = {}) {
  if (actor.isSuperAdmin === true) return true;
  if (actor.esAdminEmpresa === true) return true;
  if (actor.rolEnWorkspace === "gerente") return true;
  const slug = actor.roleSlug || null;
  return slug === "gerente" || slug === "asistente_sala" || slug === "asistente_empresa";
}

/**
 * @param {string} userId
 * @param {{ user_id?: string | null } | null} prospect
 * @param {Record<string, unknown> | null} workflow
 * @param {{ shared?: boolean }} [opts]
 */
export function canViewProspectByPredicate(userId, prospect, workflow, opts = {}) {
  if (!userId || !prospect) return false;
  if (opts.exception === true) return true;
  if (prospect.user_id === userId) return true;
  if (opts.shared === true) return true;
  if (!workflow) return false;
  return WORKFLOW_PERSON_COLUMNS.some((col) => workflow[col] === userId);
}

/** Filtro PostgREST .or() sobre columnas de persona del workflow. */
export function workflowAssignmentOrFilter(userId) {
  return WORKFLOW_PERSON_COLUMNS.map((col) => `${col}.eq.${userId}`).join(",");
}
