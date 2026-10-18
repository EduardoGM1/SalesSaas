/**
 * PUT /sync (reconcile) — Tramo 1 de docs/arquitectura/sync-fix-diseno.md.
 *
 * El Supabase en memoria emula las reglas de producción que importan aquí:
 * - upsert: WITH CHECK de INSERT sobre la fila propuesta (user_id = uid, miembro del
 *   workspace, permiso de alta) y, si hay conflicto, USING de UPDATE sobre la existente.
 * - UPDATE cuyo USING no pasa: 0 filas, sin error.
 * - unique (user_id, prospect_code), FK de prospect_id/sale_id, trigger de tombstone,
 *   historial de workflow inmutable al borrar. Cada sentencia es atómica.
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { reconcile, summarizeReport } from "@salesapp/shared/data/sync.js";
import { normalizeIds, rowsToDb } from "@salesapp/shared/data/mappers.js";
import { ServiceError } from "../lib/service-error.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const WS = "33333333-3333-4333-8333-333333333333";
const WS2 = "88888888-8888-4888-8888-888888888888";
const P_NEW = "44444444-4444-4444-8444-444444444444";
const P_OTHER = "55555555-5555-4555-8555-555555555555";
const S_OTHER = "66666666-6666-4666-8666-666666666666";
const C_NEW = "77777777-7777-4777-8777-777777777777";
const P_MINE = "99999999-9999-4999-8999-999999999999";
const P_HIDDEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S_NEW = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P_LOCKED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const P_TOMB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const T0 = Date.parse("2026-10-01T10:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();

const TABLES = ["prospects", "sales", "calendar_entries", "activities", "goals", "tool_calculations"];
const INSERT_PERMISSION = {
  prospects: "expedientes:crear",
  sales: "ventas:registrar",
  calendar_entries: "expedientes:editar",
  activities: "expedientes:editar",
  goals: null,
  tool_calculations: null,
};

let seq = 0;
const newUuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

/**
 * @param {object} o
 * @param {string[]} [o.memberOf] workspaces del usuario
 * @param {Set<string>} [o.deny] permisos denegados
 * @param {Record<string, object[]>} [o.seed] filas existentes (`hidden: true` = invisible al USING)
 */
