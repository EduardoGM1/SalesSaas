/**
 * Archivos del expediente: listado, subida (data URL) y borrado.
 * Storage privado vía service-role; metadatos en prospect_archivos.
 */
import { randomUUID } from "node:crypto";
import { isUuid } from "@salesapp/shared/data/mappers.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";

const BUCKET = "prospect-files";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_PROSPECT = 30;
const SIGNED_TTL_SEC = 60 * 30;
const ALLOWED_MIME = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/webp", "webp"],
  ["application/pdf", "pdf"],
  ["application/msword", "doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/vnd.ms-excel", "xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  ["text/plain", "txt"],
]);

function adminClient() {
  const client = createServiceSupabaseClient();
  if (!client) throw new ServiceError("Service role no configurado.", 500);
  return client;
}

function sanitizeFileName(name) {
  const base = String(name || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\- ()\[\]]+/g, "_")
    .trim()
    .slice(0, 120);
  return base || "archivo";
}

function assertMagicBytes(mime, buffer) {
  if (mime === "application/pdf" && buffer.slice(0, 5).toString("ascii") !== "%PDF-") {
    throw new ServiceError("El contenido no coincide con un PDF válido.", 400);
  }
  if (mime === "image/png" && !(buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)) {
    throw new ServiceError("El contenido no coincide con una imagen PNG válida.", 400);
  }
  if (mime === "image/jpeg" && !(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)) {
    throw new ServiceError("El contenido no coincide con una imagen JPEG válida.", 400);
  }
  if (mime === "image/webp" && buffer.slice(0, 4).toString("ascii") !== "RIFF") {
    throw new ServiceError("El contenido no coincide con una imagen WEBP válida.", 400);
  }
}

function decodeDataUrl(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(raw);
  if (!match) throw new ServiceError("Archivo inválido. Envía un data URL en base64.", 400);
  const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    throw new ServiceError("Formato no soportado. Usa PDF, imagen, Word, Excel o texto.", 400);
  }
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) throw new ServiceError("Archivo vacío.", 400);
  if (buffer.length > MAX_BYTES) throw new ServiceError("El archivo supera el máximo de 10 MB.", 400);
  assertMagicBytes(mime, buffer);
  return { mime, buffer, ext: ALLOWED_MIME.get(mime) };
}

async function assertProspectAccess(admin, actorId, prospectId, { forWrite = false } = {}) {
  const { data: prospect, error } = await admin
    .from("prospects")
    .select("id, user_id, workspace_id, workspaces(tipo, empresa_id)")
    .eq("id", prospectId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  assertFound(prospect, "Expediente no encontrado.");

  const [{ data: profile }, { data: member }, { data: workflow }] = await Promise.all([
    admin.from("profiles").select("is_super_admin").eq("id", actorId).maybeSingle(),
    admin
      .from("workspace_miembros")
      .select("rol_en_workspace")
      .eq("workspace_id", prospect.workspace_id)
      .eq("usuario_id", actorId)
      .maybeSingle(),
    admin
      .from("prospect_workflows")
      .select("cerrador_id, representante_id")
      .eq("prospect_id", prospectId)
      .maybeSingle(),
  ]);

  const isSuper = profile?.is_super_admin === true;
  const isOwner = prospect.user_id === actorId;
  const isManager = member?.rol_en_workspace === "gerente";
  const isCloser = workflow?.cerrador_id === actorId;
  const isRep = workflow?.representante_id === actorId;
  const inWorkspace = Boolean(member) || isSuper;
  const canWrite = isSuper || isOwner || isManager || isCloser || isRep;

  if (!isSuper && !inWorkspace && !isOwner) {
    const { data: share } = await admin
      .from("prospect_shares")
      .select("id")
      .eq("prospect_id", prospectId)
      .eq("shared_with_id", actorId)
      .maybeSingle();
    if (!share) throw new ServiceError("No puedes acceder a este expediente.", 403);
    if (forWrite) throw new ServiceError("Tu permiso compartido no permite subir archivos.", 403);
  }

  // Escritura solo para participantes del expediente (no cualquier miembro de sala).
  if (forWrite && !canWrite) {
    throw new ServiceError("No puedes subir archivos a este expediente.", 403);
  }

  return { prospect, isOwner, isManager, isCloser, isRep, isSuper, canWrite };
}

async function withSignedUrl(admin, row) {
  const { data } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_TTL_SEC);
  return {
    id: row.id,
    prospect_id: row.prospect_id,
    nombre: row.nombre,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    uploaded_by: row.uploaded_by,
    uploader_name: row.uploader?.full_name || row.uploader?.email || null,
    created_at: row.created_at,
    url: data?.signedUrl || null,
  };
}

