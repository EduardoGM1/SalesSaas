import { dbToRows, rowsToDb } from "./mappers.js";
import { SYNC_SELECT } from "./sync-columns.js";

const TEAM_TABLES = new Set([
  "prospects",
  "sales",
  "activities",
  "tool_calculations",
  "calendar_entries",
]);

/** Tablas grandes: pull por páginas para no saturar móvil/sala con muchos registros. */
const PAGED_TABLES = new Set([
  "prospects",
  "sales",
  "calendar_entries",
  "activities",
  "tool_calculations",
]);
const PULL_PAGE_SIZE = 200;
const DELETE_CHUNK = 100;

async function pullTable(sb, table, userId, workspaceId, teamScope) {
  const useTeam = teamScope && TEAM_TABLES.has(table) && workspaceId;
  if (!PAGED_TABLES.has(table)) {
    let q = sb.from(table).select(SYNC_SELECT[table]);
    if (!useTeam) q = q.eq("user_id", userId);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    const { data, error } = await q;
    if (error) throw new Error(`pull ${table}: ${error.message}`);
    return data ?? [];
  }

  const all = [];
  let from = 0;
  for (;;) {
    let q = sb
      .from(table)
      .select(SYNC_SELECT[table])
      .order("id", { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1);
    if (!useTeam) q = q.eq("user_id", userId);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    const { data, error } = await q;
    if (error) throw new Error(`pull ${table}: ${error.message}`);
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PULL_PAGE_SIZE) break;
    from += PULL_PAGE_SIZE;
  }
  return all;
}

async function pullAll(sb, userId, workspaceId = null, { teamScope = false } = {}) {
  const tables = [
    "prospects",
    "sales",
    "calendar_entries",
    "goals",
    "activities",
    "tool_calculations",
  ];
  const results = await Promise.all(
    tables.map((t) => pullTable(sb, t, userId, workspaceId, teamScope)),
  );
  const rows = {
    prospects: results[0],
    sales: results[1],
    calendar_entries: results[2],
    goals: results[3],
    activities: results[4],
    tool_calculations: results[5],
  };
  return rowsToDb(rows);
}

async function upsert(sb, table, rows, onConflict) {
  if (rows.length === 0) return;
  const { error } = await sb.from(table).upsert(rows, onConflict ? { onConflict } : void 0);
  if (error) throw new Error(`upsert ${table}: ${error.message}`);
}

function uniqIds(ids) {
  return [...new Set((ids || []).filter((id) => typeof id === "string" && id.length > 0))];
}

async function deleteByIds(sb, table, userId, ids, workspaceId = null) {
  const list = uniqIds(ids);
  if (!list.length) return;
  for (let i = 0; i < list.length; i += DELETE_CHUNK) {
    const chunk = list.slice(i, i + DELETE_CHUNK);
    let q = sb.from(table).delete().eq("user_id", userId).in("id", chunk);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    const { error } = await q;
    if (error) throw new Error(`delete ${table}: ${error.message}`);
  }
}

async function deleteToolCalculationsExplicit(sb, userId, keys, workspaceId = null) {
  const list = (keys || []).filter((k) => k && typeof k.tool === "string");
  if (!list.length) return;

  let q = sb.from("tool_calculations").select("id, prospect_id, tool").eq("user_id", userId);
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  const { data: existing, error: fetchErr } = await q;
  if (fetchErr) throw new Error(`fetch tool_calculations: ${fetchErr.message}`);

  const want = new Set(list.map((r) => `${r.prospect_id ?? "null"}:${r.tool}`));
  const toDelete = (existing ?? [])
    .filter((r) => want.has(`${r.prospect_id ?? "null"}:${r.tool}`))
    .map((r) => r.id)
    .filter(Boolean);
  if (!toDelete.length) return;

  for (let i = 0; i < toDelete.length; i += DELETE_CHUNK) {
    const chunk = toDelete.slice(i, i + DELETE_CHUNK);
    const { error } = await sb.from("tool_calculations").delete().in("id", chunk);
    if (error) throw new Error(`delete tool_calculations: ${error.message}`);
  }
}

/**
 * Aplica solo borrados explícitos del snapshot (pendingDeletes).
 * Nunca borra filas remotas solo porque falten en el blob local.
 */
async function applyExplicitDeletes(sb, db, userId, workspaceId = null) {
  const pd = db?.pendingDeletes && typeof db.pendingDeletes === "object"
    ? db.pendingDeletes
    : {};
  await deleteToolCalculationsExplicit(sb, userId, pd.tool_calculations, workspaceId);
  await deleteByIds(sb, "calendar_entries", userId, pd.calendar_entries, workspaceId);
  await deleteByIds(sb, "activities", userId, pd.activities, workspaceId);
  await deleteByIds(sb, "sales", userId, pd.sales, workspaceId);
  await deleteByIds(sb, "prospects", userId, pd.prospects, workspaceId);
}

async function reconcile(sb, db, userId, workspaceId = null, { teamScope = false } = {}) {
  const rows = dbToRows(db, userId, workspaceId);
  // En teamScope el gerente puede ver filas ajenas: solo reconciliar las propias
  // para no robar ownership ni fallar inserts ajenos (RLS insert exige auth.uid = user_id).
  const ownProspects = teamScope
    ? rows.prospects.filter((r) => r.user_id === userId)
    : rows.prospects;
  const ownProspectIds = new Set(ownProspects.map((r) => r.id));
  const ownSales = teamScope
    ? rows.sales.filter((r) => r.user_id === userId && (!r.prospect_id || ownProspectIds.has(r.prospect_id) || !r.prospect_id))
    : rows.sales;
  const ownActivities = teamScope
    ? rows.activities.filter((r) => r.user_id === userId)
    : rows.activities;
  const ownTools = (teamScope
    ? rows.tool_calculations.filter((r) => r.user_id === userId)
    : rows.tool_calculations
  ).filter((r) => r.data && typeof r.data === "object" && Object.keys(r.data).length > 0);
  const ownCalendar = teamScope
    ? rows.calendar_entries.filter((r) => r.user_id === userId)
    : rows.calendar_entries;

  await upsert(sb, "prospects", ownProspects);
  await upsert(sb, "sales", ownSales);
  await upsert(sb, "calendar_entries", ownCalendar);
  await upsert(sb, "activities", ownActivities);
  await upsert(sb, "goals", rows.goals, "user_id,year,month");
  await upsert(
    sb,
    "tool_calculations",
    ownTools,
    "user_id,prospect_id,tool",
  );
  // Borrados solo si el cliente los marcó explícitamente (cola pendingDeletes).
  await applyExplicitDeletes(sb, db, userId, workspaceId);
}

export {
  pullAll,
  reconcile,
};