function memoryDb({ memberOf = [WS], deny = new Set(), seed = {}, tombstones = [], immutable = [] } = {}) {
  const t = Object.fromEntries(TABLES.map((n) => [n, (seed[n] || []).map((r) => ({ ...r }))]));
  t.prospects_deleted = tombstones.map((r) => ({ ...r }));
  const immutableIds = new Set(immutable);
  const writes = [];

  const has = (perm) => !perm || !deny.has(perm);
  const member = (ws) => memberOf.includes(ws);
  const visible = (table, r) => table === "prospects_deleted" || (member(r.workspace_id) && !r.hidden);
  const insertCheck = (table, r) => r.user_id === ME && member(r.workspace_id) && has(INSERT_PERMISSION[table]);
  const updateUsing = (table, r) => r.user_id === ME && member(r.workspace_id) && !r.hidden
    && (table !== "prospects" || has("expedientes:editar"));
  const rls = (table, using) => ({
    code: "42501",
    message: `new row violates row-level security policy ${using ? "(USING expression) " : ""}for table "${table}"`,
  });

  function integrity(table, rows) {
    const all = rows;
    for (const r of all) {
      if (table === "prospects") {
        const dup = all.find((o) => o !== r && o.user_id === r.user_id && o.prospect_code === r.prospect_code);
        if (dup) return { code: "23505", message: "duplicate key value violates unique constraint \"prospects_user_id_prospect_code_key\"" };
      }
      if (r.prospect_id && table !== "prospects" && !t.prospects.some((p) => p.id === r.prospect_id)) {
        return { code: "23503", message: `insert or update on table "${table}" violates foreign key constraint` };
      }
      if (r.sale_id && !t.sales.some((s) => s.id === r.sale_id)) {
        return { code: "23503", message: `insert or update on table "${table}" violates foreign key constraint` };
      }
    }
    return null;
  }

  function upsert(table, payload, { onConflict = "id" } = {}) {
    const cols = onConflict.split(",");
    const next = t[table].map((r) => ({ ...r }));
    for (const raw of Array.isArray(payload) ? payload : [payload]) {
      const row = { ...raw };
      if (table === "prospects" && t.prospects_deleted.some((d) => d.prospect_id === row.id)) {
        return { error: { code: "P0001", message: "prospect_tombstone: expediente eliminado" } };
      }
      if (!insertCheck(table, row)) return { error: rls(table, false) };
      const idx = next.findIndex((r) => cols.every((c) => (r[c] ?? null) === (row[c] ?? null)));
      if (idx >= 0) {
        if (!updateUsing(table, next[idx])) return { error: rls(table, true) };
        next[idx] = { ...next[idx], ...row, id: next[idx].id };
      } else {
        next.push({ ...row, id: row.id || newUuid() });
      }
    }
    const bad = integrity(table, next);
    if (bad) return { error: bad };
    t[table] = next;
    writes.push({ table, op: "upsert", n: Array.isArray(payload) ? payload.length : 1 });
    return { error: null };
  }

  function builder(table) {
    const filters = [];
    let op = "select";
    let patch = null;
    const q = {
      select() { return q; },
      eq(c, v) { filters.push((r) => r[c] === v); return q; },
      in(c, list) {
        const set = new Set(list);
        filters.push((r) => set.has(r[c]));
        return q;
      },
      order() { return q; },
      range() { return q; },
      update(p) { op = "update"; patch = p; return q; },
      delete() { op = "delete"; return q; },
      upsert(payload, opts) { return Promise.resolve(upsert(table, payload, opts)); },
      then(ok, ko) { return Promise.resolve(run()).then(ok, ko); },
    };
    const match = (r) => filters.every((f) => f(r));
    function run() {
      if (op === "select") {
        return { data: t[table].filter((r) => visible(table, r) && match(r)).map((r) => ({ ...r })), error: null };
      }
      if (op === "update") {
        const next = t[table].map((r) => (match(r) && updateUsing(table, r) ? { ...r, ...patch } : r));
        const hit = next.filter((r, i) => r !== t[table][i]);
        const bad = integrity(table, next);
        if (bad) return { data: null, error: bad };
        t[table] = next;
        if (hit.length) writes.push({ table, op: "update", n: hit.length });
        return { data: hit.map((r) => ({ id: r.id })), error: null };
      }
      const gone = t[table].filter((r) => match(r) && r.user_id === ME && visible(table, r));
      if (table === "prospects" && gone.some((r) => immutableIds.has(r.id))) {
        return { data: null, error: { code: "P0001", message: "El historial del workflow es inmutable" } };
      }
      t[table] = t[table].filter((r) => !gone.includes(r));
      if (gone.length) writes.push({ table, op: "delete", n: gone.length });
      return { data: null, error: null };
    }
    return q;
  }

  return { tables: t, writes, from: (table) => builder(table) };
}

function emptyRows() {
  return { prospects: [], sales: [], calendar_entries: [], goals: [], activities: [], tool_calculations: [] };
}

function prospectRow(id, userId, extra = {}) {
  return {
    id,
    user_id: userId,
    workspace_id: WS,
    prospect_code: `P-${id.slice(0, 4)}`,
    name: "x",
    created_at: iso(T0),
    updated_at: iso(T0),
    ...extra,
  };
}

/** Blob de un cliente desplegado: ids locales no-UUID que normalizeIds regenera en cada envío. */
function legacyBlob() {
  const db = rowsToDb(emptyRows());
  db.clients["c-legacy-1"] = {
    id: "c-legacy-1",
    prospectCode: "EXP-LEG-1",
    name: "Ana",
    createdAt: T0,
    updatedAt: T0,
    data: { worksheet: { precio: 10 } },
    sales: [{ saleId: "s-legacy-1", date: "2026-10-02", vol: 1000, tours: 1, ts: T0 + 1000 }],
    activities: [{ id: "a-legacy-1", type: "nota", title: "llamada", ts: T0 + 2000, date: "2026-10-02" }],
  };
  db.clients["c-legacy-2"] = { id: "c-legacy-2", name: "Beto", createdAt: T0 + 5000, updatedAt: T0 + 5000, sales: [], activities: [] };
  db.cal["2026-10"] = {
    days: { 3: [{ id: "e-legacy-1", t: "tour", ts: T0 + 3000, clientId: "c-legacy-1" }] },
    weeks: {},
  };
  db.goals["2026-10"] = { vol: 5, tours: 2, ventas: 1, dias: 20, desc: 0, updatedAt: T0 };
  return db;
}

