/**
 * Allowlist de clientes en UI (Etapa 3 residual).
 * En sala: solo ids del último GET /prospects (+ borradores solo-locales).
 * En personal / sin allowlist: sin filtro.
 *
 * Borradores: flags locales (`pendingCreate`, etc.). No usar `localClientNeedsRetain`
 * con el mapa del GET /prospects (parcial): convive con sync-merge en pull completo.
 */

/** @param {unknown} client */
export function isLocalOnlyDraft(client) {
  if (!client || typeof client !== "object") return false;
  if (client.localOnly === true) return true;
  if (client.pendingCreate === true) return true;
  if (client.cloud === false) return true;
  if (client._localDraft === true) return true;
  return false;
}

/**
 * @param {Record<string, object>|null|undefined} clients
 * @param {{ isSala?: boolean, remoteIds?: Iterable<string>|null, retainLocalDrafts?: boolean }} [opts]
 * @returns {Record<string, object>}
 */
export function filterClientsVisibles(clients, opts = {}) {
  const map = clients && typeof clients === "object" ? clients : {};
  const isSala = opts.isSala === true;
  const retainLocalDrafts = opts.retainLocalDrafts !== false;
  if (!isSala) return { ...map };

  const remote = opts.remoteIds;
  if (remote == null) return { ...map }; // aún no hubo mirror: no ocultar (evita flash vacío)

  const allow = new Set(
    [...remote].map((id) => String(id || "").trim()).filter(Boolean),
  );
  const out = {};
  for (const [id, client] of Object.entries(map)) {
    if (allow.has(String(id))) {
      out[id] = client;
      continue;
    }
    if (retainLocalDrafts && isLocalOnlyDraft(client)) {
      out[id] = client;
    }
  }
  return out;
}

/**
 * Ids a borrar del store tras mirror en sala.
 * @param {Record<string, object>|null|undefined} clients
 * @param {Iterable<string>} remoteIds
 */
export function localIdsToPurgeAfterMirror(clients, remoteIds) {
  const allow = new Set(
    [...remoteIds].map((id) => String(id || "").trim()).filter(Boolean),
  );
  const purge = [];
  for (const [id, client] of Object.entries(clients || {})) {
    if (allow.has(String(id))) continue;
    if (isLocalOnlyDraft(client)) continue;
    purge.push(id);
  }
  return purge;
}

/**
 * Entrada de agenda con prospecto: ocultar en sala si el id no está en allowlist.
 * Sin clientId/prospectId se conserva (notas, descansos, ventas huérfanas).
 * @param {unknown} entry
 * @param {Set<string>|null} visibleIds
 * @param {{ isSala?: boolean }} [opts]
 */
export function isCalEntryVisible(entry, visibleIds, opts = {}) {
  if (opts.isSala !== true || visibleIds == null) return true;
  const pid = entry?.clientId || entry?.prospectId;
  if (!pid) return true;
  return visibleIds.has(String(pid));
}

/**
 * @param {import("@/lib/storage/types").CalMonth|null|undefined} calMonth
 * @param {Set<string>|null} visibleIds
 * @param {{ isSala?: boolean }} [opts]
 */
export function filterCalMonthVisibles(calMonth, visibleIds, opts = {}) {
  const base = calMonth && typeof calMonth === "object" ? calMonth : { days: {}, weeks: {} };
  if (opts.isSala !== true || visibleIds == null) return base;
  const days = { ...(base.days || {}) };
  for (const [dayStr, entries] of Object.entries(base.days || {})) {
    const kept = (entries || []).filter((e) => isCalEntryVisible(e, visibleIds, opts));
    const day = Number(dayStr);
    if (kept.length) days[day] = kept;
    else delete days[day];
  }
  return { ...base, days };
}
