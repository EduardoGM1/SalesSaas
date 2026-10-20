/**
 * Caracterización API agenda (antes del move a modulos/agenda).
 * Códigos y formas actuales. No es el comportamiento deseado si difiere del comentario.
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ServiceError } from "../../../lib/service-error.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../../../..");
const SERVICE = resolve(HERE, "entradas-agenda-servicio.js");
const WS_MOD = resolve(HERE, "../../../lib/workspace-scope.js");
const USER = "11111111-1111-4111-8111-111111111111";
const WS = "33333333-3333-4333-8333-333333333333";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ENTRY = "77777777-7777-4777-8777-777777777777";

const ctx = { workspaceId: WS, teamScope: false, tipo: "personal", rol: null, active: null };

mock.module(pathToFileURL(WS_MOD).href, {
  namedExports: {
    async getRequestWorkspaceContext() {
      return ctx;
    },
    scopeByWorkspace(query, workspaceId) {
      if (!workspaceId) throw new ServiceError("Workspace activo requerido.", 403);
      return query.eq("workspace_id", workspaceId);
    },
  },
});

const svc = await import(pathToFileURL(SERVICE).href);

function sb(handlers) {
  return {
    from() {
      const q = {
        filters: [],
        inserted: null,
        updated: null,
        select() { return q; },
        insert(row) { q.inserted = row; return q; },
        update(patch) { q.updated = patch; return q; },
        delete() { return q; },
        eq(col, val) { q.filters.push([col, val]); return q; },
        gte(col, val) { q.filters.push(["gte", col, val]); return q; },
        lte(col, val) { q.filters.push(["lte", col, val]); return q; },
        order() { return q; },
        range() { return q; },
        single() { return Promise.resolve(handlers.insert(q)); },
        maybeSingle() { return Promise.resolve(handlers.maybe(q)); },
        then(resolve, reject) { return Promise.resolve(handlers.list(q)).then(resolve, reject); },
      };
      return q;
    },
  };
}

const emptyList = { list: () => ({ data: [], error: null, count: 0 }), insert: () => ({ data: null, error: null }), maybe: () => ({ data: null, error: null }) };

let chain = Promise.resolve();
function serial(name, fn) {
  test(name, async () => {
    const run = chain.then(fn);
    chain = run.then(() => {}, () => {});
    return run;
  });
}

serial("crear sin type o fecha → 400 (no 422)", async () => {
  ctx.workspaceId = WS;
  await assert.rejects(
    () => svc.crearEntradaAgenda(sb(emptyList), USER, { note: "x" }),
    (err) => {
      assert.equal(err.status, 400);
      assert.notEqual(err.status, 422);
      assert.match(err.message, /type y entry_date\/date son requeridos/);
      return true;
    },
  );
});

serial("crear nota válida devuelve fila con type, fecha, user y workspace", async () => {
  ctx.workspaceId = WS;
  const row = await svc.crearEntradaAgenda(
    sb({ ...emptyList, insert: (q) => ({ data: q.inserted, error: null }) }),
    USER,
    { type: "nota", entry_date: "2026-10-20", note: "hola", kind: "no-tour", source: "no-tour" },
  );
  assert.equal(row.type, "nota");
  assert.equal(row.entry_date, "2026-10-20");
  assert.equal(row.user_id, USER);
  assert.equal(row.workspace_id, WS);
  assert.equal(row.kind, "no-tour");
  assert.equal(row.source, "no-tour");
  assert.equal(row.note, "hola");
});

serial("id no uuid en obtener/actualizar/eliminar → 400", async () => {
  for (const fn of [
    () => svc.obtenerEntradaAgenda(sb(emptyList), USER, "no-es-uuid"),
    () => svc.actualizarEntradaAgenda(sb(emptyList), USER, "no-es-uuid", { note: "a" }),
    () => svc.eliminarEntradaAgenda(sb(emptyList), USER, "no-es-uuid"),
  ]) {
    await assert.rejects(fn, (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.message, "ID inválido.");
      return true;
    });
  }
});

serial("sin workspace activo → 403 Workspace activo requerido", async () => {
  ctx.workspaceId = null;
  await assert.rejects(
    () => svc.listarEntradasAgenda(sb(emptyList), USER, { limit: 50, offset: 0 }),
    (err) => {
      assert.equal(err.status, 403);
      assert.equal(err.message, "Workspace activo requerido.");
      return true;
    },
  );
  ctx.workspaceId = WS;
});

serial("obtener ausente o de otro workspace → 404", async () => {
  ctx.workspaceId = WS;
  await assert.rejects(
    () => svc.obtenerEntradaAgenda(
      sb({ ...emptyList, maybe: () => ({ data: null, error: null }) }),
      USER,
      ENTRY,
    ),
    (err) => {
      assert.equal(err.status, 404);
      assert.equal(err.message, "Entrada no encontrada.");
      return true;
    },
  );
});

serial("lectura filtra workspace; sin teamScope también user_id", async () => {
  ctx.workspaceId = WS;
  ctx.teamScope = false;
  let seen = [];
  await svc.listarEntradasAgenda(
    sb({ ...emptyList, list: (q) => { seen = q.filters; return { data: [], error: null, count: 0 }; } }),
    USER,
    { limit: 50, offset: 0 },
  );
  assert.deepEqual(seen.filter((f) => f[0] !== "gte" && f[0] !== "lte"), [
    ["workspace_id", WS],
    ["user_id", USER],
  ]);
});

serial("teamScope omite user_id en lectura y no en actualización", async () => {
  ctx.workspaceId = WS;
  ctx.teamScope = true;
  let read = [];
  await svc.listarEntradasAgenda(
    sb({ ...emptyList, list: (q) => { read = q.filters; return { data: [], error: null, count: 0 }; } }),
    USER,
    { limit: 50, offset: 0 },
  );
  assert.equal(read.some((f) => f[0] === "user_id"), false);
  assert.equal(read.some((f) => f[0] === "workspace_id" && f[1] === WS), true);

  let write = [];
  await assert.rejects(
    () => svc.actualizarEntradaAgenda(
      sb({ ...emptyList, maybe: (q) => { write = q.filters; return { data: null, error: null }; } }),
      USER,
      ENTRY,
      { note: "edit" },
    ),
    (err) => err.status === 404,
  );
  assert.equal(write.some((f) => f[0] === "user_id" && f[1] === USER), true);
  assert.equal(write.some((f) => f[0] === "workspace_id" && f[1] === WS), true);
  ctx.teamScope = false;
});

serial("actualizar de otro dueño → 404 (no 403)", async () => {
  ctx.workspaceId = WS;
  await assert.rejects(
    () => svc.actualizarEntradaAgenda(
      sb({
        ...emptyList,
        maybe: (q) => ({ data: q.filters.some((f) => f[0] === "user_id" && f[1] === OTHER) ? { id: ENTRY } : null, error: null }),
      }),
      USER,
      ENTRY,
      { note: "x" },
    ),
    (err) => {
      assert.equal(err.status, 404);
      return true;
    },
  );
});

serial("eliminar sin fila → 404; con fila → { ok: true }", async () => {
  await assert.rejects(
    () => svc.eliminarEntradaAgenda(
      sb({ ...emptyList, list: () => ({ error: null, count: 0 }) }),
      USER,
      ENTRY,
    ),
    (err) => err.status === 404,
  );
  const ok = await svc.eliminarEntradaAgenda(
    sb({ ...emptyList, list: () => ({ error: null, count: 1 }) }),
    USER,
    ENTRY,
  );
  assert.deepEqual(ok, { ok: true });
});

serial("listar forma { data, total, limit, offset }", async () => {
  ctx.workspaceId = WS;
  const page = await svc.listarEntradasAgenda(
    sb({ ...emptyList, list: () => ({ data: [{ id: ENTRY, type: "descanso" }], error: null, count: 1 }) }),
    USER,
    { limit: 50, offset: 0 },
  );
  assert.equal(page.total, 1);
  assert.equal(page.limit, 50);
  assert.equal(page.offset, 0);
  assert.equal(page.data[0].type, "descanso");
});

serial("REST de agenda no aplica expedientes:editar", () => {
  const src = readFileSync(SERVICE, "utf8");
  assert.equal(src.includes("expedientes:editar"), false);
  assert.equal(src.includes("requireWorkspacePermission"), false);
});

serial("deuda sync: alta de calendar_entries exige expedientes:editar en sync.js", () => {
  const src = readFileSync(resolve(ROOT, "packages/shared/src/data/sync.js"), "utf8");
  assert.match(src, /calendar_entries:\s*"expedientes:editar"/);
});