const ownRows = (sb, table) => sb.tables[table].filter((r) => r.user_id === ME);

// ---------------------------------------------------------------------------
// Las 6 caracterizaciones "HOY", invertidas al comportamiento corregido.
// ---------------------------------------------------------------------------

test("(i) un expediente que solo existe en el cliente se inserta con el workspace de la sesión", async () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_NEW, ME, { workspace_id: undefined }));
  const sb = memoryDb();

  const report = await reconcile(sb, rowsToDb(rows), ME, WS);
  assert.deepEqual(report.rejected, []);
  assert.equal(report.inserted.prospects, 1);
  const row = sb.tables.prospects.find((r) => r.id === P_NEW);
  assert.equal(row.workspace_id, WS);
  assert.equal(row.user_id, ME);
});

test("(i) una entrada de agenda nueva sube por PUT /sync", async () => {
  const db = rowsToDb(emptyRows());
  db.cal["2026-10"] = { days: { 20: [{ id: C_NEW, t: "tour", ts: T0 }] }, weeks: {} };
  const sb = memoryDb();

  const report = await reconcile(sb, db, ME, WS);
  assert.deepEqual(report.rejected, []);
  assert.equal(sb.tables.calendar_entries.length, 1);
  assert.equal(sb.tables.calendar_entries[0].workspace_id, WS);
});

test("(i) un fallo en prospects no impide escribir goals (aislamiento por tabla)", async () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_HIDDEN, ME));
  const db = rowsToDb(rows);
  db.goals["2026-10"] = { vol: 1, tours: 1, ventas: 0, dias: 0, desc: 0, updatedAt: T0 };
  const sb = memoryDb({ seed: { prospects: [prospectRow(P_HIDDEN, ME, { hidden: true, name: "orig" })] } });

  const report = await reconcile(sb, db, ME, WS);
  assert.deepEqual(report.rejected.map((r) => [r.table, r.code]), [["prospects", "conflicto_oculto"]]);
  assert.equal(sb.tables.goals.length, 1);
  assert.equal(sb.tables.prospects.find((r) => r.id === P_HIDDEN).name, "orig");
});

test("(ii) rowsToDb/dbToRows siguen sin conservar el dueño: lo resuelve el servidor, no el blob", async () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_OTHER, OTHER, { name: "ajeno" }));
  const sb = memoryDb({ seed: { prospects: [prospectRow(P_OTHER, OTHER, { name: "ajeno" })] } });

  const db = rowsToDb(rows);
  db.clients[P_OTHER].name = "editado offline";
  const report = await reconcile(sb, db, ME, WS);
  const row = sb.tables.prospects.find((r) => r.id === P_OTHER);
  assert.equal(row.user_id, OTHER, "el dueño en BD no cambia");
  assert.equal(row.name, "ajeno", "la fila ajena no se actualiza");
  assert.equal(report.skipped.ajeno.prospects, 1);
  assert.deepEqual(report.rejected, []);
});

test("(ii) en teamScope las filas ajenas y sus hijos se omiten sin escribirse", async () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_OTHER, OTHER));
  rows.sales.push({ id: S_OTHER, user_id: OTHER, workspace_id: WS, prospect_id: P_OTHER, sale_date: "2026-10-01", vol: 1, tours: 1, created_at: iso(T0) });
  const sb = memoryDb({
    seed: {
      prospects: [prospectRow(P_OTHER, OTHER)],
      sales: [{ id: S_OTHER, user_id: OTHER, workspace_id: WS, prospect_id: P_OTHER, sale_date: "2026-10-01", vol: 1, tours: 1 }],
    },
  });

  const report = await reconcile(sb, rowsToDb(rows), ME, WS, { teamScope: true });
  assert.deepEqual(sb.writes, []);
  assert.equal(report.skipped.ajeno.prospects, 1);
  assert.equal(report.skipped.padre_ajeno.sales, 1);
  assert.deepEqual(report.rejected, []);
});

