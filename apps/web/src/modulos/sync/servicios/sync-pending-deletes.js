/** Cola de borrados explícitos para sync multi-dispositivo (reemplaza deleteMissing). */

const TABLES = ["prospects", "sales", "calendar_entries", "activities"];

export function emptyPendingDeletes() {
  return {
    prospects: [],
    sales: [],
    calendar_entries: [],
    activities: [],
    tool_calculations: [],
  };
}

export function ensurePendingDeletes(db) {
  if (!db.pendingDeletes || typeof db.pendingDeletes !== "object") {
    db.pendingDeletes = emptyPendingDeletes();
    return db.pendingDeletes;
  }
  for (const t of TABLES) {
    if (!Array.isArray(db.pendingDeletes[t])) db.pendingDeletes[t] = [];
  }
  if (!Array.isArray(db.pendingDeletes.tool_calculations)) {
    db.pendingDeletes.tool_calculations = [];
  }
  return db.pendingDeletes;
}

function pushUnique(list, id) {
  if (!id || typeof id !== "string") return;
  if (!list.includes(id)) list.push(id);
}

export function queuePendingDelete(db, table, id) {
  const pd = ensurePendingDeletes(db);
  if (!TABLES.includes(table)) return;
  pushUnique(pd[table], id);
}

export function queueToolPendingDelete(db, prospectId, tool) {
  if (!tool) return;
  const pd = ensurePendingDeletes(db);
  const key = `${prospectId ?? "null"}:${tool}`;
  const exists = pd.tool_calculations.some(
    (row) => `${row.prospect_id ?? "null"}:${row.tool}` === key,
  );
  if (!exists) {
    pd.tool_calculations.push({ prospect_id: prospectId ?? null, tool });
  }
}

export function mergePendingDeletes(a, b) {
  const out = emptyPendingDeletes();
  for (const src of [a, b]) {
    if (!src || typeof src !== "object") continue;
    for (const t of TABLES) {
      for (const id of src[t] || []) pushUnique(out[t], id);
    }
    for (const row of src.tool_calculations || []) {
      if (!row?.tool) continue;
      queueToolPendingDelete({ pendingDeletes: out }, row.prospect_id, row.tool);
    }
  }
  return out;
}

export function hasPendingDeletes(db) {
  const pd = db?.pendingDeletes;
  if (!pd) return false;
  return (
    (pd.prospects?.length || 0) > 0
    || (pd.sales?.length || 0) > 0
    || (pd.calendar_entries?.length || 0) > 0
    || (pd.activities?.length || 0) > 0
    || (pd.tool_calculations?.length || 0) > 0
  );
}
