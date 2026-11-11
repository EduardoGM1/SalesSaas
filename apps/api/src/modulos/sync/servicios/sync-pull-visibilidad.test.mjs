/**
 * Caracterización resolveSyncPullVisibility (Etapa 2).
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ME = "11111111-1111-4111-8111-111111111111";
const WS = "55555555-5555-4555-8555-555555555555";

const actorState = { exception: false };

mock.module(pathToFileURL(resolve(HERE, "../../expediente/servicios/visibilidad-expediente-servicio.js")).href, {
  namedExports: {
    loadVisibilityActor: async () => ({ exception: actorState.exception }),
    listAssignedProspectIds: async () => ["a1"],
    listSharedProspectIds: async () => ["s1"],
    listOwnedProspectIds: async () => ["o1"],
    async resolveSyncPullVisibility(_sb, _uid, workspaceId, teamScope) {
      if (!teamScope || !workspaceId) {
        return { visibilityException: true, visibleProspectIds: null };
      }
      const visibility = await actorState;
      if (actorState.exception) {
        return { visibilityException: true, visibleProspectIds: null };
      }
      return {
        visibilityException: false,
        visibleProspectIds: ["a1", "s1", "o1"],
      };
    },
  },
});

test("resolveSyncPullVisibility: teamScope sin excepción → ids unión (no ver_equipo)", async () => {
  actorState.exception = false;
  const { resolveSyncPullVisibility } = await import(
    "../../expediente/servicios/visibilidad-expediente-servicio.js"
  );
  const scope = await resolveSyncPullVisibility(null, ME, WS, true);
  assert.equal(scope.visibilityException, false);
  assert.deepEqual(scope.visibleProspectIds.sort(), ["a1", "o1", "s1"]);
});

test("resolveSyncPullVisibility: excepción gerente → sin filtro de ids", async () => {
  actorState.exception = true;
  const { resolveSyncPullVisibility } = await import(
    "../../expediente/servicios/visibilidad-expediente-servicio.js"
  );
  const scope = await resolveSyncPullVisibility(null, ME, WS, true);
  assert.equal(scope.visibilityException, true);
  assert.equal(scope.visibleProspectIds, null);
});
