/**
 * Caracterización del PUT /sync (reconcile) con el comportamiento ACTUAL.
 * Cada aserción marcada "HOY" fija un defecto de docs/arquitectura/sync-fix-diseno.md
 * y debe invertirse cuando se implemente el fix.
 *
 * El cliente Supabase falso emula solo las reglas RLS que importan aquí (0052):
 * - INSERT: WITH CHECK user_in_workspace(auth.uid(), workspace_id) → falla con workspace_id nulo.
 * - UPDATE de una fila existente de otro dueño: falla el USING.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { reconcile } from "@salesapp/shared/data/sync.js";
import { dbToRows, rowsToDb } from "@salesapp/shared/data/mappers.js";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const WS = "33333333-3333-4333-8333-333333333333";
const P_NEW = "44444444-4444-4444-8444-444444444444";
const P_OTHER = "55555555-5555-4555-8555-555555555555";
const S_OTHER = "66666666-6666-4666-8666-666666666666";
const C_NEW = "77777777-7777-4777-8777-777777777777";

function emptyRows() {
  return { prospects: [], sales: [], calendar_entries: [], goals: [], activities: [], tool_calculations: [] };
}

function prospectRow(id, userId) {
  return {
    id,
    user_id: userId,
    workspace_id: WS,
    prospect_code: `P-${id.slice(0, 4)}`,
    name: "x",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  };
}

/** Query builder encadenable: select/delete devuelven vacío; upsert aplica la RLS emulada. */
function fakeSupabase({ existing = {}, enforceRls = true } = {}) {
  const upserts = [];
  const rlsError = (table, using) => ({
    code: "42501",
    message: `new row violates row-level security policy ${using ? "(USING expression) " : ""}for table "${table}"`,
  });
  const check = (table, rows) => {
    if (!enforceRls) return null;
    const byId = new Map((existing[table] || []).map((r) => [r.id, r]));
    for (const row of rows) {
      const prev = row.id ? byId.get(row.id) : null;
      if (prev) {
        if (prev.user_id !== ME) return rlsError(table, true);
      } else if (!row.workspace_id) {
        return rlsError(table, false);
      }
    }
    return null;
  };
  const chain = (result) => {
    const q = {
      select: () => q, eq: () => q, in: () => q, order: () => q, range: () => q,
      delete: () => q, maybeSingle: () => Promise.resolve(result),
      then: (ok, ko) => Promise.resolve(result).then(ok, ko),
    };
    return q;
  };
  return {
    upserts,
    from(table) {
      const base = chain({ data: [], error: null });
      base.upsert = (rows) => {
        const list = Array.isArray(rows) ? rows : [rows];
        upserts.push({ table, rows: list });
        return Promise.resolve({ data: null, error: check(table, list) });
      };
      return base;
    },
  };
}

test("HOY (i): un expediente que solo existe en el cliente se envía sin workspace_id y el INSERT falla", async () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_NEW, ME));
  const db = rowsToDb(rows);
  const sb = fakeSupabase();

  await assert.rejects(
    reconcile(sb, db, ME, WS, { teamScope: false }),
    /upsert prospects: new row violates row-level security policy for table "prospects"/,
  );
  const sent = sb.upserts.find((u) => u.table === "prospects").rows[0];
  assert.equal(sent.id, P_NEW);
  assert.equal(sent.workspace_id, undefined, "HOY: dbToRows no fija workspace_id aunque la sesión tiene workspace");
});

test("HOY (i): una entrada de agenda nueva tampoco sube por PUT /sync", async () => {
  const db = rowsToDb(emptyRows());
  db.cal["2026-10"] = { days: { 20: [{ id: C_NEW, t: "tour", ts: Date.now() }] }, weeks: {} };
  const sb = fakeSupabase();

  await assert.rejects(
    reconcile(sb, db, ME, WS),
    /upsert calendar_entries: new row violates row-level security policy for table "calendar_entries"/,
  );
});

test("HOY (i): el primer fallo aborta el resto del reconcile (sin aislamiento por tabla)", async () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_NEW, ME));
  const db = rowsToDb(rows);
  db.goals["2026-10"] = { vol: 1, tours: 1, ventas: 0, dias: 0, desc: 0, updatedAt: Date.now() };
  const sb = fakeSupabase();

  await assert.rejects(reconcile(sb, db, ME, WS));
  assert.deepEqual(sb.upserts.map((u) => u.table), ["prospects"], "HOY: goals no llega a intentarse");
});

test("HOY (ii): dbToRows estampa user_id = yo en filas ajenas bajadas por alcance de equipo", () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_OTHER, OTHER));
  rows.sales.push({ id: S_OTHER, user_id: OTHER, workspace_id: WS, prospect_id: P_OTHER, sale_date: "2026-10-01", vol: 1, tours: 1 });
  const db = rowsToDb(rows);

  const out = dbToRows(db, ME);
  assert.equal(out.prospects[0].user_id, ME, "HOY: el dueño original se pierde en rowsToDb y se reemplaza");
  assert.equal(out.sales[0].user_id, ME);
});

test("HOY (ii): en teamScope el filtro por dueño no excluye la fila ajena y se reenvía como propia", async () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_OTHER, OTHER));
  rows.sales.push({ id: S_OTHER, user_id: OTHER, workspace_id: WS, prospect_id: P_OTHER, sale_date: "2026-10-01", vol: 1, tours: 1 });
  const db = rowsToDb(rows);
  const sb = fakeSupabase({ enforceRls: false });

  await reconcile(sb, db, ME, WS, { teamScope: true });
  const sentProspects = sb.upserts.find((u) => u.table === "prospects").rows;
  const sentSales = sb.upserts.find((u) => u.table === "sales").rows;
  assert.deepEqual(sentProspects.map((r) => [r.id, r.user_id]), [[P_OTHER, ME]], "HOY: el expediente ajeno viaja con user_id propio");
  assert.deepEqual(sentSales.map((r) => [r.id, r.user_id]), [[S_OTHER, ME]]);
});

test("HOY (ii): con RLS, la venta ajena reenviada falla por USING y bloquea el PUT", async () => {
  const rows = emptyRows();
  rows.sales.push({ id: S_OTHER, user_id: OTHER, workspace_id: WS, prospect_id: null, sale_date: "2026-10-01", vol: 1, tours: 1 });
  const db = rowsToDb(rows);
  const sb = fakeSupabase({ existing: { sales: [{ id: S_OTHER, user_id: OTHER }] } });

  await assert.rejects(
    reconcile(sb, db, ME, WS, { teamScope: true }),
    /upsert sales: new row violates row-level security policy \(USING expression\) for table "sales"/,
  );
});
