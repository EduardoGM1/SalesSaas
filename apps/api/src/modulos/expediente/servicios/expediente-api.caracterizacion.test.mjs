/**
 * Caracterización de la API de expediente, antes de moverla.
 * Códigos, forma de lista y permisos actuales. El mock solo registra la clave.
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

function first(paths) {
  const found = paths.find((p) => existsSync(p));
  if (!found) throw new Error(`no está ${paths.join(" ni ")}`);
  return found;
}

const PROSPECTS = first([
  resolve(HERE, "prospectos-servicio.js"),
  resolve(API, "services/prospects-service.js"),
]);
const SHARES = first([
  resolve(HERE, "compartir-servicio.js"),
  resolve(API, "services/sharing-service.js"),
]);
const PROSPECT_ROUTES = first([
  resolve(HERE, "../rutas/prospectos.js"),
  resolve(API, "routes/prospects.js"),
]);
const SHARE_ROUTES = first([
  resolve(HERE, "../rutas/compartir.js"),
  resolve(API, "routes/shares.js"),
]);

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const WS = "33333333-3333-4333-8333-333333333333";
const PROSPECT = "44444444-4444-4444-8444-444444444444";

const ctx = { workspaceId: WS, teamScope: false, tipo: "personal", rol: null, active: null };
const gate = { deny: new Set(), calls: [] };
const db = {
  listError: null,
  insertError: null,
  prospect: null,
  workflow: null,
  workspaceTipo: "personal",
  memberRole: "vendedor",
  permKeys: [],
  deleteError: null,
  deleteCount: 1,
};

mock.module(pathToFileURL(resolve(API, "lib/workspace-scope.js")).href, {
  namedExports: {
    async getRequestWorkspaceContext() {
      return ctx;
    },
    async getRequestWorkspaceId() {
      return ctx.workspaceId;
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

mock.module(pathToFileURL(resolve(API, "lib/workspace-permission-rpc.js")).href, {
  namedExports: {
    async rpcEffectiveWorkspacePermissions() {
      return db.permKeys;
    },
    permissionDeniedError() {
      return new ServiceError("No tienes permiso para realizar esta acción.", 403, "WORKSPACE_PERMISSION_DENIED");
    },
  },
});

function payload(q) {
  if (q.table === "prospect_workflows") return { data: q.terminal === "maybe" ? db.workflow : [], error: null };
  if (q.table === "workspaces") return { data: { tipo: db.workspaceTipo }, error: null };
  if (q.table === "workspace_miembros") return { data: { rol_en_workspace: db.memberRole }, error: null };
  if (q.table === "sales") return { data: [], error: null };
  if (q.table === "prospects" && q.op === "insert") return { data: q.row, error: db.insertError };
  if (q.table === "prospects" && q.op === "update") {
    return { data: { id: PROSPECT, ...q.patch }, error: null };
  }
  if (q.table === "prospects" && q.op === "delete") return { error: db.deleteError, count: db.deleteCount };
  if (q.table === "prospects" && q.terminal === "maybe") return { data: db.prospect, error: null };
  return { data: db.listError ? null : [{ id: PROSPECT }], error: db.listError, count: db.listError ? null : 1 };
}

function sb() {
  return {
    from(table) {
      const q = {
        table,
        op: "select",
        patch: null,
        row: null,
        terminal: "then",
        select() { return q; },
        insert(row) { q.op = "insert"; q.row = row; return q; },
        update(patch) { q.op = "update"; q.patch = patch; return q; },
        delete() { q.op = "delete"; return q; },
        eq() { return q; },
        neq() { return q; },
        in() { return q; },
        or() { return q; },
        order() { return q; },
        range() { return q; },
        maybeSingle() { q.terminal = "maybe"; return Promise.resolve(payload(q)); },
        single() { q.terminal = "single"; return Promise.resolve(payload(q)); },
        then(resolve, reject) { return Promise.resolve(payload(q)).then(resolve, reject); },
      };
      return q;
    },
  };
}

function reset() {
  ctx.workspaceId = WS;
  ctx.teamScope = false;
  gate.deny = new Set();
  gate.calls = [];
  db.listError = null;
  db.insertError = null;
  db.prospect = null;
  db.workflow = null;
  db.workspaceTipo = "personal";
  db.memberRole = "vendedor";
  db.permKeys = [];
  db.deleteError = null;
  db.deleteCount = 1;
}

async function codes(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

const prospects = await import(pathToFileURL(PROSPECTS).href);
const shares = await import(pathToFileURL(SHARES).href);

test("la lista pide ver_propios y devuelve data, total, limit y offset", async () => {
  reset();
  const out = await prospects.listProspects(sb(), USER, { limit: 10, offset: 0, status: "pendiente" });
  assert.deepEqual(gate.calls, ["expedientes:ver_propios"]);
  assert.deepEqual(out, { data: [{ id: PROSPECT }], total: 1, limit: 10, offset: 0 });
});

test("la lista de equipo pide ver_equipo", async () => {
  reset();
  ctx.teamScope = true;
  await prospects.listProspects(sb(), USER, { limit: 5, offset: 5 });
  assert.deepEqual(gate.calls, ["expedientes:ver_equipo"]);
});

test("un error de lectura de la lista es 500", async () => {
  reset();
  db.listError = { message: "boom" };
  const err = await codes(() => prospects.listProspects(sb(), USER, { limit: 10, offset: 0 }));
  assert.equal(err.status, 500);
  assert.equal(err.message, "boom");
});

test("crear pide expedientes:crear y devuelve la fila", async () => {
  reset();
  const row = await prospects.createProspect(sb(), USER, { name: "Ana" });
  assert.deepEqual(gate.calls, ["expedientes:crear"]);
  assert.equal(row.user_id, USER);
  assert.equal(row.workspace_id, WS);
  assert.equal(row.name, "Ana");
  assert.equal(row.name1, "Ana");
});

test("crear sin permiso es 403 y no inserta", async () => {
  reset();
  gate.deny.add("expedientes:crear");
  const err = await codes(() => prospects.createProspect(sb(), USER, { name: "Ana" }));
  assert.equal(err.status, 403);
  assert.equal(err.code, "WORKSPACE_PERMISSION_DENIED");
});

test("un insert rechazado es 400", async () => {
  reset();
  db.insertError = { message: "duplicado" };
  const err = await codes(() => prospects.createProspect(sb(), USER, { name: "Ana" }));
  assert.equal(err.status, 400);
  assert.equal(err.message, "duplicado");
});

test("un id inválido al leer es 400", async () => {
  reset();
  const err = await codes(() => prospects.getProspect(sb(), USER, "no"));
  assert.equal(err.status, 400);
  assert.equal(err.message, "ID inválido.");
});

test("un expediente ausente es 404", async () => {
  reset();
  const err = await codes(() => prospects.getProspect(sb(), USER, PROSPECT));
  assert.equal(err.status, 404);
  assert.equal(err.message, "Expediente no encontrado.");
});

test("un parche vacío es 400", async () => {
  reset();
  const err = await codes(() => prospects.updateProspect(sb(), USER, PROSPECT, {}));
  assert.equal(err.status, 400);
  assert.equal(err.message, "Sin campos para actualizar.");
});

test("el dueño con expedientes:editar guarda el nombre", async () => {
  reset();
  db.prospect = { id: PROSPECT, user_id: USER, workspace_id: WS };
  db.permKeys = ["expedientes:editar"];
  const row = await prospects.updateProspect(sb(), USER, PROSPECT, { name: "Ana" });
  assert.deepEqual(gate.calls, ["expedientes:editar"]);
  assert.equal(row.name, "Ana");
  assert.equal(row.name1, "Ana");
});

test("quien no puede editar la ficha recibe 403", async () => {
  reset();
  db.prospect = { id: PROSPECT, user_id: USER, workspace_id: WS };
  const err = await codes(() => prospects.updateProspect(sb(), OTHER, PROSPECT, { name: "Ana" }));
  assert.equal(err.status, 403);
  assert.equal(err.code, "WORKSPACE_PERMISSION_DENIED");
});

test("en sala un no gerente no elimina", async () => {
  reset();
  db.workspaceTipo = "sala_de_venta";
  const err = await codes(() => prospects.deleteProspect(sb(), USER, PROSPECT));
  assert.deepEqual(gate.calls, ["expedientes:eliminar"]);
  assert.equal(err.status, 403);
  assert.equal(err.message, "Los expedientes de la sala no se pueden eliminar. Contacta a tu gerente.");
});

test("eliminar devuelve ok", async () => {
  reset();
  const out = await prospects.deleteProspect(sb(), USER, PROSPECT);
  assert.deepEqual(out, { ok: true });
});

test("eliminar un expediente ajeno es 404", async () => {
  reset();
  db.deleteCount = 0;
  const err = await codes(() => prospects.deleteProspect(sb(), USER, PROSPECT));
  assert.equal(err.status, 404);
  assert.equal(err.message, "Expediente no encontrado.");
});

test("un historial de workflow bloquea el borrado con 409", async () => {
  reset();
  db.deleteError = { message: "historial del workflow es inmutable" };
  const err = await codes(() => prospects.deleteProspect(sb(), USER, PROSPECT));
  assert.equal(err.status, 409);
  assert.match(err.message, /no se puede eliminar/);
});

test("compartir valida id, permiso y que no sea uno mismo", async () => {
  reset();
  const badProspect = await codes(() => shares.createShare(sb(), USER, "no", { shared_with_id: OTHER }));
  assert.equal(badProspect.status, 400);
  assert.equal(badProspect.message, "Expediente inválido.");
  const badUser = await codes(() => shares.createShare(sb(), USER, PROSPECT, { shared_with_id: "no" }));
  assert.equal(badUser.status, 400);
  assert.equal(badUser.message, "Usuario inválido.");
  const badPerm = await codes(() => shares.createShare(sb(), USER, PROSPECT, { shared_with_id: OTHER, permission: "admin" }));
  assert.equal(badPerm.status, 400);
  assert.equal(badPerm.message, "Permiso inválido.");
  const self = await codes(() => shares.createShare(sb(), USER, PROSPECT, { shared_with_id: USER }));
  assert.equal(self.status, 400);
  assert.equal(self.message, "No puedes compartir contigo mismo.");
});

test("compartir sin permiso es 403", async () => {
  reset();
  gate.deny.add("expedientes:compartir");
  const err = await codes(() => shares.createShare(sb(), USER, PROSPECT, { shared_with_id: OTHER }));
  assert.deepEqual(gate.calls, ["expedientes:compartir"]);
  assert.equal(err.status, 403);
  assert.equal(err.code, "WORKSPACE_PERMISSION_DENIED");
});

test("compartir un expediente que no es propio es 404", async () => {
  reset();
  const err = await codes(() => shares.createShare(sb(), USER, PROSPECT, { shared_with_id: OTHER }));
  assert.equal(err.status, 404);
  assert.equal(err.message, "Expediente no encontrado.");
});

test("las rutas conservan paths y códigos", () => {
  const prospectsSrc = readFileSync(PROSPECT_ROUTES, "utf8");
  const sharesSrc = readFileSync(SHARE_ROUTES, "utf8");
  for (const line of [
    'router.get("/prospects"',
    'router.get("/prospects/active"',
    'router.post("/prospects", rutaAutenticada',
    "successStatus: 201",
    'router.get("/prospects/:id"',
    'router.patch("/prospects/:id"',
    'router.delete("/prospects/:id"',
    '{ wrap: "ok" }',
    'router.get("/prospects/:id/participants"',
    'router.post("/prospects/:id/chat"',
  ]) {
    assert.equal(prospectsSrc.includes(line), true, line);
  }
  for (const line of [
    'router.get("/shares/received"',
    'router.get("/prospects/:id/shares"',
    'router.post("/prospects/:id/shares"',
    'router.post("/prospects/:id/share-invites"',
    'router.post("/share-invites/:token/redeem"',
    'router.patch("/shares/:id"',
    'router.delete("/shares/:id"',
    'router.get("/shared-prospects/:id"',
    'router.patch("/shared-prospects/:id"',
    'router.put("/shared-prospects/:id/tools/:tool"',
  ]) {
    assert.equal(sharesSrc.includes(line), true, line);
  }
  assert.equal(sharesSrc.includes("successStatus: 201"), true);
});
