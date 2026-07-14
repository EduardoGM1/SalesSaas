import { ServiceError } from "../lib/service-error.js";

const REQUEST_TYPES = new Set([
  "problem",
  "question",
  "suggestion",
  "account",
  "other",
]);

const APP_AREAS = new Set([
  "clients",
  "calendar",
  "sales",
  "network",
  "messages",
  "tools",
  "settings",
  "notifications",
  "other",
]);

const MAX_DESCRIPTION = 1000;
const MIN_DESCRIPTION = 10;
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

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
    throw new ServiceError("La captura supera el máximo de 10 MB.", 400);
  }
  return { mime, buffer };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId
 * @param {Record<string, unknown>} body
 */
export async function createSupportRequest(supabase, userId, body = {}) {
  const requestType = String(body.request_type ?? body.requestType ?? "").trim();
  const appArea = String(body.app_area ?? body.appArea ?? "").trim();
  const platform = String(body.platform ?? "").trim().toLowerCase();
  const description = String(body.description ?? "").trim();
  const userAgent = body.user_agent ?? body.userAgent ?? null;
  const appVersion = body.app_version ?? body.appVersion ?? null;
  const screenshotDataUrl = body.screenshot_data_url ?? body.screenshotDataUrl ?? null;

  if (!REQUEST_TYPES.has(requestType)) {
    throw new ServiceError("Tipo de solicitud no válido.", 400);
  }
  if (!APP_AREAS.has(appArea)) {
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

  let screenshotPath = null;
  if (screenshotDataUrl) {
    const { mime, buffer } = decodeDataUrl(screenshotDataUrl);
    if (!ALLOWED_MIME.has(mime)) {
      throw new ServiceError("Formato de captura no soportado.", 400);
    }
    const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${extForMime(mime)}`;
    const { error: uploadErr } = await supabase.storage
      .from("support-screenshots")
      .upload(path, buffer, { contentType: mime, upsert: false });
    if (uploadErr) {
      throw new ServiceError(uploadErr.message || "No se pudo subir la captura.", 400);
    }
    screenshotPath = path;
  }

  const { data, error } = await supabase
    .from("support_requests")
    .insert({
      user_id: userId,
      request_type: requestType,
      app_area: appArea,
      platform,
      description,
      screenshot_path: screenshotPath,
      user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
      app_version: appVersion ? String(appVersion).slice(0, 80) : null,
    })
    .select("id, created_at, status")
    .single();

  if (error) {
    if (screenshotPath) {
      await supabase.storage.from("support-screenshots").remove([screenshotPath]).catch(() => {});
    }
    throw new ServiceError(error.message, 400);
  }

  return data;
}
