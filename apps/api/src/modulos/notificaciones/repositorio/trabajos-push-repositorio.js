/**
 * Persistencia de scheduled_push_jobs. Columnas y status — contrato BD.
 */
import { ServiceError } from "../../../lib/service-error.js";
import { logger } from "../../../lib/logger.js";

export async function cancelarTrabajosPendientesPorEntry(serviceSb, userId, entryKey) {
  await serviceSb
    .from("scheduled_push_jobs")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .eq("entry_key", entryKey)
    .eq("status", "pending");
}

export async function insertarTrabajoPush(serviceSb, row) {
  const { data: job, error: insertErr } = await serviceSb
    .from("scheduled_push_jobs")
    .insert(row)
    .select("id, send_at")
    .single();
  if (insertErr) {
    throw new ServiceError(insertErr.message || "No se pudo encolar el aviso.", 400);
  }
  return job;
}

export async function actualizarTrabajoPush(serviceSb, jobId, patch) {
  await serviceSb.from("scheduled_push_jobs").update(patch).eq("id", jobId);
}

export async function listarTrabajosVencidos(serviceSb, { limit, userId, nowIso }) {
  let query = serviceSb
    .from("scheduled_push_jobs")
    .select("id, user_id, push_type, title, body, path, tag, attempts")
    .eq("status", "pending")
    .lte("send_at", nowIso)
    .order("send_at", { ascending: true })
    .limit(Math.min(Math.max(Number(limit) || 40, 1), 100));

  if (userId) query = query.eq("user_id", userId);

  const { data: jobs, error } = await query;
  if (error) {
    logger.warn("[scheduled-push] flush select", { message: error.message });
    return { error: error.message, jobs: null };
  }
  return { jobs: jobs ?? [], error: null };
}
