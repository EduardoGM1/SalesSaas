import assert from "node:assert/strict";
import test from "node:test";
import { requireWorkspacePermission, requireWorkspaceFlag } from "./workspace-scope.js";
import {
  MSG_PERMISSIONS_UNAVAILABLE,
  MSG_PERMISSION_DENIED,
  MSG_WORKSPACE_ACCESS_DENIED,
  MSG_FLAGS_UNAVAILABLE,
  MSG_FLAG_DENIED,
  WORKSPACE_ACCESS_DENIED,
  WORKSPACE_PERMISSION_DENIED,
  WORKSPACE_PERMISSIONS_UNAVAILABLE,
  WORKSPACE_FLAGS_UNAVAILABLE,
  WORKSPACE_FLAG_DENIED,
  resolveSalaSessionPermissionKeys,
  rpcEffectiveWorkspacePermissions,
} from "./workspace-permission-rpc.js";
import { resolveSessionFlags } from "../services/flags-service.js";
import { ServiceError } from "./service-error.js";

const USER = "11111111-1111-1111-1111-111111111111";
const WS = "22222222-2222-2222-2222-222222222222";
const PERM = "expedientes:crear";

function mockSupabase({ rpcImpl, workspaceTipo = "sala_de_venta", workspaceTipoError = null }) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (typeof rpcImpl === "function") return rpcImpl(name, args);
      return rpcImpl[name](args);
    },
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  if (table !== "workspaces") return { data: null, error: null };
                  if (workspaceTipoError) return { data: null, error: workspaceTipoError };
                  if (workspaceTipo === undefined) return { data: null, error: null };
                  return { data: { tipo: workspaceTipo }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function expectServiceError(fn, status, code, message) {
  await assert.rejects(fn, (err) => {
    assert.equal(err instanceof ServiceError, true);
    assert.equal(err.status, status);
    assert.equal(err.code, code);
    if (message) assert.equal(err.message, message);
    return true;
  });
}

test("smoke 1 — RPC de sala caído: 503, nunca permisos globales", async () => {
  const supabase = mockSupabase({
    workspaceTipo: "sala_de_venta",
    rpcImpl(name) {
      if (name === "workspace_has_permission") {
        return { data: null, error: { code: "PGRST202", message: "Could not find the function in the schema cache" } };
      }
      if (name === "resolve_user_permission_keys") {
        return { data: [PERM, "expedientes:editar", "ventas:registrar"], error: null };
      }
      return { data: null, error: { message: "unexpected " + name } };
    },
  });

  await expectServiceError(
    () => requireWorkspacePermission(supabase, USER, PERM, WS),
    503,
    WORKSPACE_PERMISSIONS_UNAVAILABLE,
    MSG_PERMISSIONS_UNAVAILABLE,
  );
  assert.equal(
    supabase.calls.some((c) => c.name === "resolve_user_permission_keys"),
    false,
    "no debe consultar el catálogo global",
  );
});

test("smoke 1b — RPC de sala lanza (timeout/red): 503, no globales", async () => {
  const supabase = mockSupabase({
    workspaceTipo: "sala_de_venta",
    rpcImpl() {
      throw new Error("fetch failed");
    },
  });
  await expectServiceError(
    () => requireWorkspacePermission(supabase, USER, PERM, WS),
    503,
    WORKSPACE_PERMISSIONS_UNAVAILABLE,
    MSG_PERMISSIONS_UNAVAILABLE,
  );
});

test("smoke 2 — miembro de sala, RPC OK: concede y no toca globales", async () => {
  const supabase = mockSupabase({
    workspaceTipo: "sala_de_venta",
    rpcImpl(name) {
      if (name === "workspace_has_permission") return { data: true, error: null };
      if (name === "resolve_user_permission_keys") return { data: [PERM], error: null };
      return { data: null, error: { message: name } };
    },
  });
  const id = await requireWorkspacePermission(supabase, USER, PERM, WS);
  assert.equal(id, WS);
  assert.equal(supabase.calls.some((c) => c.name === "resolve_user_permission_keys"), false);
  assert.equal(supabase.calls.some((c) => c.name === "user_in_workspace"), false);
});

test("smoke 3 — JWT válido, sala ajena: 403 acceso, no 503 ni globales", async () => {
  const supabase = mockSupabase({
    workspaceTipo: "sala_de_venta",
    rpcImpl(name) {
      if (name === "workspace_has_permission") return { data: false, error: null };
      if (name === "user_in_workspace") return { data: false, error: null };
      if (name === "resolve_user_permission_keys") return { data: [PERM], error: null };
      return { data: null, error: { message: name } };
    },
  });
  await expectServiceError(
    () => requireWorkspacePermission(supabase, USER, PERM, WS),
    403,
    WORKSPACE_ACCESS_DENIED,
    MSG_WORKSPACE_ACCESS_DENIED,
  );
  assert.equal(supabase.calls.some((c) => c.name === "resolve_user_permission_keys"), false);
});

test("smoke 3b — miembro de sala sin esa clave: 403 permiso, distinto a infra y a no-miembro", async () => {
  const supabase = mockSupabase({
    workspaceTipo: "sala_de_venta",
    rpcImpl(name) {
      if (name === "workspace_has_permission") return { data: false, error: null };
      if (name === "user_in_workspace") return { data: true, error: null };
      return { data: null, error: { message: name } };
    },
  });
  await expectServiceError(
    () => requireWorkspacePermission(supabase, USER, PERM, WS),
    403,
    WORKSPACE_PERMISSION_DENIED,
    MSG_PERMISSION_DENIED,
  );
});

test("smoke 4 — workspace personal con RPC OK: igual que antes (concede)", async () => {
  const supabase = mockSupabase({
    workspaceTipo: "personal",
    rpcImpl(name) {
      if (name === "workspace_has_permission") return { data: true, error: null };
      if (name === "resolve_user_permission_keys") return { data: [PERM], error: null };
      return { data: null, error: { message: name } };
    },
  });
  const id = await requireWorkspacePermission(supabase, USER, PERM, WS);
  assert.equal(id, WS);
  assert.equal(supabase.calls.some((c) => c.name === "resolve_user_permission_keys"), false);
});

test("smoke 4b — personal y RPC de workspace ausente: SÍ usa catálogo de perfil (modelo personal)", async () => {
  const supabase = mockSupabase({
    workspaceTipo: "personal",
    rpcImpl(name) {
      if (name === "workspace_has_permission") {
        return { data: null, error: { code: "42883", message: "function does not exist" } };
      }
      if (name === "resolve_user_permission_keys") return { data: [PERM], error: null };
      return { data: null, error: { message: name } };
    },
  });
  const id = await requireWorkspacePermission(supabase, USER, PERM, WS);
  assert.equal(id, WS);
  assert.equal(supabase.calls.some((c) => c.name === "resolve_user_permission_keys"), true);
});

test("sesión sala: RPC caído → keys vacías + unavailable, no globales", async () => {
  const supabase = mockSupabase({
    rpcImpl() {
      return { data: null, error: { code: "PGRST202", message: "schema cache" } };
    },
  });
  const resolved = await resolveSalaSessionPermissionKeys(supabase, USER, WS);
  assert.deepEqual(resolved.keys, []);
  assert.equal(resolved.status, "unavailable");
});

test("sesión sala: RPC OK → mismas keys, status ok", async () => {
  const supabase = mockSupabase({
    rpcImpl() {
      return { data: ["expedientes:ver_propios", PERM], error: null };
    },
  });
  const resolved = await resolveSalaSessionPermissionKeys(supabase, USER, WS);
  assert.deepEqual(resolved.keys, ["expedientes:ver_propios", PERM]);
  assert.equal(resolved.status, "ok");
});

test("effective_workspace_permissions error no se convierte en []", async () => {
  const supabase = mockSupabase({
    rpcImpl() {
      return { data: null, error: { message: "timeout" } };
    },
  });
  await expectServiceError(
    () => rpcEffectiveWorkspacePermissions(supabase, USER, WS),
    503,
    WORKSPACE_PERMISSIONS_UNAVAILABLE,
    MSG_PERMISSIONS_UNAVAILABLE,
  );
});

const FLAG = "worksheet.royal_holiday.money_box";

test("flags smoke 1 — RPC de sala caído: 503, nunca resolver_flag global", async () => {
  const supabase = mockSupabase({
    workspaceTipo: "sala_de_venta",
    rpcImpl(name) {
      if (name === "resolver_workspace_flag") {
        return { data: null, error: { code: "PGRST202", message: "schema cache" } };
      }
      if (name === "resolver_flag") return { data: true, error: null };
      return { data: null, error: { message: "unexpected " + name } };
    },
  });
  await expectServiceError(
    () => requireWorkspaceFlag(supabase, USER, FLAG, WS),
    503,
    WORKSPACE_FLAGS_UNAVAILABLE,
    MSG_FLAGS_UNAVAILABLE,
  );
  assert.equal(supabase.calls.some((c) => c.name === "resolver_flag"), false);
});

test("flags smoke 1b — RPC lanza (timeout): 503, no globales", async () => {
  const supabase = mockSupabase({
    workspaceTipo: "sala_de_venta",
    rpcImpl() {
      throw new Error("fetch failed");
    },
  });
  await expectServiceError(
    () => requireWorkspaceFlag(supabase, USER, FLAG, WS),
    503,
    WORKSPACE_FLAGS_UNAVAILABLE,
    MSG_FLAGS_UNAVAILABLE,
  );
});

test("flags smoke 2 — usuario con flag activo, RPC OK: concede", async () => {
  const supabase = mockSupabase({
    workspaceTipo: "sala_de_venta",
    rpcImpl(name) {
      if (name === "resolver_workspace_flag") return { data: true, error: null };
      if (name === "resolver_flag") return { data: true, error: null };
      return { data: null, error: { message: name } };
    },
  });
  const id = await requireWorkspaceFlag(supabase, USER, FLAG, WS);
  assert.equal(id, WS);
  assert.equal(supabase.calls.some((c) => c.name === "resolver_flag"), false);
});

test("flags smoke 3 — usuario sin el flag: 403 módulo, no 503 ni globales", async () => {
  const supabase = mockSupabase({
    workspaceTipo: "sala_de_venta",
    rpcImpl(name) {
      if (name === "resolver_workspace_flag") return { data: false, error: null };
      if (name === "resolver_flag") return { data: true, error: null };
      return { data: null, error: { message: name } };
    },
  });
  await expectServiceError(
    () => requireWorkspaceFlag(supabase, USER, FLAG, WS),
    403,
    WORKSPACE_FLAG_DENIED,
    MSG_FLAG_DENIED,
  );
  assert.equal(supabase.calls.some((c) => c.name === "resolver_flag"), false);
});

test("flags smoke 4 — personal RPC OK: concede sin caer a global", async () => {
  const supabase = mockSupabase({
    workspaceTipo: "personal",
    rpcImpl(name) {
      if (name === "resolver_workspace_flag") return { data: true, error: null };
      if (name === "resolver_flag") return { data: true, error: null };
      return { data: null, error: { message: name } };
    },
  });
  const id = await requireWorkspaceFlag(supabase, USER, FLAG, WS);
  assert.equal(id, WS);
  assert.equal(supabase.calls.some((c) => c.name === "resolver_flag"), false);
});

test("flags smoke 4b — personal y RPC de workspace ausente: SÍ usa resolver_flag", async () => {
  const supabase = mockSupabase({
    workspaceTipo: "personal",
    rpcImpl(name) {
      if (name === "resolver_workspace_flag") {
        return { data: null, error: { code: "42883", message: "function does not exist" } };
      }
      if (name === "resolver_flag") return { data: true, error: null };
      return { data: null, error: { message: name } };
    },
  });
  const id = await requireWorkspaceFlag(supabase, USER, FLAG, WS);
  assert.equal(id, WS);
  assert.equal(supabase.calls.some((c) => c.name === "resolver_flag"), true);
});

test("sesión flags sala: RPC caído → unavailable, no resolver_all_flags", async () => {
  const supabase = mockSupabase({
    rpcImpl(name) {
      if (name === "resolver_session_flags") {
        return { data: null, error: { code: "PGRST202", message: "schema cache" } };
      }
      if (name === "resolver_all_flags") {
        return { data: { [FLAG]: true, worksheet: true }, error: null };
      }
      return { data: null, error: { message: name } };
    },
  });
  const resolved = await resolveSessionFlags(supabase, USER, WS, { tipo: "sala_de_venta" });
  assert.deepEqual(resolved.flags, {});
  assert.equal(resolved.status, "unavailable");
  assert.equal(supabase.calls.some((c) => c.name === "resolver_all_flags"), false);
});

test("sesión flags sala: RPC OK incluye money_box RH", async () => {
  const supabase = mockSupabase({
    rpcImpl() {
      return { data: { [FLAG]: true, worksheet: true }, error: null };
    },
  });
  const resolved = await resolveSessionFlags(supabase, USER, WS, { tipo: "sala_de_venta" });
  assert.equal(resolved.flags[FLAG], true);
  assert.equal(resolved.status, "ok");
});

test("flags — fallo al leer tipo de workspace: 503 FLAGS, no resolver_flag", async () => {
  const supabase = mockSupabase({
    workspaceTipoError: { message: "timeout" },
    rpcImpl(name) {
      if (name === "resolver_workspace_flag") {
        return { data: null, error: { message: "schema cache" } };
      }
      if (name === "resolver_flag") return { data: true, error: null };
      return { data: null, error: { message: name } };
    },
  });
  await expectServiceError(
    () => requireWorkspaceFlag(supabase, USER, FLAG, WS),
    503,
    WORKSPACE_FLAGS_UNAVAILABLE,
    MSG_FLAGS_UNAVAILABLE,
  );
  assert.equal(supabase.calls.some((c) => c.name === "resolver_flag"), false);
});