test("(ii) una venta ajena reenviada se omite y no bloquea el PUT", async () => {
  const rows = emptyRows();
  rows.sales.push({ id: S_OTHER, user_id: OTHER, workspace_id: WS, prospect_id: null, sale_date: "2026-10-01", vol: 1, tours: 1, created_at: iso(T0) });
  const db = rowsToDb(rows);
  db.goals["2026-10"] = { vol: 1, tours: 1, ventas: 0, dias: 0, desc: 0, updatedAt: T0 };
  const sb = memoryDb({
    seed: { sales: [{ id: S_OTHER, user_id: OTHER, workspace_id: WS, prospect_id: null, sale_date: "2026-10-01", vol: 9, tours: 1 }] },
  });

  const report = await reconcile(sb, db, ME, WS, { teamScope: true });
  assert.deepEqual(report.rejected, []);
  assert.equal(report.skipped.ajeno.sales, 1);
  assert.equal(sb.tables.sales[0].vol, 9);
  assert.equal(sb.tables.goals.length, 1);
});

test("guard: sync:shared no regenera sync.js (lógica propia del servidor)", () => {
  const cfg = JSON.parse(readFileSync(resolve(HERE, "../../../../scripts/architecture/sync-shared-files.json"), "utf8"));
  const regenerated = cfg.pairs.map((p) => p.shared);
  assert.ok(!regenerated.includes("packages/shared/src/data/sync.js"), "sync.js no puede estar en pairs");
  assert.ok(cfg.sharedOnlyNoted.includes("packages/shared/src/data/sync.js"));
});

// ---------------------------------------------------------------------------
// (a) Idempotencia para clientes desplegados
// ---------------------------------------------------------------------------

test("(a) el mismo PUT reenviado 3 veces con ids regenerados deja exactamente una fila por entidad", async () => {
  const sb = memoryDb();
  const blob = legacyBlob();
  const sentIds = new Set();
  for (let i = 0; i < 3; i += 1) {
    const { db } = normalizeIds(blob);
    for (const id of Object.keys(db.clients)) sentIds.add(id);
    const report = await reconcile(sb, db, ME, WS);
    assert.deepEqual(report.rejected, [], `intento ${i + 1} sin rechazos`);
    if (i > 0) {
      assert.deepEqual(report.inserted, {}, `intento ${i + 1}: nada nuevo`);
      assert.equal(report.deduped.prospects, 2);
    }
  }
  assert.equal(sentIds.size, 6, "cada intento llegó con ids de expediente distintos");
  assert.equal(ownRows(sb, "prospects").length, 2);
  assert.equal(ownRows(sb, "sales").length, 1);
  assert.equal(ownRows(sb, "activities").length, 1);
  assert.equal(ownRows(sb, "calendar_entries").length, 1);
  assert.equal(ownRows(sb, "goals").length, 1);
  assert.equal(ownRows(sb, "tool_calculations").length, 1);

  const ana = sb.tables.prospects.find((r) => r.prospect_code === "EXP-LEG-1");
  assert.equal(sb.tables.sales[0].prospect_id, ana.id, "la venta cuelga del expediente original");
  assert.equal(sb.tables.calendar_entries[0].prospect_id, ana.id);
  const beto = sb.tables.prospects.find((r) => r.name === "Beto");
  const codes = new Set(sb.tables.prospects.map((r) => r.prospect_code));
  assert.equal(codes.size, 2);
  assert.ok(beto.prospect_code, "sin prospectCode local: deduplica por (created_at, name) y conserva el código guardado");
});