/** Lista adjuntos del expediente con URL firmada temporal. */
export async function listProspectFiles(_supabase, actorId, prospectId) {
  if (!isUuid(prospectId)) throw new ServiceError("Expediente inválido.");
  const admin = adminClient();
  await assertProspectAccess(admin, actorId, prospectId);

  const { data, error } = await admin
    .from("prospect_archivos")
    .select("id, prospect_id, nombre, mime_type, size_bytes, uploaded_by, storage_path, created_at, uploader:profiles!prospect_archivos_uploaded_by_fkey(full_name, email)")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false });
  if (error) throw new ServiceError(error.message, 500);

  return Promise.all((data || []).map((row) => withSignedUrl(admin, row)));
}

/** Sube un adjunto (data URL base64) al expediente. */
export async function uploadProspectFile(_supabase, actorId, prospectId, body = {}) {
  if (!isUuid(prospectId)) throw new ServiceError("Expediente inválido.");
  const admin = adminClient();
  const { prospect, isManager, isCloser } = await assertProspectAccess(
    admin,
    actorId,
    prospectId,
    { forWrite: true },
  );

  const { count } = await admin
    .from("prospect_archivos")
    .select("id", { count: "exact", head: true })
    .eq("prospect_id", prospectId);
  if ((count ?? 0) >= MAX_FILES_PER_PROSPECT) {
    throw new ServiceError(`Máximo ${MAX_FILES_PER_PROSPECT} archivos por expediente.`, 400);
  }

  const { mime, buffer, ext } = decodeDataUrl(body.data_url ?? body.dataUrl);
  const nombre = sanitizeFileName(body.nombre || body.name || `archivo.${ext}`);
  const storagePath = `${prospect.workspace_id}/${prospectId}/${Date.now()}-${randomUUID()}.${ext}`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (upErr) {
    if (/bucket|not found|does not exist/i.test(upErr.message || "")) {
      throw new ServiceError("Bucket prospect-files no existe. Aplica la migración 0058.", 503);
    }
    throw new ServiceError(upErr.message || "No se pudo subir el archivo.", 400);
  }

  const { data, error } = await admin
    .from("prospect_archivos")
    .insert({
      prospect_id: prospectId,
      workspace_id: prospect.workspace_id,
      uploaded_by: actorId,
      nombre,
      storage_path: storagePath,
      mime_type: mime,
      size_bytes: buffer.length,
    })
    .select("id, prospect_id, nombre, mime_type, size_bytes, uploaded_by, storage_path, created_at")
    .single();
  if (error) {
    await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw new ServiceError(error.message, 400);
  }

  await admin.from("prospect_workflow_events").insert({
    prospect_id: prospectId,
    workspace_id: prospect.workspace_id,
    actor_id: actorId,
    actor_role: isManager ? "gerente" : isCloser ? "cerrador" : "representante",
    event_type: "archivo_subido",
    etapa_origen: null,
    etapa_destino: null,
    metadata: { archivo_id: data.id, nombre },
  }).catch(() => {});

  return withSignedUrl(admin, { ...data, uploader: null });
}

/** Elimina un adjunto (subidor o gerente). */
export async function deleteProspectFile(_supabase, actorId, prospectId, fileId) {
  if (!isUuid(prospectId) || !isUuid(fileId)) throw new ServiceError("Identificador inválido.");
  const admin = adminClient();
  const { isManager, isSuper } = await assertProspectAccess(admin, actorId, prospectId, { forWrite: true });

  const { data: row, error } = await admin
    .from("prospect_archivos")
    .select("id, storage_path, uploaded_by, prospect_id, workspace_id, nombre")
    .eq("id", fileId)
    .eq("prospect_id", prospectId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  assertFound(row, "Archivo no encontrado.");

  if (!isSuper && !isManager && row.uploaded_by !== actorId) {
    throw new ServiceError("Solo el autor o el gerente pueden eliminar este archivo.", 403);
  }

  await admin.storage.from(BUCKET).remove([row.storage_path]).catch(() => {});
  const { error: delErr } = await admin
    .from("prospect_archivos")
    .delete()
    .eq("id", fileId)
    .eq("prospect_id", prospectId);
  if (delErr) throw new ServiceError(delErr.message, 400);

  await admin.from("prospect_workflow_events").insert({
    prospect_id: prospectId,
    workspace_id: row.workspace_id,
    actor_id: actorId,
    actor_role: isManager ? "gerente" : "representante",
    event_type: "archivo_eliminado",
    metadata: { archivo_id: fileId, nombre: row.nombre },
  }).catch(() => {});

  return { ok: true };
}
