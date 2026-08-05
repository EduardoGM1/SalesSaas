/**
 * Smoke: pullAll + reconcile round-trip contra esquema prod (JWT usuario).
 */
import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { pullAll, reconcile } from "../packages/shared/src/data/sync.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EMAIL = "eduardolalito99@hotmail.com";

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
const userId = otpData.session.user.id;
const { data: profile } = await userClient
  .from("profiles")
  .select("workspace_activo_id")
  .eq("id", userId)
  .single();
const workspaceId = profile.workspace_activo_id;

const t0 = Date.now();
const db = await pullAll(userClient, userId, workspaceId, { teamScope: false });
const pullMs = Date.now() - t0;

const probeId = randomUUID();
const now = Date.now();
db.clients[probeId] = {
  id: probeId,
  prospectCode: `P-VFY${String(now).slice(-6)}`,
  name1: `verify-sync-${now}`,
  name: `verify-sync-${now}`,
  status: "activo",
  createdAt: now,
  updatedAt: now,
  completedExpedient: false,
  quickExpedient: true,
  data: {},
  sales: [],
  activities: [],
};

const t1 = Date.now();
await reconcile(userClient, db, userId, workspaceId, { teamScope: false });
const reconcileMs = Date.now() - t1;

const pulled = await pullAll(userClient, userId, workspaceId, { teamScope: false });
const persisted = Boolean(pulled.clients[probeId]);

await admin.from("prospects").delete().eq("id", probeId);
const { data: gone } = await admin.from("prospects").select("id").eq("id", probeId).maybeSingle();

console.log(
  JSON.stringify(
    {
      ok: persisted && !gone,
      pullMs,
      reconcileMs,
      clientCount: Object.keys(db.clients).length,
      hasKnuyygy: Object.values(db.clients).some(
        (c) => String(c.name1 || "").toLowerCase() === "knuyygy",
      ),
      probePersisted: persisted,
      probeCleaned: !gone,
    },
    null,
    2,
  ),
);

if (!persisted || gone) process.exit(1);
