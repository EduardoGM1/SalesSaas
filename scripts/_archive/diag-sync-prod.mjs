/**
 * Probar GET /api/v1/sync en producción (auth via magic link).
 */
import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EMAIL = "eduardolalito99@hotmail.com";
const API = "https://saletse.vercel.app/api/v1/sync";

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
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

const admin = createClient(url, service, { auth: { persistSession: false } });
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
const token = otpData.session.access_token;

const t0 = Date.now();
const res = await fetch(API, {
  method: "GET",
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  },
});
const ms = Date.now() - t0;
const text = await res.text();
console.log(JSON.stringify({
  url: API,
  status: res.status,
  ms,
  body_preview: text.slice(0, 300),
  build_id_checked_separately: true,
}, null, 2));
