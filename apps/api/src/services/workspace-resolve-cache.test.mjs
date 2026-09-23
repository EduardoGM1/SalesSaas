import assert from "node:assert/strict";
import test from "node:test";
import { resolveActiveWorkspaceId } from "./workspace-service.js";

test("resolveActiveWorkspaceId reusa knownList y no vuelve a consultar membresías", async () => {
  let fromCalls = 0;
  const supabase = {
    from() {
      fromCalls += 1;
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: null, error: null }) };
            },
          };
        },
      };
    },
    rpc: async () => ({ data: null, error: null }),
  };
  const list = [
    { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", tipo: "personal" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", tipo: "sala_de_venta" },
  ];
  const id = await resolveActiveWorkspaceId(
    supabase,
    "11111111-1111-1111-1111-111111111111",
    "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    list,
  );
  assert.equal(id, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  assert.equal(fromCalls, 0);
});
