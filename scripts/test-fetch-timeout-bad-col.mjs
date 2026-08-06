import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const FETCH_TIMEOUT_MS = 15_000;
function fetchWithTimeout(url, options = {}) {
  const { signal: _ignored, ...rest } = options;
  return fetch(url, { ...rest, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), keepalive: false });
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, service, { auth: { persistSession: false } });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "eduardolalito99@hotmail.com" });
const { data: otp } = await admin.auth.admin.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" }).catch(() => ({}));
// use verify via anon client
const uc0 = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: otp2 } = await uc0.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
const token = otp2.session.access_token;

const sb = createClient(url, anon, {
  global: { fetch: fetchWithTimeout, headers: { Authorization: `Bearer ${token}` } },
});

const badSelect = "id,user_id,updated_at"; // sales bad column
const t0 = Date.now();
try {
  const { data, error } = await sb.from("sales").select(badSelect).eq("user_id", otp2.session.user.id).limit(1);
  console.log("result", { ms: Date.now() - t0, error: error?.message, rows: data?.length });
} catch (e) {
  console.log("throw", { ms: Date.now() - t0, message: e.message });
}
