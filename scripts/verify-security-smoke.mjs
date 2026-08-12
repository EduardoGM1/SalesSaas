#!/usr/bin/env node
/**
 * Smoke post-migración 0083: RPC endurecidos + flujos autenticados (login, expedientes, RH).
 *
 * Uso:
 *   node scripts/verify-security-smoke.mjs
 *   API_BASE=http://187.77.14.148 node scripts/verify-security-smoke.mjs
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const API_BASE = (process.env.API_BASE ?? "http://187.77.14.148").replace(/\/$/, "");

function loadEnvLocal() {
  try {
    for (const line of readFileSync(resolve(__dir, "../.env.local"), "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i < 0) continue;
      const key = trimmed.slice(0, i).trim();
      let val = trimmed.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

function ok(label, detail = "") {
  console.log(`OK    ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail = "") {
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  return false;
}

function rpcDenied(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  const code = String(error?.code || "");
  return code === "42501" || msg.includes("not authorized") || msg.includes("not authenticated");
}

async function sessionForEmail(admin, anon, email) {
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) throw linkErr;
  const otp = linkData?.properties?.email_otp;
  if (!otp) throw new Error(`Sin email_otp para ${email}`);
  const { data: authData, error: otpErr } = await anon.auth.verifyOtp({
    email,
    token: otp,
    type: "email",
  });
  if (otpErr) throw otpErr;
  if (!authData.session?.access_token) throw new Error(`Sin sesión para ${email}`);
  return authData.session;
}

async function pickTwoUsers(admin) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, workspace_activo_id, is_super_admin")
    .not("email", "is", null)
    .eq("is_super_admin", false)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) throw error;
  const rows = (data || []).filter((r) => r.email?.includes("@"));
  if (rows.length < 2) throw new Error("Se necesitan al menos 2 usuarios no-superadmin con email.");
  return { userA: rows[0], userB: rows[1] };
}

async function testRpcHardening(admin, anon) {
  console.log("\n=== RPC post-0083 (IDOR + self) ===\n");
  let passed = true;

  const { userA, userB } = await pickTwoUsers(admin);
  ok("Usuarios de prueba", `${userA.email} / ${userB.email}`);

  const sessionA = await sessionForEmail(admin, anon, userA.email);
  const clientA = createClient(
    process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${sessionA.access_token}` } },
    },
  );

  const { data: selfPerms, error: selfErr } = await clientA.rpc("resolve_user_permission_keys", {
    p_user_id: userA.id,
  });
  if (selfErr || !Array.isArray(selfPerms)) {
    passed = fail("resolve_user_permission_keys (self)", selfErr?.message || "sin array") && passed;
  } else {
    ok("resolve_user_permission_keys (self)", `${selfPerms.length} claves`);
  }

  const { error: idorErr } = await clientA.rpc("resolve_user_permission_keys", {
    p_user_id: userB.id,
  });
  if (!idorErr || !rpcDenied(idorErr)) {
    passed = fail("resolve_user_permission_keys (IDOR bloqueado)", idorErr?.message || "no rechazó") && passed;
  } else {
    ok("resolve_user_permission_keys (IDOR bloqueado)", idorErr.message);
  }

  // Superadmin sí puede leer permisos ajenos (comportamiento esperado)
  const { data: superRow } = await admin
    .from("profiles")
    .select("id, email")
    .eq("is_super_admin", true)
    .limit(1)
    .maybeSingle();
  if (superRow?.email) {
    const superSession = await sessionForEmail(admin, anon, superRow.email);
    const superClient = createClient(
      process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${superSession.access_token}` } },
      },
    );
    const { data: crossPerms, error: crossErr } = await superClient.rpc("resolve_user_permission_keys", {
      p_user_id: userB.id,
    });
    if (crossErr || !Array.isArray(crossPerms)) {
      passed = fail("superadmin cross-read", crossErr?.message || "falló") && passed;
    } else {
      ok("superadmin cross-read", `${crossPerms.length} claves de otro usuario`);
    }
  }

  const wsId = userA.workspace_activo_id;
  if (wsId) {
    const { data: wsPerms, error: wsErr } = await clientA.rpc("effective_workspace_permissions", {
      p_usuario_id: userA.id,
      p_workspace_id: wsId,
    });
    if (wsErr || !Array.isArray(wsPerms)) {
      passed = fail("effective_workspace_permissions (self)", wsErr?.message || "sin array") && passed;
    } else {
      ok("effective_workspace_permissions (self)", `${wsPerms.length} claves`);
    }

    const { error: wsIdorErr } = await clientA.rpc("effective_workspace_permissions", {
      p_usuario_id: userB.id,
      p_workspace_id: wsId,
    });
    if (!wsIdorErr || !rpcDenied(wsIdorErr)) {
      passed = fail("effective_workspace_permissions (IDOR bloqueado)", wsIdorErr?.message || "no rechazó") && passed;
    } else {
      ok("effective_workspace_permissions (IDOR bloqueado)", wsIdorErr.message);
    }

    const { data: flags, error: flagsErr } = await clientA.rpc("resolver_session_flags", {
      p_usuario_id: userA.id,
      p_workspace_id: wsId,
    });
    if (flagsErr || typeof flags !== "object") {
      passed = fail("resolver_session_flags (self)", flagsErr?.message || "sin objeto") && passed;
    } else {
      ok("resolver_session_flags (self)", `${Object.keys(flags).length} flags`);
    }
  } else {
    ok("resolver_session_flags (self)", "omitido — sin workspace_activo_id");
  }

  const { data: membershipRows, error: memErr } = await clientA.rpc("current_membership", {
    p_user_id: userA.id,
  });
  if (memErr) {
    passed = fail("current_membership (self)", memErr.message) && passed;
  } else {
    ok("current_membership (self)", Array.isArray(membershipRows) ? `${membershipRows.length} fila(s)` : "ok");
  }

  return { passed, sessionA, userA, userB };
}

async function testAuthenticatedApi(session, userA) {
  console.log("\n=== API autenticada (VPS) ===\n");
  let passed = true;
  const bearer = session.access_token;

  const authedChecks = [
    { name: "Profile", path: "/api/v1/profile" },
    { name: "Session auth", path: "/api/v1/auth/session", validate: (body) => Array.isArray(body?.workspaces) && typeof body?.flags === "object" },
    { name: "Prospects (expedientes)", path: "/api/v1/prospects?limit=5&offset=0" },
    { name: "Calendar", path: "/api/v1/calendar-entries?limit=5&offset=0" },
  ];

  for (const c of authedChecks) {
    const res = await fetch(`${API_BASE}${c.path}`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (res.status !== 200) {
      passed = fail(c.name, `HTTP ${res.status}`) && passed;
      continue;
    }
    if (c.validate) {
      const body = await res.json().catch(() => null);
      if (!c.validate(body)) {
        passed = fail(c.name, "payload inválido (workspaces/flags)") && passed;
        continue;
      }
      ok(c.name, `HTTP ${res.status} — ${body.workspaces.length} workspaces, ${Object.keys(body.flags).length} flags`);
      continue;
    }
    ok(c.name, `HTTP ${res.status}`);
  }

  const { data: rhEmpresas } = await createClient(
    process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    },
  ).from("empresa_miembros").select("empresa_id, empresas(id, nombre)").eq("usuario_id", userA.id).limit(3);

  let rhTested = false;
  for (const row of rhEmpresas || []) {
    const empresaId = row.empresa_id;
    if (!empresaId) continue;
    const { data: canRh } = await createClient(
      process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      },
    ).rpc("rh_can_access_empresa", { p_empresa_id: empresaId });
    if (canRh !== true) continue;

    const catalogRes = await fetch(`${API_BASE}/api/v1/royal-holiday/${empresaId}/catalogo`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    rhTested = true;
    if (catalogRes.status === 200) {
      ok("RH catálogo (worksheet)", `empresa ${empresaId.slice(0, 8)}…`);
    } else if ([403, 404].includes(catalogRes.status)) {
      ok("RH catálogo (worksheet)", `HTTP ${catalogRes.status} — sin módulo RH activo (esperable)`);
    } else {
      passed = fail("RH catálogo (worksheet)", `HTTP ${catalogRes.status}`) && passed;
    }
    break;
  }
  if (!rhTested) {
    ok("RH catálogo (worksheet)", "omitido — usuario sin acceso RH");
  }

  return passed;
}

async function testPublicVps() {
  console.log("\n=== Endpoints públicos ===\n");
  let passed = true;
  const checks = [
    { name: "Health", path: "/health" },
    { name: "API v1", path: "/api/v1" },
  ];
  for (const c of checks) {
    const res = await fetch(`${API_BASE}${c.path}`, { redirect: "manual" });
    if (![200, 304].includes(res.status)) {
      passed = fail(c.name, `HTTP ${res.status}`) && passed;
    } else {
      ok(c.name, `HTTP ${res.status}`);
    }
  }
  return passed;
}

async function main() {
  loadEnvLocal();
  const url = process.env.SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    console.error("Faltan VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  console.log(`\n=== Smoke seguridad post-0083 ===`);
  console.log(`API: ${API_BASE}`);
  console.log(`Supabase: ${url}\n`);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let failed = 0;
  try {
    if (!(await testPublicVps())) failed += 1;
    const rpc = await testRpcHardening(admin, anon);
    if (!rpc.passed) failed += 1;
    if (!(await testAuthenticatedApi(rpc.sessionA, rpc.userA))) failed += 1;
  } catch (err) {
    console.error("\nERROR:", err instanceof Error ? err.message : err);
    failed += 1;
  }

  console.log(failed ? `\n${failed} bloque(s) con fallos.\n` : "\nTodo OK — flujos legítimos intactos post-0083.\n");
  process.exit(failed ? 1 : 0);
}

main();
