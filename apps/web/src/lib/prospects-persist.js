/**
 * Única fuente de verdad para persistir expedientes vía REST.
 * Usado por cloud-persist, mirror, recovery y createProspectFromName.
 */
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { markOutboxDirty } from "@/lib/sync-outbox.js";
import { requestSyncPush } from "@/lib/sync-outbound.js";

const API = "/api/v1";

export function isCloudAvailable() {
  return (
    isSupabaseConfigured()
    && typeof navigator !== "undefined"
    && navigator.onLine
  );
}

export function prospectToApiBody(client) {
  return {
    id: client.id,
    prospectCode: client.prospectCode,
    name: client.name1 || client.name,
    name1: client.name1,
    name2: client.name2,
    occupation1: client.occupation1,
    occupation2: client.occupation2,
    city: client.city,
    country: client.country,
    phone: client.phone,
    email: client.email,
    contract: client.contract,
    status: client.status,
    tourDate: client.tourDate,
    processDate: client.processDate,
    processAmount: client.processAmount,
    note: client.note,
    tipo_tour: client.tipo_tour,
    tour_cuantificable: client.tour_cuantificable,
    completedExpedient: client.completedExpedient,
    quickExpedient: client.quickExpedient,
  };
}

export function prospectRowToClient(row, existing) {
  const base = existing || {
    data: { survey: {}, vacaciones: {}, worksheet: {} },
    sales: [],
    activities: [],
  };
  const updatedAt = row.updated_at
    ? Date.parse(row.updated_at) || base.updatedAt
    : row.created_at
      ? Date.parse(row.created_at) || base.updatedAt
      : base.updatedAt;
  return {
    ...base,
    id: row.id,
    prospectId: row.id,
    ownerUserId: row.user_id ?? base.ownerUserId,
    prospectCode: row.prospect_code ?? base.prospectCode,
    name: row.name ?? base.name,
    name1: row.name1 ?? base.name1,
    name2: row.name2 ?? base.name2,
    city: row.city ?? base.city,
    country: row.country ?? base.country,
    phone: row.phone ?? base.phone,
    email: row.email ?? base.email,
    contract: row.contract ?? base.contract,
    status: row.status ?? base.status,
    tourDate: row.tour_date ?? base.tourDate,
    processDate: row.process_date ?? base.processDate,
    processAmount: row.process_amount != null ? Number(row.process_amount) : base.processAmount,
    note: row.note ?? base.note,
    tipo_tour: row.tipo_tour ?? base.tipo_tour,
    tour_cuantificable: row.tour_cuantificable != null ? !!row.tour_cuantificable : base.tour_cuantificable,
    completedExpedient: row.completed != null ? !!row.completed : base.completedExpedient,
    quickExpedient: row.quick_expedient != null ? !!row.quick_expedient : base.quickExpedient,
    createdAt: row.created_at ? Date.parse(row.created_at) || base.createdAt : base.createdAt,
    updatedAt,
    createdYmd: row.created_at ? String(row.created_at).slice(0, 10) : base.createdYmd,
    date: row.created_at ? String(row.created_at).slice(0, 10) : base.date,
  };
}

async function apiJson(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(typeof json.error === "string" ? json.error : json.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

/** Crea expediente nuevo (POST). */
export async function persistProspectCreate(client) {
  const json = await apiJson("POST", "/prospects", prospectToApiBody(client));
  return json?.data ?? json;
}

/** Actualiza expediente existente (PATCH). */
export async function persistProspectUpdate(client) {
  const json = await apiJson("PATCH", `/prospects/${client.id}`, prospectToApiBody(client));
  return json?.data ?? json;
}

/** Crea o actualiza según existencia remota. */
export async function persistProspectUpsert(client, { preferCreate = false } = {}) {
  if (!client?.id) throw new Error("Expediente sin id.");
  if (preferCreate) {
    try {
      return await persistProspectCreate(client);
    } catch (err) {
      if (err.status === 409 || err.status === 400) {
        return persistProspectUpdate(client);
      }
      throw err;
    }
  }
  try {
    return await persistProspectUpdate(client);
  } catch (err) {
    if (err.status === 404) return persistProspectCreate(client);
    throw err;
  }
}

export async function persistProspectDelete(id) {
  await apiJson("DELETE", `/prospects/${id}`);
  return { ok: true };
}

export function queueProspectFallback(reason) {
  markOutboxDirty(reason);
  void requestSyncPush({ reason });
}

/**
 * Online-first: persiste en API y devuelve fila del servidor.
 */
export async function persistProspectOnlineFirst(client, { isNew = false } = {}) {
  if (!isCloudAvailable()) {
    queueProspectFallback(isNew ? "prospect-create-offline" : "prospect-update-offline");
    const err = new Error("Sin conexión al servidor.");
    err.offline = true;
    throw err;
  }
  try {
    return await persistProspectUpsert(client, { preferCreate: isNew });
  } catch (err) {
    console.warn("[prospects-persist]", err?.message || err);
    queueProspectFallback(isNew ? "prospect-create-error" : "prospect-update-error");
    throw err;
  }
}

/** Descarga expedientes del workspace activo vía GET /prospects. */
export async function fetchAllProspectsFromApi() {
  const PAGE = 100;
  const all = [];
  let offset = 0;
  let total = 0;
  for (;;) {
    const res = await fetch(`${API}/prospects?limit=${PAGE}&offset=${offset}`, {
      credentials: "include",
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Error al cargar expedientes (${res.status})`);
    const rows = Array.isArray(body.data) ? body.data : [];
    total = Number(body.total) || total;
    all.push(...rows);
    if (rows.length < PAGE || all.length >= total) break;
    offset += PAGE;
  }
  return { rows: all, total: total || all.length };
}

/** Hidrata store local desde GET /prospects (fallback cuando /sync falla). */
export async function hydrateProspectsFromApi() {
  const { rows } = await fetchAllProspectsFromApi();
  const { runWithoutOutboundSync } = await import("@/lib/sync-suspend.js");
  const { useDbStore } = await import("@/stores/db-store");
  runWithoutOutboundSync(() => {
    const getClient = useDbStore.getState().getClient;
    const saveClient = useDbStore.getState().saveClient;
    for (const row of rows) {
      if (!row?.id) continue;
      saveClient(prospectRowToClient(row, getClient(row.id)), { skipCloud: true });
    }
  });
  return rows.length;
}