test("(a) duplicados dentro del mismo blob se insertan una sola vez", async () => {
  const db = rowsToDb(emptyRows());
  db.cal["2026-10"] = {
    days: { 5: [{ id: "e-a", t: "cita", ts: T0 }, { id: "e-b", t: "cita", ts: T0 }] },
    weeks: {},
  };
  const sb = memoryDb();
  const report = await reconcile(sb, normalizeIds(db).db, ME, WS);
  assert.deepEqual(report.rejected, []);
  assert.equal(sb.tables.calendar_entries.length, 1);
  assert.equal(report.deduped.calendar_entries, 1);
});

// ---------------------------------------------------------------------------
// (c) Workspace de la sesión, permisos de alta y filas de otro dueño
// ---------------------------------------------------------------------------

test("(c) sin expedientes:crear el expediente nuevo se rechaza y el propio existente se actualiza", async () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_NEW, ME), prospectRow(P_MINE, ME, { name: "nuevo nombre" }));
  const sb = memoryDb({ deny: new Set(["expedientes:crear"]), seed: { prospects: [prospectRow(P_MINE, ME, { name: "viejo" })] } });
  const canInsert = (table) => table !== "prospects";

  const report = await reconcile(sb, rowsToDb(rows), ME, WS, { canInsert });
  assert.deepEqual(report.rejected, [{ table: "prospects", id: P_NEW, code: "sin_permiso" }]);
  assert.equal(sb.tables.prospects.length, 1);
  assert.equal(sb.tables.prospects[0].name, "nuevo nombre");
});

test("(c) sin permiso de alta en agenda (expedientes:editar) la entrada nueva se rechaza", async () => {
  const db = rowsToDb(emptyRows());
  db.cal["2026-10"] = { days: { 20: [{ id: C_NEW, t: "tour", ts: T0 }] }, weeks: {} };
  const sb = memoryDb({ deny: new Set(["expedientes:editar"]) });

  const report = await reconcile(sb, db, ME, WS, { canInsert: (table) => table !== "calendar_entries" && table !== "activities" });
  assert.deepEqual(report.rejected.map((r) => r.code), ["sin_permiso"]);
  assert.equal(sb.tables.calendar_entries.length, 0);
});

test("(c) filas ajenas se omiten también fuera de teamScope y nunca se reasignan", async () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_OTHER, OTHER, { name: "pisado" }));
  const sb = memoryDb({ seed: { prospects: [prospectRow(P_OTHER, OTHER, { name: "original" })] } });

  const report = await reconcile(sb, rowsToDb(rows), ME, WS, { teamScope: false });
  assert.deepEqual(sb.writes, []);
  assert.equal(sb.tables.prospects[0].user_id, OTHER);
  assert.equal(sb.tables.prospects[0].name, "original");
  assert.equal(report.skipped.ajeno.prospects, 1);
});

test("(c) una fila propia de otro workspace se rechaza y no se mueve", async () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_MINE, ME));
  const sb = memoryDb({ memberOf: [WS, WS2], seed: { prospects: [prospectRow(P_MINE, ME, { workspace_id: WS2 })] } });

  const report = await reconcile(sb, rowsToDb(rows), ME, WS);
  assert.deepEqual(report.rejected, [{ table: "prospects", id: P_MINE, code: "otro_workspace" }]);
  assert.equal(sb.tables.prospects[0].workspace_id, WS2);
});

test("(c) sin workspace activo no se escribe nada", async () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_NEW, ME));
  const sb = memoryDb();
  const report = await reconcile(sb, rowsToDb(rows), ME, null);
  assert.deepEqual(sb.writes, []);
  assert.deepEqual(report.rejected.map((r) => r.code), ["sin_workspace"]);
});

test("(c) sin expedientes:editar una fila propia se omite (sin 409 perpetuo)", async () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_MINE, ME, { name: "cambio" }));
  const sb = memoryDb({ deny: new Set(["expedientes:editar"]), seed: { prospects: [prospectRow(P_MINE, ME, { name: "viejo" })] } });

  const report = await reconcile(sb, rowsToDb(rows), ME, WS, { canInsert: (t) => t !== "calendar_entries" && t !== "activities" });
  assert.deepEqual(report.rejected, []);
  assert.equal(report.skipped.sin_permiso_editar.prospects, 1);
  assert.equal(sb.tables.prospects[0].name, "viejo");
});

