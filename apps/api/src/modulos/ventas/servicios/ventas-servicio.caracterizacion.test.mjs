/**
 * Caracterización de la API de ventas, antes de moverla.
 * Códigos, forma de lista y permisos actuales. El mock de permisos solo
 * registra la clave y puede denegarla; no cambia el servicio.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { mock } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ServiceError } from "../../../lib/service-error.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const API = resolve(HERE, "../../..");
const LEGACY_SERVICE = resolve(API, "services/sales-service.js");
const MOVED_SERVICE = resolve(HERE, "ventas-servicio.js");
const LEGACY_ROUTE = resolve(API, "routes/sales.js");
const MOVED_ROUTE = resolve(HERE, "../rutas/ventas.js");
const LEGACY_REPO = resolve(API, "repositories/sales-repository.js");
const MOVED_REPO = resolve(HERE, "../repositorio/ventas-repositorio.js");

function first(paths) {
  const found = paths.find((p) => existsSync(p));
  if (!found) throw new Error(`no está ${paths.join(" ni ")}`);
  return found;
}

const SERVICE = first([MOVED_SERVICE, LEGACY_SERVICE]);
const ROUTE = first([MOVED_ROUTE, LEGACY_ROUTE]);
const REPO = first([MOVED_REPO, LEGACY_REPO]);
const USER = "11111111-1111-4111-8111-111111111111";
const WS = "33333333-3333-4333-8333-333333333333";
const SALE = "77777777-7777-4777-8777-777777777777";
const PROSPECT = "44444444-4444-4444-8444-444444444444";

const ctx = { workspaceId: WS, teamScope: false, tipo: "personal", rol: null, active: null };
const gate = { deny: new Set(), calls: [] };
const rhCalls = [];

mock.module(pathToFileURL(resolve(API, "lib/workspace-scope.js")).href, {
  exports: {
    async getRequestWorkspaceContext() {
      return ctx;
    },
    async requireWorkspacePermission(_supabase, _userId, permission, workspaceId) {
      gate.calls.push(permission);
      const resolved = workspaceId || ctx.workspaceId;
      if (!resolved) throw new ServiceError("Workspace activo requerido.", 403);
      if (gate.deny.has(permission)) {
        throw new ServiceError("No tienes permiso para realizar esta acción.", 403, "WORKSPACE_PERMISSION_DENIED");
      }
      return resolved;
    },
    scopeByWorkspace(query, workspaceId) {
      if (!workspaceId) throw new ServiceError("Workspace activo requerido.", 403);
      return query.eq("workspace_id", workspaceId);
    },
  },
});

mock.module(pathToFileURL(resolve(API, "services/royal-holiday-service.js")).href, {
  exports: {
    async handleCancelacionVenta(saleId) {
      rhCalls.push(saleId);
    },
  },
});

const svc = await import(pathToFileURL(SERVICE).href);

let last = null;
function sb() {
  return {
    from() {
      const q = {
        filters: [],
        inserted: null,
        updated: null,
        deleted: false,
        select() { return q; },
        insert(row) { q.inserted = row; return q; },
        update(patch) { q.updated = patch; return q; },
        delete() { q.deleted = true; return q; },
        eq(col, val) { q.filters.push([col, val]); return q; },
        gte(col, val) { q.filters.push(["gte", col, val]); return q; },
        lte(col, val) { q.filters.push(["lte", col, val]); return q; },
        order() { return q; },
        range() { return q; },
        single() { return Promise.resolve({ data: q.inserted, error: null }); },
        maybeSingle() { return Promise.resolve({ data: q.updated ? { id: SALE, ...q.updated } : null, error: null }); },
        then(resolve, reject) {
          const payload = q.deleted
            ? { error: null, count: q.filters.some((f) => f[0] === "user_id" && f[1] === USER) ? 1 : 0 }
            : { data: [{ id: SALE }], error: null, count: 1 };
          return Promise.resolve(payload).then(resolve, reject);
        },
      };
      last = q;
      return q;
    },
  };
}

function reset() {
  ctx.workspaceId = WS;
  ctx.teamScope = false;
  gate.deny = new Set();
  gate.calls = [];
  rhCalls.length = 0;
}

const saleBody = {
  prospect_id: PROSPECT,
  sale_date: "2026-11-09",
  vol: 1500,
  tours: 1,
  contract: "VB1",
  status: "venta",
  note: "nota",
};

test("rutas: paths, 201 y { ok: true } siguen en el montaje", () => {
  const src = readFileSync(ROUTE, "utf8");
  assert.match(src, /router\.get\("\/sales"/);
  assert.match(src, /router\.post\("\/sales".*successStatus: 201/s);
  assert.match(src, /router\.get\("\/sales\/:id"/);
  assert.match(src, /router\.patch\("\/sales\/:id"/);
  assert.match(src, /router\.delete\("\/sales\/:id".*wrap: "ok"/s);
});

test("repositorio: columnas de lista, sin select asterisco", () => {
  const src = readFileSync(REPO, "utf8");
  assert.match(src, /SALE_LIST_COLUMNS/);
  assert.match(src, /prospects\(name, name1, prospect_code\)/);
  assert.equal(src.includes('select("*') || src.includes("select('*"), false);
});

test("servicio: permisos y el import de cancelación RH", () => {
  const src = readFileSync(SERVICE, "utf8");
  assert.match(src, /"sales:history"/);
  assert.match(src, /"ventas:registrar"/);
  assert.match(src, /"sales:view_detail"/);
  assert.match(src, /"ventas:editar"/);
  assert.match(src, /"ventas:cancelar"/);
  assert.match(src, /import\(.*royal-holiday-service/);
  assert.match(src, /handleCancelacionVenta/);
});

test("alta inválida → 400; alta válida guarda fecha, usuario y workspace", async () => {
  reset();
  await assert.rejects(
    () => svc.crearVenta(sb(), USER, { note: "x" }),
    (err) => err.status === 400 && err.message === "prospect_id y sale_date/date son requeridos.",
  );
  const row = await svc.crearVenta(sb(), USER, saleBody);
  assert.equal(gate.calls.at(-1), "ventas:registrar");
  assert.equal(row.sale_date, "2026-11-09");
  assert.equal(row.user_id, USER);
  assert.equal(row.workspace_id, WS);
  assert.equal(row.prospect_id, PROSPECT);
  assert.equal(row.vol, 1500);
  assert.equal(row.status, "venta");
});

test("sin ventas:registrar → 403 y no inserta", async () => {
  reset();
  gate.deny.add("ventas:registrar");
  await assert.rejects(
    () => svc.crearVenta(sb(), USER, saleBody),
    (err) => err.status === 403 && err.code === "WORKSPACE_PERMISSION_DENIED",
  );
});

test("listado: forma, permiso sales:history y filtro de workspace y usuario", async () => {
  reset();
  const page = await svc.listarVentas(sb(), USER, {
    limit: 50,
    offset: 0,
    prospect_id: PROSPECT,
    from: "2026-11-01",
    to: "2026-11-30",
  });
  assert.deepEqual(Object.keys(page).sort(), ["data", "limit", "offset", "total"]);
  assert.equal(page.total, 1);
  assert.equal(page.limit, 50);
  assert.equal(page.offset, 0);
  assert.equal(gate.calls[0], "sales:history");
  assert.deepEqual(last.filters, [
    ["workspace_id", WS],
    ["user_id", USER],
    ["prospect_id", PROSPECT],
    ["gte", "sale_date", "2026-11-01"],
    ["lte", "sale_date", "2026-11-30"],
  ]);
  ctx.teamScope = true;
  await svc.listarVentas(sb(), USER, { limit: 50, offset: 0 });
  assert.equal(last.filters.some((f) => f[0] === "user_id"), false);
  assert.equal(last.filters.some((f) => f[0] === "workspace_id" && f[1] === WS), true);
});

test("id no uuid → 400; ausente → 404 Venta no encontrada", async () => {
  reset();
  await assert.rejects(
    () => svc.obtenerVenta(sb(), USER, "no-es-uuid"),
    (err) => err.status === 400 && err.message === "ID inválido.",
  );
  await assert.rejects(
    () => svc.obtenerVenta({
      from() {
        const q = {
          filters: [],
          select() { return q; },
          eq() { return q; },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        };
        return q;
      },
    }, USER, SALE),
    (err) => err.status === 404 && err.message === "Venta no encontrada.",
  );
  assert.equal(gate.calls.at(-1), "sales:view_detail");
});

test("editar usa ventas:editar; cancelada llama RH y otro estado no", async () => {
  reset();
  const edited = await svc.actualizarVenta(sb(), USER, SALE, { note: "editada", status: "venta" });
  assert.equal(edited.note, "editada");
  assert.equal(last.filters.some((f) => f[0] === "user_id" && f[1] === USER), true);
  assert.equal(last.filters.some((f) => f[0] === "workspace_id" && f[1] === WS), true);
  assert.equal(rhCalls.length, 0);
  assert.equal(gate.calls.at(-1), "ventas:editar");
  const cancelled = await svc.actualizarVenta(sb(), USER, SALE, { status: "cancelada" });
  assert.equal(cancelled.status, "cancelada");
  assert.deepEqual(rhCalls, [SALE]);
});

test("borrar devuelve { ok: true } con ventas:cancelar; otro dueño → 404", async () => {
  reset();
  const ok = await svc.eliminarVenta(sb(), USER, SALE);
  assert.deepEqual(ok, { ok: true });
  assert.equal(gate.calls.at(-1), "ventas:cancelar");
  await assert.rejects(
    () => svc.eliminarVenta({
      from() {
        const q = {
          filters: [],
          delete() { return q; },
          eq(col, val) { q.filters.push([col, val]); return q; },
          then(resolve, reject) {
            return Promise.resolve({ error: null, count: 0 }).then(resolve, reject);
          },
        };
        return q;
      },
    }, USER, SALE),
    (err) => err.status === 404 && err.message === "Venta no encontrada.",
  );
});
