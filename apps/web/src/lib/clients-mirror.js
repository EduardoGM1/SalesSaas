/**
 * Espejo Clientes: API REST como fuente de verdad del listado +
 * subida de expedientes solo-locales que aún no están en BD.
 */
import { useDbStore } from "@/stores/db-store";
import { runWithoutOutboundSync } from "@/lib/sync-suspend.js";
import { markOutboxDirty } from "@/lib/sync-outbox.js";
import { requestSyncPush } from "@/lib/sync-outbound.js";
import { useSyncStore } from "@/stores/sync-store";

const PAGE = 100;

function rowToClient(p, existing) {
  const base = existing || {
    data: { survey: {}, vacaciones: {}, worksheet: {} },
    sales: [],
    activities: [],
  };
  const updatedAt = p.updated_at
    ? Date.parse(p.updated_at) || base.updatedAt
    : (p.created_at ? Date.parse(p.created_at) || base.updatedAt : base.updatedAt);
  return {
    ...base,
    id: p.id,
    prospectId: p.id,
    ownerUserId: p.user_id ?? base.ownerUserId,
    prospectCode: p.prospect_code ?? base.prospectCode,
    name: p.name ?? base.name,
    name1: p.name1 ?? base.name1,
    name2: p.name2 ?? base.name2,
    city: p.city ?? base.city,
    country: p.country ?? base.country,
    phone: p.phone ?? base.phone,
    email: p.email ?? base.email,
    contract: p.contract ?? base.contract,
    status: p.status ?? base.status,
    tourDate: p.tour_date ?? base.tourDate,
    processDate: p.process_date ?? base.processDate,
    processAmount: p.process_amount != null ? Number(p.process_amount) : base.processAmount,
    note: p.note ?? base.note,
    tipo_tour: p.tipo_tour ?? base.tipo_tour,
    tour_cuantificable: p.tour_cuantificable != null ? !!p.tour_cuantificable : base.tour_cuantificable,
    completedExpedient: p.completed != null ? !!p.completed : base.completedExpedient,
    quickExpedient: p.quick_expedient != null ? !!p.quick_expedient : base.quickExpedient,
    createdAt: p.created_at ? Date.parse(p.created_at) || base.createdAt : base.createdAt,
    updatedAt,
    createdYmd: p.created_at ? String(p.created_at).slice(0, 10) : base.createdYmd,
    date: p.created_at ? String(p.created_at).slice(0, 10) : base.date,
  };
}

async function fetchAllProspectPages() {
  const all = [];
  let offset = 0;
  let total = 0;
  for (;;) {
    const res = await fetch(`/api/v1/prospects?limit=${PAGE}&offset=${offset}`, {
      credentials: "include",
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `Error al cargar clientes (${res.status})`);
    }
    const rows = Array.isArray(body.data) ? body.data : [];
    total = Number(body.total) || total;
    all.push(...rows);
    if (rows.length < PAGE || all.length >= total) break;
    offset += PAGE;
  }
  return { rows: all, total: total || all.length };
}

async function postLocalClient(client) {
  const res = await fetch("/api/v1/prospects", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: client.id,
      prospectCode: client.prospectCode,
      name: client.name1 || client.name,
      name1: client.name1 || client.name,
      name2: client.name2 || null,
      city: client.city || null,
      country: client.country || null,
      phone: client.phone || null,
      email: client.email || null,
      contract: client.contract || null,
      status: client.status || null,
      tourDate: client.tourDate || null,
      processDate: client.processDate || null,
      processAmount: client.processAmount || 0,
      note: client.note || null,
      tipo_tour: client.tipo_tour || null,
      tour_cuantificable: client.tour_cuantificable,
      completedExpedient: client.completedExpedient,
      quickExpedient: client.quickExpedient,
    }),
  });
  if (res.ok || res.status === 409) return { ok: true };
  const body = await res.json().catch(() => ({}));
  const msg = String(body.error || "");
  if (/duplicate|already exists|unique/i.test(msg)) return { ok: true };
  return { ok: false, error: msg || `HTTP ${res.status}` };
}

/**
 * 1) Baja todos los prospects del workspace activo → store
 * 2) Sube los solo-locales que falten en API
 * 3) Fuerza PUT sync para tools/ventas
 */
export async function mirrorClientsWithCloud() {
  const { rows, total } = await fetchAllProspectPages();
  const remoteIds = new Set(rows.map((r) => r.id).filter(Boolean));

  runWithoutOutboundSync(() => {
    const getClient = useDbStore.getState().getClient;
    const saveClient = useDbStore.getState().saveClient;
    for (const row of rows) {
      if (!row?.id) continue;
      saveClient(rowToClient(row, getClient(row.id)));
    }
  });

  const localClients = Object.values(useDbStore.getState().db.clients || {});
  const localOnly = localClients.filter((c) => c?.id && !remoteIds.has(c.id));

  const posted = [];
  const failed = [];
  for (const client of localOnly) {
    try {
      const result = await postLocalClient(client);
      if (result.ok) posted.push(client.id);
      else failed.push({ id: client.id, error: result.error });
    } catch (err) {
      failed.push({
        id: client.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (posted.length > 0 || localOnly.length > 0) {
    markOutboxDirty("clients-mirror");
    useSyncStore.getState().setPendingOutbound(true);
    await requestSyncPush({ reason: "clients-mirror" });
  }

  return {
    remoteTotal: total,
    remoteCount: rows.length,
    localOnlyCount: localOnly.length,
    posted,
    failed,
  };
}
