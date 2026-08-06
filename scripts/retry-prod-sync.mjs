import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROD = "https://saletse.vercel.app";
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
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "eduardolalito99@hotmail.com" });
const uc = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: otp } = await uc.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
const token = otp.session.access_token;
const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

for (let i = 1; i <= 2; i++) {
  const t0 = Date.now();
  const res = await fetch(`${PROD}/api/v1/sync`, { headers, signal: AbortSignal.timeout(35000) });
  console.log(`attempt ${i}:`, res.status, Date.now() - t0 + "ms");
}
