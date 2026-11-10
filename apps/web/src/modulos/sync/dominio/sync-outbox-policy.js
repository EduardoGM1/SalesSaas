/**
 * Política Sync Tramo 2: backoff y rechazos permanentes.
 * Puro (sin localStorage) para tests.
 */

/** Códigos que no se reintentan en automático (diseño §4). */
export const PERMANENT_REJECT_CODES = Object.freeze([
  "sin_permiso",
  "otro_workspace",
  "ajeno",
  "conflicto_oculto",
]);

const PERMANENT_SET = new Set(PERMANENT_REJECT_CODES);

export const BACKOFF_BASE_MS = 60_000;
export const BACKOFF_CAP_MS = 30 * 60_000;

export function isPermanentRejectCode(code) {
  return PERMANENT_SET.has(String(code || ""));
}

/** Espera 1 → 2 → 4 … min, tope 30 min. failCount 1 → 1 min. */
export function backoffDelayMs(failCount) {
  const n = Math.max(1, Number(failCount) || 1);
  const exp = Math.min(n - 1, 10);
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** exp);
}

export function nextAttemptAtFromFailCount(failCount, now = Date.now()) {
  return now + backoffDelayMs(failCount);
}

export function canAttemptAt(nextAttemptAt, now = Date.now()) {
  if (nextAttemptAt == null) return true;
  const t = Number(nextAttemptAt);
  if (!Number.isFinite(t)) return true;
  return now >= t;
}

/**
 * @param {Array<{ table?: string, id?: string|null, code?: string }>} rejected
 * @returns {{ permanent: Array<{table:string,id:string,code:string}>, transient: Array<{table:string,id:string,code:string}> }}
 */
export function splitRejected(rejected) {
  const permanent = [];
  const transient = [];
  for (const row of Array.isArray(rejected) ? rejected : []) {
    if (!row || !row.id) continue;
    const item = {
      table: String(row.table || ""),
      id: String(row.id),
      code: String(row.code || ""),
    };
    if (isPermanentRejectCode(item.code)) permanent.push(item);
    else transient.push(item);
  }
  return { permanent, transient };
}

/**
 * Fusiona bloqueos por (table,id); el código más reciente gana.
 * @param {Array<{table:string,id:string,code:string}>} prev
 * @param {Array<{table:string,id:string,code:string}>} next
 */
export function mergeBlocked(prev, next) {
  const map = new Map();
  for (const row of [...(prev || []), ...(next || [])]) {
    if (!row?.id) continue;
    const key = `${row.table || ""}:${row.id}`;
    map.set(key, {
      table: String(row.table || ""),
      id: String(row.id),
      code: String(row.code || ""),
    });
  }
  return [...map.values()];
}

/**
 * Quita del blob las filas con id bloqueado (prospects/clients, sales, cal, activities, goals, tools).
 * Best-effort: no inventa estructura nueva.
 */
export function stripBlockedFromDb(db, blocked) {
  if (!db || typeof db !== "object") return db;
  const list = Array.isArray(blocked) ? blocked : [];
  if (!list.length) return db;

  const byTable = new Map();
  for (const row of list) {
    if (!row?.id) continue;
    const t = String(row.table || "");
    if (!byTable.has(t)) byTable.set(t, new Set());
    byTable.get(t).add(String(row.id));
  }

  const out = { ...db };

  const prospectIds = byTable.get("prospects");
  if (prospectIds?.size && out.clients && typeof out.clients === "object") {
    const clients = { ...out.clients };
    for (const id of prospectIds) delete clients[id];
    out.clients = clients;
  }

  const saleIds = byTable.get("sales");
  if (saleIds?.size) {
    if (out.sales && typeof out.sales === "object") {
      const sales = { ...out.sales };
      for (const id of saleIds) delete sales[id];
      out.sales = sales;
    }
    if (out.clients) {
      const clients = { ...out.clients };
      for (const [cid, client] of Object.entries(clients)) {
        if (!client?.sales?.length) continue;
        const nextSales = client.sales.filter((s) => !saleIds.has(String(s.saleId)));
        if (nextSales.length !== client.sales.length) {
          clients[cid] = { ...client, sales: nextSales };
        }
      }
      out.clients = clients;
    }
  }

  const calIds = byTable.get("calendar_entries");
  if (calIds?.size && out.cal && typeof out.cal === "object") {
    const cal = {};
    for (const [key, month] of Object.entries(out.cal)) {
      const days = {};
      for (const [day, entries] of Object.entries(month?.days || {})) {
        const kept = (entries || []).filter((e) => !e?.id || !calIds.has(String(e.id)));
        if (kept.length) days[day] = kept;
      }
      cal[key] = { ...month, days };
    }
    out.cal = cal;
  }

  const activityIds = byTable.get("activities");
  if (activityIds?.size && out.clients) {
    const clients = { ...out.clients };
    for (const [cid, client] of Object.entries(clients)) {
      if (!client?.activities?.length) continue;
      const nextActs = client.activities.filter((a) => !a?.id || !activityIds.has(String(a.id)));
      if (nextActs.length !== client.activities.length) {
        clients[cid] = { ...client, activities: nextActs };
      }
    }
    out.clients = clients;
  }

  const goalIds = byTable.get("goals");
  if (goalIds?.size && out.goals && typeof out.goals === "object") {
    const goals = { ...out.goals };
    for (const id of goalIds) delete goals[id];
    out.goals = goals;
  }

  const toolIds = byTable.get("tool_calculations");
  if (toolIds?.size && out.clients) {
    // Tools no siempre llevan id en el blob; omitimos strip fino.
    void toolIds;
  }

  return out;
}
