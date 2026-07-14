import type { SupabaseClient } from "@supabase/supabase-js";
import { AppDatabase } from "@/lib/storage/types";
import { dbToRows, rowsToDb, SupabaseRows } from "./mappers";

type SB = SupabaseClient;

/** Descarga todo el estado del usuario desde Supabase y lo convierte a AppDatabase. */
export async function pullAll(sb: SB, userId: string): Promise<AppDatabase> {
  const tables = [
    "prospects",
    "sales",
    "calendar_entries",
    "goals",
    "activities",
    "tool_calculations",
  ] as const;

  const results = await Promise.all(
    tables.map((t) => sb.from(t).select("*").eq("user_id", userId))
  );

  results.forEach((res, i) => {
    if (res.error) throw new Error(`pull ${tables[i]}: ${res.error.message}`);
  });

  const rows: SupabaseRows = {
    prospects: results[0].data ?? [],
    sales: results[1].data ?? [],
    calendar_entries: results[2].data ?? [],
    goals: results[3].data ?? [],
    activities: results[4].data ?? [],
    tool_calculations: results[5].data ?? [],
  };

  return rowsToDb(rows);
}

async function upsert(
  sb: SB,
  table: string,
  rows: Record<string, unknown>[],
  onConflict?: string
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await sb
    .from(table)
    .upsert(rows, onConflict ? { onConflict } : undefined);
  if (error) throw new Error(`upsert ${table}: ${error.message}`);
}

async function deleteMissing(
  sb: SB,
  table: string,
  userId: string,
  keepIds: string[]
): Promise<void> {
  let q = sb.from(table).delete().eq("user_id", userId);
  if (keepIds.length > 0) q = q.not("id", "in", `(${keepIds.join(",")})`);
  const { error } = await q;
  if (error) throw new Error(`delete ${table}: ${error.message}`);
}

async function deleteMissingToolCalculations(
  sb: SB,
  userId: string,
  keepRows: { prospect_id: string | null; tool: string }[],
): Promise<void> {
  const { data: existing, error: fetchErr } = await sb
    .from("tool_calculations")
    .select("id, prospect_id, tool")
    .eq("user_id", userId);
  if (fetchErr) throw new Error(`fetch tool_calculations: ${fetchErr.message}`);
  const keepSet = new Set(
    keepRows.map((r) => `${r.prospect_id ?? "null"}:${r.tool}`),
  );
  const toDelete = (existing ?? []).filter(
    (r) => !keepSet.has(`${r.prospect_id ?? "null"}:${r.tool}`),
  );
  if (!toDelete.length) return;
  const { error } = await sb
    .from("tool_calculations")
    .delete()
    .in("id", toDelete.map((r) => r.id));
  if (error) throw new Error(`delete tool_calculations: ${error.message}`);
}

/**
 * Reconcilia el estado completo del usuario con la nube:
 * upsert de todo lo presente + borrado de lo que ya no existe.
 * Idempotente: una corrida exitosa deja la nube == estado local.
 */
export async function reconcile(sb: SB, db: AppDatabase, userId: string): Promise<void> {
  const rows = dbToRows(db, userId);

  // Upserts en orden de dependencias (FK)
  await upsert(sb, "prospects", rows.prospects as unknown as Record<string, unknown>[]);
  await upsert(sb, "sales", rows.sales as unknown as Record<string, unknown>[]);
  await upsert(sb, "calendar_entries", rows.calendar_entries as unknown as Record<string, unknown>[]);
  await upsert(sb, "activities", rows.activities as unknown as Record<string, unknown>[]);
  await upsert(sb, "goals", rows.goals as unknown as Record<string, unknown>[], "user_id,year,month");
  await upsert(
    sb,
    "tool_calculations",
    rows.tool_calculations as unknown as Record<string, unknown>[],
    "user_id,prospect_id,tool"
  );

  // Borrado de faltantes (hijos primero; prospects cascada al final)
  await deleteMissingToolCalculations(
    sb,
    userId,
    rows.tool_calculations.map((r) => ({ prospect_id: r.prospect_id, tool: r.tool })),
  );
  await deleteMissing(sb, "calendar_entries", userId, rows.calendar_entries.map((r) => r.id));
  await deleteMissing(sb, "activities", userId, rows.activities.map((r) => r.id));
  await deleteMissing(sb, "sales", userId, rows.sales.map((r) => r.id));
  await deleteMissing(sb, "prospects", userId, rows.prospects.map((r) => r.id));
}
