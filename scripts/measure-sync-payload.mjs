import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { pullAll } from "../packages/shared/src/data/sync.js";

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
const admin = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "eduardolalito99@hotmail.com" });
const uc = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: otp } = await uc.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
const userId = otp.session.user.id;
const { data: profile } = await uc.from("profiles").select("workspace_activo_id").eq("id", userId).single();
const ws = profile.workspace_activo_id;

const t0 = Date.now();
const db = await pullAll(uc, userId, ws, { teamScope: false });
const json = JSON.stringify(db);
console.log(JSON.stringify({
  pullMs: Date.now() - t0,
  clients: Object.keys(db.clients || {}).length,
  jsonBytes: json.length,
  jsonMB: (json.length / 1024 / 1024).toFixed(2),
}, null, 2));