// ---------------------------------------------------------------------------
// (d) Aislamiento por fila y respuesta sin datos sensibles
// ---------------------------------------------------------------------------

test("(d) una fila mala no aborta el resto; sus hijos se rechazan con motivo", async () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_NEW, ME, { name: "bueno" }), prospectRow(P_HIDDEN, ME, { name: "malo", email: "x@y.z" }));
  rows.sales.push({ id: S_NEW, user_id: ME, prospect_id: P_HIDDEN, sale_date: "2026-10-01", vol: 1, tours: 1, created_at: iso(T0) });
  const db = rowsToDb(rows);
  db.goals["2026-10"] = { vol: 1, tours: 1, ventas: 0, dias: 0, desc: 0, updatedAt: T0 };
  const sb = memoryDb({ seed: { prospects: [prospectRow(P_HIDDEN, ME, { hidden: true })] } });

  const report = await reconcile(sb, db, ME, WS);
  assert.deepEqual(report.rejected, [
    { table: "prospects", id: P_HIDDEN, code: "conflicto_oculto" },
    { table: "sales", id: S_NEW, code: "padre_rechazado" },
  ]);
  assert.ok(sb.tables.prospects.some((r) => r.id === P_NEW && r.name === "bueno"));
  assert.equal(sb.tables.goals.length, 1);
  for (const r of report.rejected) assert.deepEqual(Object.keys(r).sort(), ["code", "id", "table"]);
  const summary = JSON.stringify(summarizeReport(report));
  assert.doesNotMatch(summary, /x@y\.z|malo|[0-9a-f]{8}-[0-9a-f]{4}/);
});

test("(d) un borrado bloqueado por el workflow no impide los demás borrados", async () => {
  const db = rowsToDb(emptyRows());
  db.pendingDeletes = { prospects: [P_LOCKED, P_MINE], sales: [], calendar_entries: [], activities: [], tool_calculations: [] };
  const sb = memoryDb({ seed: { prospects: [prospectRow(P_LOCKED, ME), prospectRow(P_MINE, ME, { prospect_code: "P-otro" })] }, immutable: [P_LOCKED] });

  const report = await reconcile(sb, db, ME, WS);
  assert.deepEqual(report.rejected, [{ table: "prospects", id: P_LOCKED, code: "borrado_bloqueado" }]);
  assert.deepEqual(sb.tables.prospects.map((r) => r.id), [P_LOCKED]);
});

test("(d) un expediente con tombstone se omite junto con sus hijos, sin rechazo", async () => {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_TOMB, ME));
  rows.sales.push({ id: S_NEW, user_id: ME, prospect_id: P_TOMB, sale_date: "2026-10-01", vol: 1, tours: 1, created_at: iso(T0) });
  const sb = memoryDb({ tombstones: [{ prospect_id: P_TOMB, user_id: ME, prospect_code: "P-dddd" }] });

  const report = await reconcile(sb, rowsToDb(rows), ME, WS);
  assert.deepEqual(report.rejected, []);
  assert.equal(report.skipped.tombstone.prospects, 1);
  assert.equal(report.skipped.padre_tombstone.sales, 1);
  assert.deepEqual(sb.writes, []);
});

// ---------------------------------------------------------------------------
// (b) Servicio: 409 sync_partial para clientes sin X-Sync-Protocol: 2
// ---------------------------------------------------------------------------

const wsContext = { workspaceId: WS, tipo: "sala_de_venta", rol: "liner", teamScope: false, active: null };
const permissionDenied = new Set();
mock.module(pathToFileURL(resolve(HERE, "../lib/workspace-scope.js")).href, {
  namedExports: {
    getRequestWorkspaceContext: async () => wsContext,
    requireWorkspacePermission: async (_sb, _uid, permission) => {
      if (permissionDenied.has(permission)) throw new ServiceError("Sin permiso", 403);
    },
  },
});
const logged = [];
mock.module(pathToFileURL(resolve(HERE, "../lib/logger.js")).href, {
  namedExports: {
    logger: {
      info: (event, fields) => logged.push({ level: "info", event, fields }),
      warn: (event, fields) => logged.push({ level: "warn", event, fields }),
      error: (event, fields) => logged.push({ level: "error", event, fields }),
    },
  },
});
const service = await import("./sync-service.js");

