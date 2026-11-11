/**
 * resolveSyncPullVisibility real (sin mock del módulo): Etapa 2 sync.
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ME = "11111111-1111-4111-8111-111111111111";
const WS = "55555555-5555-4555-8555-555555555555";

const tables = {
  profiles: [{ id: ME, is_super_admin: false }],
  workspace_miembros: [{
    usuario_id: ME,
    workspace_id: WS,
    rol_en_workspace: "vendedor",
    roles: { slug: "cerrador" },
  }],
  workspaces: [{ id: WS, empresa_id: "e1" }],
  empresa_miembros: [{ es_admin: false }],
  prospect_workflows: [{ prospect_id: "asg-1" }],
  prospect_shares: [{ prospect_id: "sh-1" }],
  prospects: [{ id: "own-1" }],
};

function chain(table) {
  const filters = [];
  const api = {
    select() { return api; },
    eq(col, val) {
      filters.push([col, val]);
      return api;
    },
    or() { return api; },
    neq() { return api; },
    maybeSingle: async () => ({ data: pickOne(table, filters), error: null }),
  };
  Object.defineProperty(api, "then", {
    enumerable: false,
    value(onFulfilled, onRejected) {
      return pickMany(table, filters).then(onFulfilled, onRejected);
    },
  });
  return api;
}

function pickOne(table, filters) {
  const rows = tables[table] || [];
  return rows.find((r) => filters.every(([c, v]) => r[c] === v || nestedEq(r, c, v))) ?? null;
}

function nestedEq(row, col, val) {
  if (col === "prospects.workspace_id") return true;
  return false;
}

async function pickMany(table) {
  if (table === "prospect_workflows") {
    return { data: tables.prospect_workflows, error: null };
  }
  if (table === "prospect_shares") {
    return { data: tables.prospect_shares, error: null };
  }
  if (table === "prospects") {
    return { data: tables.prospects, error: null };
  }
  return { data: [], error: null };
}

const fakeSb = { from: (t) => chain(t) };

mock.module(pathToFileURL(resolve(HERE, "../../../lib/supabase-server.js")).href, {
  namedExports: {
    createServiceSupabaseClient: () => fakeSb,
  },
});

test("resolveSyncPullVisibility real: cerrador teamScope une asignado+share+dueño", async () => {
  const { resolveSyncPullVisibility } = await import("./visibilidad-expediente-servicio.js");
  const scope = await resolveSyncPullVisibility(fakeSb, ME, WS, true);
  assert.equal(scope.visibilityException, false);
  assert.deepEqual(scope.visibleProspectIds.sort(), ["asg-1", "own-1", "sh-1"]);
});
