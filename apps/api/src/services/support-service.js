import { ServiceError } from "../lib/service-error.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { reportServerIssue } from "../lib/observability.js";
import { sendSupportTicketEmail } from "./support-email.js";
import {
  SUPPORT_AREA_IDS,
  SUPPORT_REQUEST_TYPE_IDS,
  SUPPORT_REQUEST_TYPES,
  findSupportAreaOption,
} from "@salesapp/shared/support/site-map.js";

const MAX_DESCRIPTION = 1500;
const MIN_DESCRIPTION = 10;
/** Post-compresión en cliente; margen de seguridad. */
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const BUCKET = "soporte-adjuntos";
const LEGACY_BUCKET = "support-screenshots";
/** Signed URL para email (~7 días). */
const EMAIL_SIGNED_TTL_SEC = 60 * 60 * 24 * 7;
/** Signed URL corta para panel admin. */
const ADMIN_SIGNED_TTL_SEC = 60 * 30;
/** Retención: adjuntos de tickets resueltos/cerrados con más de N días. */
const RETENTION_DAYS = 90;

function extForMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function decodeDataUrl(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(raw);
  if (!match) throw new ServiceError("Captura inválida. Usa PNG, JPG o WEBP.", 400);
  const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) throw new ServiceError("Captura vacía.", 400);
  if (buffer.length > MAX_SCREENSHOT_BYTES) {
    throw new ServiceError("La captura supera el máximo de 5 MB.", 400);
  }
  return { mime, buffer };
}

function requestTypeLabel(id, lang = "es") {
  const row = SUPPORT_REQUEST_TYPES.find((t) => t.id === id);
  if (!row) return id;
  return lang === "en" ? row.labelEn : row.labelEs;
}

function parseAppArea(stored) {
  const raw = String(stored || "");
  const pipe = raw.indexOf("|");
  if (pipe === -1) return { id: raw, label: raw };
  return { id: raw.slice(0, pipe), label: raw.slice(pipe + 1) };
}

function isMissingColumnError(error, column) {
  const msg = String(error?.message || error || "");
  return msg.includes(`support_requests.${column}`) || msg.includes(`column ${column}`) || msg.includes(`'${column}'`);
}

function resolveAppAreaLabel(row) {
  if (row?.app_area_label) return row.app_area_label;
  const parsed = parseAppArea(row?.app_area);
  const opt = findSupportAreaOption(parsed.id, "es");
  return opt?.pathLabel || parsed.label || parsed.id || "";
}

const SUPPORT_LIST_SELECT_FULL =
  "id, user_id, request_type, app_area, app_area_label, platform, description, screenshot_path, screenshot_purged_at, status, created_at, updated_at";
const SUPPORT_LIST_SELECT_BASE =
  "id, user_id, request_type, app_area, platform, description, screenshot_path, status, created_at, updated_at";

