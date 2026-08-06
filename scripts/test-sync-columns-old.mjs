/** Prueba columnas SYNC_SELECT viejas (7157409) vs actuales contra Supabase. */
import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { SYNC_SELECT as NEW_SELECT } from "../packages/shared/src/data/sync-columns.js";

const OLD_SELECT = {
  prospects: NEW_SELECT.prospects,
  sales: NEW_SELECT.sales + ",updated_at",
  calendar_entries: NEW_SELECT.calendar_entries + ",updated_at",
  goals: NEW_SELECT.goals,
  activities: NEW_SELECT.activities + ",updated_at",
  tool_calculations: "id,user_id,workspace_id,prospect_id,tool,data,created_at,updated_at",
};

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
const EMAIL = "eduardolalito99@hotmail.com";

const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
const uc = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: otp } = await uc.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
const userId = otp.session.user.id;
const { data: profile } = await uc.from("profiles").select("workspace_activo_id").eq("id", userId).single();
const ws = profile.workspace_activo_id;

for (const [label, sel] of [["OLD", OLD_SELECT], ["NEW", NEW_SELECT]]) {
  console.log("\n=== " + label + " ===");
  for (const t of Object.keys(sel)) {
    const t0 = Date.now();
    const { error } = await uc.from(t).select(sel[t]).eq("user_id", userId).eq("workspace_id", ws).limit(1);
    console.log(t, error ? "ERR: " + error.message : "OK", Date.now() - t0 + "ms");
  }
}
