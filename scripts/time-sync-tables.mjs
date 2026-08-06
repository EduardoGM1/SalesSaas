/**
 * Tiempo por tabla del pull de sync (JWT usuario, mismo path que /api/v1/sync).
 */
import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { SYNC_SELECT } from "../packages/shared/src/data/sync-columns.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
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

const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL,
});
if (linkErr) throw linkErr;

const uc = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: otp, error: otpErr } = await uc.auth.verifyOtp({
  token_hash: linkData.properties.hashed_token,
  type: "email",
});
if (otpErr) throw otpErr;

const userId = otp.session.user.id;
const { data: profile } = await uc.from("profiles").select("workspace_activo_id").eq("id", userId).single();
const ws = profile.workspace_activo_id;

const tables = ["prospects", "sales", "calendar_entries", "goals", "activities", "tool_calculations"];
const report = { workspaceId: ws, tables: {} };

for (const t of tables) {
  const t0 = Date.now();
  const { data, error } = await uc.from(t).select(SYNC_SELECT[t]).eq("user_id", userId).eq("workspace_id", ws);
  report.tables[t] = {
    ms: Date.now() - t0,
    rows: data?.length ?? 0,
    error: error?.message ?? null,
  };
}

// Simular GET /sync vía API prod
const PROD = "https://saletse.vercel.app";
const tSync = Date.now();
const syncRes = await fetch(`${PROD}/api/v1/sync`, {
  headers: { Authorization: `Bearer ${otp.session.access_token}`, Accept: "application/json" },
  signal: AbortSignal.timeout(35000),
}).catch((e) => ({ ok: false, status: 0, error: e.message }));
report.prod_GET_sync = {
  ms: Date.now() - tSync,
  status: syncRes.status ?? 0,
  error: syncRes.error ?? null,
};

console.log(JSON.stringify(report, null, 2));