async function createSignedUrl(serviceSb, path, expiresIn) {
  if (!path || !serviceSb) return null;
  const buckets = [BUCKET, LEGACY_BUCKET];
  for (const bucket of buckets) {
    const { data, error } = await serviceSb.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}

async function loadReporterProfile(supabase, userId) {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return data || { full_name: null, email: null };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId
 * @param {Record<string, unknown>} body
 */
export async function createSupportRequest(supabase, userId, body = {}) {
  const requestType = String(body.request_type ?? body.requestType ?? "").trim();
  const appArea = String(body.app_area ?? body.appArea ?? "").trim();
  let appAreaLabel = String(body.app_area_label ?? body.appAreaLabel ?? "").trim();
  const platform = String(body.platform ?? "").trim().toLowerCase();
  const description = String(body.description ?? "").trim();
  const userAgent = body.user_agent ?? body.userAgent ?? null;
  const appVersion = body.app_version ?? body.appVersion ?? null;
  const screenshotDataUrl = body.screenshot_data_url ?? body.screenshotDataUrl ?? null;

  if (!SUPPORT_REQUEST_TYPE_IDS.has(requestType)) {
    throw new ServiceError("Tipo de solicitud no válido.", 400);
  }
  if (!SUPPORT_AREA_IDS.has(appArea)) {
    throw new ServiceError("Área de la app no válida.", 400);
  }
  if (platform !== "web" && platform !== "mobile") {
    throw new ServiceError("Plataforma no válida.", 400);
  }
  if (description.length < MIN_DESCRIPTION) {
    throw new ServiceError(`Describe el problema con al menos ${MIN_DESCRIPTION} caracteres.`, 400);
  }
  if (description.length > MAX_DESCRIPTION) {
    throw new ServiceError(`La descripción no puede superar ${MAX_DESCRIPTION} caracteres.`, 400);
  }

  if (!appAreaLabel) {
    const opt = findSupportAreaOption(appArea, "es");
    appAreaLabel = opt?.pathLabel || appArea;
  }

  let screenshotPath = null;
  if (screenshotDataUrl) {
    try {
      const { mime, buffer } = decodeDataUrl(screenshotDataUrl);
      if (!ALLOWED_MIME.has(mime)) {
        throw new ServiceError("Formato de captura no soportado.", 400);
      }
      const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${extForMime(mime)}`;
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: mime, upsert: false });
      if (uploadErr) {
        await reportServerIssue("upload_failed", {
          message: uploadErr.message,
          userId,
          error: uploadErr,
        });
        throw new ServiceError(uploadErr.message || "No se pudo subir la captura.", 400);
      }
      screenshotPath = path;
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      await reportServerIssue("upload_failed", {
        message: err instanceof Error ? err.message : String(err),
        userId,
        error: err,
      });
      throw new ServiceError("No se pudo procesar la captura.", 400);
    }
  }

  const baseRow = {
    user_id: userId,
    request_type: requestType,
    app_area: appArea,
    platform,
    description,
    screenshot_path: screenshotPath,
    user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
    app_version: appVersion ? String(appVersion).slice(0, 80) : null,
  };

  let data = null;
  let error = null;
  ({ data, error } = await supabase
    .from("support_requests")
    .insert({ ...baseRow, app_area_label: appAreaLabel.slice(0, 200) })
    .select("id, created_at, status, app_area, app_area_label, request_type, platform, screenshot_path")
    .single());

  // Compat: BD sin migración 0035 (columna app_area_label).
  if (error && isMissingColumnError(error, "app_area_label")) {
    ({ data, error } = await supabase
      .from("support_requests")
      .insert(baseRow)
      .select("id, created_at, status, app_area, request_type, platform, screenshot_path")
      .single());
  }

  if (error) {
    if (screenshotPath) {
      await supabase.storage.from(BUCKET).remove([screenshotPath]).catch(() => {});
    }
    throw new ServiceError(error.message, 400);
  }

  // Email es best-effort: el ticket ya existe en admin.
  const serviceSb = createServiceSupabaseClient() || supabase;
  const profile = await loadReporterProfile(supabase, userId);
  const signedForEmail = screenshotPath
    ? await createSignedUrl(serviceSb, screenshotPath, EMAIL_SIGNED_TTL_SEC)
    : null;

  void sendSupportTicketEmail({
    ticketId: data.id,
    requestTypeLabel: requestTypeLabel(requestType),
    appAreaLabel: data.app_area_label || appAreaLabel,
    description,
    platform,
    userName: profile.full_name,
    userEmail: profile.email,
    screenshotSignedUrl: signedForEmail,
  });

  return {
    id: data.id,
    created_at: data.created_at,
    status: data.status,
    email_queued: true,
  };
}

/**
 * Lista tickets para el panel admin (con signed URL de captura si existe).
 */
export async function listSupportRequestsForAdmin(supabase, { status, limit = 50, offset = 0 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const skip = Math.max(Number(offset) || 0, 0);

  const buildQuery = (columns) => {
    let q = supabase
      .from("support_requests")
      .select(columns, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(skip, skip + take - 1);
    if (status && status !== "all") q = q.eq("status", status);
    return q;
  };

  let { data, error, count } = await buildQuery(SUPPORT_LIST_SELECT_FULL);
  if (
    error &&
    (isMissingColumnError(error, "app_area_label") || isMissingColumnError(error, "screenshot_purged_at"))
  ) {
    ({ data, error, count } = await buildQuery(SUPPORT_LIST_SELECT_BASE));
  }
  if (error) throw new ServiceError(error.message, 500);

  const rows = data || [];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  let profilesById = {};
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    profilesById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  }

  const serviceSb = createServiceSupabaseClient() || supabase;
  const items = [];
  for (const row of rows) {
    const profile = profilesById[row.user_id] || {};
    const area = resolveAppAreaLabel(row);
    let screenshotUrl = null;
    if (row.screenshot_path && !row.screenshot_purged_at) {
      screenshotUrl = await createSignedUrl(serviceSb, row.screenshot_path, ADMIN_SIGNED_TTL_SEC);
    }
    items.push({
      id: row.id,
      request_type: row.request_type,
      request_type_label: requestTypeLabel(row.request_type),
      app_area: row.app_area,
      app_area_label: area,
      platform: row.platform,
      description: row.description,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      screenshot_available: Boolean(row.screenshot_path && !row.screenshot_purged_at),
      screenshot_purged: Boolean(row.screenshot_purged_at),
      screenshot_url: screenshotUrl,
      user: {
        id: row.user_id,
        name: profile.full_name || profile.email || "Usuario",
        email: profile.email || null,
      },
    });
  }

  return { items, total: count ?? items.length, limit: take, offset: skip };
}

export async function updateSupportRequestStatus(supabase, ticketId, status, actorId = null) {
  const allowed = new Set(["open", "in_progress", "resolved", "closed"]);
  const next = String(status || "").trim();
  if (!allowed.has(next)) throw new ServiceError("Estado no válido.", 400);

  const { data: before } = await supabase
    .from("support_requests")
    .select("id, status, user_id")
    .eq("id", ticketId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("support_requests")
    .update({ status: next })
    .eq("id", ticketId)
    .select("id, status, updated_at, user_id")
    .maybeSingle();

  if (error) throw new ServiceError(error.message, 400);
  if (!data) throw new ServiceError("Ticket no encontrado.", 404);

  if (actorId && before?.status !== next) {
    try {
      const { ADMIN_AUDIT_ACTIONS, writeAdminLog } = await import("./admin-audit-service.js");
      await writeAdminLog(supabase, {
        actorId,
        accion: ADMIN_AUDIT_ACTIONS.CAMBIO_ESTADO_TICKET,
        entidadAfectada: "ticket",
        entidadId: ticketId,
        detalle: { de: before?.status ?? null, a: next, reporter_id: data.user_id },
      });
    } catch (err) {
      console.warn("[support] audit status:", err instanceof Error ? err.message : err);
    }
  }
  return data;
}

/**
 * Responde un ticket: guarda reply, notifica al reportero y registra log.
 */
export async function replyToSupportRequest(supabase, ticketId, { actorId, cuerpo }) {
  const body = String(cuerpo || "").trim();
  if (!actorId) throw new ServiceError("Autor requerido.", 400);
  if (body.length < 1 || body.length > 4000) {
    throw new ServiceError("La respuesta debe tener entre 1 y 4000 caracteres.", 400);
  }

  const { data: ticket, error: tErr } = await supabase
    .from("support_requests")
    .select("id, user_id, status, request_type, description")
    .eq("id", ticketId)
    .maybeSingle();
  if (tErr) throw new ServiceError(tErr.message, 500);
  if (!ticket) throw new ServiceError("Ticket no encontrado.", 404);

  const { data: reply, error } = await supabase
    .from("support_request_replies")
    .insert({
      ticket_id: ticketId,
      autor_id: actorId,
      cuerpo: body,
    })
    .select("id, ticket_id, autor_id, cuerpo, created_at")
    .single();
  if (error) throw new ServiceError(error.message, 400);

  // Si estaba abierto, pasar a en progreso
  if (ticket.status === "open") {
    await supabase.from("support_requests").update({ status: "in_progress" }).eq("id", ticketId);
  }

  try {
    const { ADMIN_AUDIT_ACTIONS, writeAdminLog } = await import("./admin-audit-service.js");
    await writeAdminLog(supabase, {
      actorId,
      accion: ADMIN_AUDIT_ACTIONS.RESPUESTA_TICKET_SOPORTE,
      entidadAfectada: "ticket",
      entidadId: ticketId,
      detalle: {
        reply_id: reply.id,
        reporter_id: ticket.user_id,
        fragmento: body.slice(0, 160),
      },
    });
  } catch (err) {
    console.warn("[support] audit reply:", err instanceof Error ? err.message : err);
  }

  try {
    const { notifySupportReply } = await import("./push-notifications-service.js");
    await notifySupportReply(ticket.user_id, {
      ticketId,
      replyId: reply.id,
      cuerpo: body,
    });
  } catch (err) {
    console.warn("[support] notify reply:", err instanceof Error ? err.message : err);
  }

  return reply;
}

export async function listSupportReplies(supabase, ticketId) {
  const { data, error } = await supabase
    .from("support_request_replies")
    .select("id, ticket_id, autor_id, cuerpo, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}

/**
 * Elimina objetos de Storage de tickets resueltos/cerrados antiguos.
 * Conserva el registro del ticket; solo libera espacio de imagen.
 */
export async function cleanupExpiredSupportAttachments({ limit = 80 } = {}) {
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb) {
    return { ok: false, reason: "no_service_role", purged: 0 };
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await serviceSb
    .from("support_requests")
    .select("id, screenshot_path")
    .in("status", ["resolved", "closed"])
    .not("screenshot_path", "is", null)
    .is("screenshot_purged_at", null)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(Math.min(Math.max(Number(limit) || 80, 1), 200));

  if (error) {
    await reportServerIssue("cleanup_list_failed", { message: error.message, error });
    throw new ServiceError(error.message, 500);
  }

  const rows = data || [];
  let purged = 0;
  for (const row of rows) {
    const path = row.screenshot_path;
    if (!path) continue;
    const removePrimary = await serviceSb.storage.from(BUCKET).remove([path]);
    const removeLegacy = await serviceSb.storage.from(LEGACY_BUCKET).remove([path]);
    if (removePrimary.error && removeLegacy.error) {
      await reportServerIssue("cleanup_remove_failed", {
        message: removePrimary.error.message || removeLegacy.error.message,
        ticketId: row.id,
        path,
      });
      continue;
    }
    const { error: updErr } = await serviceSb
      .from("support_requests")
      .update({ screenshot_purged_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updErr) {
      await reportServerIssue("cleanup_mark_failed", {
        message: updErr.message,
        ticketId: row.id,
      });
      continue;
    }
    purged += 1;
  }

  return { ok: true, scanned: rows.length, purged, retention_days: RETENTION_DAYS };
}
