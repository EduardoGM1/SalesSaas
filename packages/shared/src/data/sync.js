import { dbToRows, rowsToDb } from "./mappers.js";
async function pullAll(sb, userId) {
  const tables = [
    "prospects",
    "sales",
    "calendar_entries",
    "goals",
    "activities",
    "tool_calculations"
  ];
  const results = await Promise.all(
    tables.map((t) => sb.from(t).select("*").eq("user_id", userId))
  );
  results.forEach((res, i) => {
    if (res.error) throw new Error(`pull ${tables[i]}: ${res.error.message}`);
  });
  const rows = {
    prospects: results[0].data ?? [],
    sales: results[1].data ?? [],
    calendar_entries: results[2].data ?? [],
    goals: results[3].data ?? [],
    activities: results[4].data ?? [],
    tool_calculations: results[5].data ?? []
  };
  return rowsToDb(rows);
}
async function upsert(sb, table, rows, onConflict) {
  if (rows.length === 0) return;
  const { error } = await sb.from(table).upsert(rows, onConflict ? { onConflict } : void 0);
  if (error) throw new Error(`upsert ${table}: ${error.message}`);
}
async function deleteMissing(sb, table, userId, keepIds) {
  let q = sb.from(table).delete().eq("user_id", userId);
  if (keepIds.length > 0) q = q.not("id", "in", `(${keepIds.join(",")})`);
  const { error } = await q;
  if (error) throw new Error(`delete ${table}: ${error.message}`);
}
async function reconcile(sb, db, userId) {
  const rows = dbToRows(db, userId);
  await upsert(sb, "prospects", rows.prospects);
  await upsert(sb, "sales", rows.sales);
  await upsert(sb, "calendar_entries", rows.calendar_entries);
  await upsert(sb, "activities", rows.activities);
  await upsert(sb, "goals", rows.goals, "user_id,year,month");
  await upsert(
    sb,
    "tool_calculations",
    rows.tool_calculations,
    "user_id,prospect_id,tool"
  );
  await deleteMissing(sb, "calendar_entries", userId, rows.calendar_entries.map((r) => r.id));
  await deleteMissing(sb, "activities", userId, rows.activities.map((r) => r.id));
  await deleteMissing(sb, "sales", userId, rows.sales.map((r) => r.id));
  await deleteMissing(sb, "prospects", userId, rows.prospects.map((r) => r.id));
}
export {
  pullAll,
  reconcile
};
