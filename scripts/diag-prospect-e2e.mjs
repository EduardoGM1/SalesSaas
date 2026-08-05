/**
 * E2E diagnóstico expedientes: API prod + PostgreSQL + cloud-persist paths.
 * Read-only except probe create/delete with cleanup.
 */
import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROD = "https://saletse.vercel.app";
const EMAIL = process.env.DIAG_EMAIL || "eduardolalito99@hotmail.com";

function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, ".env.local")) };
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const admin = createClient(url, service, { auth: { persistSession: false } });

const report = { steps: [], db: {}, prod: {} };

async function getSession() {
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
  });
  if (linkErr) throw linkErr;
  const userClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: otpData, error: otpErr } = await userClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });
  if (otpErr) throw otpErr;
  return {
    token: otpData.session.access_token,
    userId: otpData.session.user.id,
    userClient,
  };
}

async function api(token, method, path, body) {
  const t0 = Date.now();
  const res = await fetch(`${PROD}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, ok: res.ok, ms: Date.now() - t0, json };
}

const { token, userId, userClient } = await getSession();
report.session = { userId, email: EMAIL };

// Session context
const sess = await api(token, "GET", "/api/v1/auth/session");
report.prod.auth_session = {
  status: sess.status,
  workspace_activo_id: sess.json?.workspace_activo_id,
  permission_keys: sess.json?.permission_keys?.filter((p) => p.includes("expediente")),
  flags: sess.json?.flags,
};

// GET sync
const syncGet = await api(token, "GET", "/api/v1/sync");
const prospectsFromSync = syncGet.json?.data?.prospects
  ? syncGet.json.data.prospects
  : syncGet.json?.data?.clients
    ? Object.values(syncGet.json.data.clients || {})
    : [];
report.prod.GET_sync = {
  status: syncGet.status,
  ms: syncGet.ms,
  prospectCount: Array.isArray(prospectsFromSync) ? prospectsFromSync.length : null,
  error: syncGet.json?.error || null,
};

// GET prospects
const list = await api(token, "GET", "/api/v1/prospects?limit=50");
report.prod.GET_prospects = {
  status: list.status,
  ms: list.ms,
  count: Array.isArray(list.json?.data) ? list.json.data.length : null,
  error: list.json?.error || null,
};

// POST prospect (simulate PWA create)
const probeId = randomUUID();
const probeName = `diag-root-${Date.now()}`;
const postBody = {
  id: probeId,
  prospectCode: `P-DG${String(Date.now()).slice(-6)}`,
  name1: probeName,
  name: probeName,
  tipo_tour: "individual",
  tour_cuantificable: true,
  completedExpedient: true,
  quickExpedient: false,
  tourDate: new Date().toISOString().slice(0, 10),
};
const post = await api(token, "POST", "/api/v1/prospects", postBody);
report.prod.POST_prospect = {
  status: post.status,
  ms: post.ms,
  createdId: post.json?.data?.id || null,
  error: post.json?.error || null,
  code: post.json?.data?.prospect_code || null,
};

const createdId = post.json?.data?.id || probeId;

// Verify in DB via service role
const { data: svcRow } = await admin
  .from("prospects")
  .select("id, prospect_code, name1, user_id, workspace_id, created_at")
  .eq("id", createdId)
  .maybeSingle();
report.db.service_role_read = svcRow;

// Verify via user RLS
const { data: rlsRow, error: rlsErr } = await userClient
  .from("prospects")
  .select("id, prospect_code, name1")
  .eq("id", createdId)
  .maybeSingle();
report.db.rls_read = { row: rlsRow, error: rlsErr?.message || null };

// GET by id via API
const getOne = await api(token, "GET", `/api/v1/prospects/${createdId}`);
report.prod.GET_prospect_by_id = {
  status: getOne.status,
  error: getOne.json?.error || null,
  name1: getOne.json?.data?.name1 || null,
};

// PATCH
const patch = await api(token, "PATCH", `/api/v1/prospects/${createdId}`, {
  note: "diag-patch-ok",
});
report.prod.PATCH_prospect = { status: patch.status, error: patch.json?.error || null };

// PUT sync with empty + probe in blob
const putSync = await api(token, "PUT", "/api/v1/sync", {
  data: {
    clients: {
      [createdId]: {
        id: createdId,
        prospectCode: post.json?.data?.prospect_code || postBody.prospectCode,
        name1: probeName,
        name: probeName,
        status: "activo",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: { survey: {}, vacaciones: {}, worksheet: {} },
        sales: [],
        activities: [],
      },
    },
    cal: {},
    goals: {},
    libre: {},
    sales: {},
    userActivities: [],
    settings: {},
    pendingDeletes: {},
  },
});
report.prod.PUT_sync = {
  status: putSync.status,
  ms: putSync.ms,
  error: putSync.json?.error || null,
};

// Cleanup
if (post.ok) {
  const del = await api(token, "DELETE", `/api/v1/prospects/${createdId}`);
  report.prod.DELETE_cleanup = { status: del.status, error: del.json?.error || null };
  const { data: gone } = await admin.from("prospects").select("id").eq("id", createdId).maybeSingle();
  report.db.cleanup_gone = !gone;
}

// Recent prospects in DB for user
const { data: recent } = await admin
  .from("prospects")
  .select("id, prospect_code, name1, created_at")
  .eq("user_id", userId)
  .order("created_at", { ascending: false })
  .limit(8);
report.db.recent_for_user = recent;

console.log(JSON.stringify(report, null, 2));
