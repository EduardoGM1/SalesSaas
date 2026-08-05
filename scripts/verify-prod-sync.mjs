import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.DIAG_BASE || "https://saletse.vercel.app";

function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, ".env.local")) };
const admin = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: link } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: process.env.DIAG_EMAIL || "eduardolalito99@hotmail.com",
});
const uc = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: otp } = await uc.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
const token = otp.session.access_token;
const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

async function hit(path, method = "GET", body) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...headers,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(35000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, ms: Date.now() - t0, json };
}

const health = await fetch(`${BASE}/health`).then((r) => r.json()).catch((e) => ({ error: e.message }));
const build = await fetch(`${BASE}/build-id.txt?${Date.now()}`).then((r) => r.text()).catch((e) => e.message);
const get = await hit("/api/v1/sync");
const put = await hit("/api/v1/sync", "PUT", { data: { clients: {}, cal: {}, goals: {}, libre: {}, sales: {}, userActivities: [], settings: {}, pendingDeletes: {} } });

console.log(JSON.stringify({
  base: BASE,
  health,
  buildId: String(build).trim(),
  GET_sync: { status: get.status, ms: get.ms, clients: Object.keys(get.json?.data?.clients || {}).length, error: get.json?.error || null },
  PUT_sync: { status: put.status, ms: put.ms, clients: Object.keys(put.json?.data?.clients || {}).length, error: put.json?.error || null },
}, null, 2));
