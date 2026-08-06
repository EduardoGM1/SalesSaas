/**
 * Prueba API Gerente en groupone: list + create prospects.
 */
import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EMAIL = "cuentapremium4minecrafted@gmail.com";
const API = "https://saletse.vercel.app/api/v1";

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
const userClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: otpData, error: otpErr } = await userClient.auth.verifyOtp({
  token_hash: linkData.properties.hashed_token,
  type: "email",
});
if (otpErr) throw otpErr;
const token = otpData.session.access_token;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function call(method, path, body) {
  const t0 = Date.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, ms: Date.now() - t0, json, text: text.slice(0, 200) };
}

const session = await call("GET", "/auth/session");
console.log("SESSION", {
  status: session.status,
  ws: session.json?.workspace_activo || session.json?.data?.workspace_activo,
  workspaces: (session.json?.workspaces || session.json?.data?.workspaces || []).map((w) => ({
    nombre: w.nombre, tipo: w.tipo, rol: w.rol_en_workspace,
  })),
});

const listBefore = await call("GET", "/prospects?limit=5");
console.log("LIST_BEFORE", { status: listBefore.status, ms: listBefore.ms, error: listBefore.json?.error, total: listBefore.json?.total ?? listBefore.json?.data?.length });

const code = `P-TST${String(Date.now()).slice(-6)}`;
const created = await call("POST", "/prospects", {
  name1: `Test Gerente ${code}`,
  name: `Test Gerente ${code}`,
  prospect_code: code,
  status: "activo",
  quick_expedient: true,
});
console.log("CREATE", {
  status: created.status,
  ms: created.ms,
  error: created.json?.error,
  id: created.json?.data?.id || created.json?.id,
  workspace_id: created.json?.data?.workspace_id || created.json?.workspace_id,
});

const listAfter = await call("GET", "/prospects?limit=5");
console.log("LIST_AFTER", { status: listAfter.status, total: listAfter.json?.total, error: listAfter.json?.error });

// cleanup if created
const newId = created.json?.data?.id || created.json?.id;
if (newId && created.status < 300) {
  const del = await call("DELETE", `/prospects/${newId}`);
  console.log("CLEANUP_DELETE", { status: del.status, error: del.json?.error });
}