function blobWithHiddenConflict() {
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_NEW, ME), prospectRow(P_HIDDEN, ME));
  return rowsToDb(rows);
}

test("(b) sin rechazos: 200 normal con data y una línea sync.reconcile.ok con conteos", async () => {
  logged.length = 0;
  const rows = emptyRows();
  rows.prospects.push(prospectRow(P_NEW, ME));
  const out = await service.reconciliarBaseDatosUsuario(memoryDb(), ME, rowsToDb(rows));
  assert.ok(out.data.clients[P_NEW]);
  assert.equal(out.partial, undefined);
  const lines = logged.filter((l) => l.event.startsWith("sync.reconcile"));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, "sync.reconcile.ok");
  assert.equal(lines[0].fields.inserted.prospects, 1);
  assert.equal(lines[0].fields.protocol, "1");
});

test("(b) protocolo 1 con un rechazo: ServiceError 409 sync_partial, nunca un 2xx", async () => {
  logged.length = 0;
  const sb = memoryDb({ seed: { prospects: [prospectRow(P_HIDDEN, ME, { hidden: true })] } });
  await assert.rejects(
    service.reconciliarBaseDatosUsuario(sb, ME, blobWithHiddenConflict()),
    (err) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.status, 409);
      assert.equal(err.code, "sync_partial");
      assert.deepEqual(err.details.rejected_counts, { conflicto_oculto: 1 });
      assert.deepEqual(err.details.rejected, [{ table: "prospects", id: P_HIDDEN, code: "conflicto_oculto" }]);
      return true;
    },
  );
  assert.ok(sb.tables.prospects.some((r) => r.id === P_NEW), "la fila buena sí se escribió");
  const line = logged.find((l) => l.event === "sync.reconcile.partial");
  assert.equal(line.level, "warn");
  assert.equal(line.fields.rejected.conflicto_oculto, 1);
  assert.equal(line.fields.inserted.prospects, 1);
});

test("(b) protocolo 2 con un rechazo: 200 con partial y rejected", async () => {
  const sb = memoryDb({ seed: { prospects: [prospectRow(P_HIDDEN, ME, { hidden: true })] } });
  const out = await service.reconciliarBaseDatosUsuario(sb, ME, blobWithHiddenConflict(), { protocol: "2" });
  assert.equal(out.partial, true);
  assert.deepEqual(out.rejected.map((r) => r.code), ["conflicto_oculto"]);
  assert.ok(out.data.clients[P_NEW]);
});

test("(b) runService responde 409 con code sync_partial y la lista de rechazos", async () => {
  const { runService } = await import("../routes/route-utils.js");
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  const sb = memoryDb({ seed: { prospects: [prospectRow(P_HIDDEN, ME, { hidden: true })] } });
  await runService(res, () => service.reconciliarBaseDatosUsuario(sb, ME, blobWithHiddenConflict()));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "sync_partial");
  assert.equal(res.body.error, service.SYNC_PARTIAL_MESSAGE);
  assert.deepEqual(res.body.rejected_counts, { conflicto_oculto: 1 });
  assert.equal(res.body.data, undefined, "sin data: el cliente no tiene nada con qué reemplazar su base");
});

test("(c) el servicio aplica expedientes:crear como REST", async () => {
  permissionDenied.add("expedientes:crear");
  try {
    const rows = emptyRows();
    rows.prospects.push(prospectRow(P_NEW, ME));
    await assert.rejects(
      service.reconciliarBaseDatosUsuario(memoryDb({ deny: new Set(["expedientes:crear"]) }), ME, rowsToDb(rows)),
      (err) => err.status === 409 && err.details.rejected[0].code === "sin_permiso",
    );
  } finally {
    permissionDenied.clear();
  }
});
