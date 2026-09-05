#!/usr/bin/env node
/**
 * Baseline de latencia (solo GET). No escribe datos.
 * Uso: node scripts/audit-perf-baseline.mjs
 * Credenciales: E2E_EMAIL / E2E_PASSWORD en .env.local
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(root, ".env.local"));

const BASE = (process.env.EGRESS_BASE_URL || "http://187.77.14.148").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL || process.env.EGRESS_EMAIL || "";
const PASSWORD = process.env.E2E_PASSWORD || process.env.EGRESS_PASSWORD || "";
const SAMPLES = Number(process.env.AUDIT_SAMPLES || "20") || 20;
const OUT = path.join(root, "scripts", ".audit-perf-baseline.json");

const API_PATHS = [
  { path: "/health", auth: false, crit: "infra" },
  { path: "/api/v1", auth: false, crit: "infra" },
  { path: "/api/v1/geo/countries", auth: false, crit: "publico" },
  { path: "/api/v1/auth/session", auth: true, crit: "boot" },
  { path: "/api/v1/profile", auth: true, crit: "boot" },
  { path: "/api/v1/sync", auth: true, crit: "boot" },
  { path: "/api/v1/prospects?limit=50&offset=0", auth: true, crit: "clientes" },
  { path: "/api/v1/sales?limit=50&offset=0", auth: true, crit: "dashboard" },
  { path: "/api/v1/calendar-entries?limit=50&offset=0", auth: true, crit: "agenda" },
  { path: "/api/v1/activities?limit=50&offset=0", auth: true, crit: "expediente" },
  { path: "/api/v1/goals", auth: true, crit: "dashboard" },
  { path: "/api/v1/tool-calculations?tool=worksheet", auth: true, crit: "worksheet" },
  { path: "/api/v1/messages/unread-count", auth: true, crit: "boot" },
  { path: "/api/v1/messages/conversations", auth: true, crit: "mensajes" },
  { path: "/api/v1/network/connections", auth: true, crit: "red" },
  { path: "/api/v1/notifications/config", auth: true, crit: "boot" },
  { path: "/api/v1/shares/workspace", auth: true, crit: "clientes" },
  { path: "/api/v1/exchange-rates?to=MXN", auth: true, crit: "boot" },
  { path: "/api/v1/workspace/peers", auth: true, crit: "agenda" },
  { path: "/api/v1/admin/me", auth: true, crit: "admin" },
];

const HTML_PATHS = ["/", "/login"];

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarize(samples) {
  const ok = samples.filter((s) => s.ok);
  const ms = ok.map((s) => s.ms).sort((a, b) => a - b);
  const bytes = ok[0]?.bytes ?? 0;
  return {
    n: samples.length,
    ok: ok.length,
    fail: samples.length - ok.length,
    status: ok[0]?.status ?? samples[0]?.status ?? 0,
    bytes,
    p50: percentile(ms, 50),
    p95: percentile(ms, 95),
    p99: percentile(ms, 99),
    min: ms[0] ?? null,
    max: ms[ms.length - 1] ?? null,
    headers: samples[0]?.headers || {},
  };
}

function pickHeaders(res) {
  const names = [
    "content-security-policy",
    "content-security-policy-report-only",
    "strict-transport-security",
    "x-frame-options",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
    "access-control-allow-origin",
    "access-control-allow-credentials",
    "cache-control",
    "content-encoding",
    "server",
  ];
  const out = {};
  for (const n of names) {
    const v = res.headers.get(n);
    if (v) out[n] = v;
  }
  return out;
}

async function timedGet(url, headers) {
  const t0 = Date.now();
  const res = await fetch(url, { headers, cache: "no-store", redirect: "manual" });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    ok: res.status >= 200 && res.status < 400,
    status: res.status,
    ms: Date.now() - t0,
    bytes: buf.length,
    headers: pickHeaders(res),
    preview: buf.toString("utf8").slice(0, 120),
  };
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("Falta E2E_EMAIL / E2E_PASSWORD");
    process.exit(1);
  }

  const cookieJar = new Map();
  const saveCookies = (res) => {
    const raw = res.headers.getSetCookie?.() || [];
    for (const c of raw) {
      const pair = c.split(";")[0];
      const i = pair.indexOf("=");
      if (i > 0) cookieJar.set(pair.slice(0, i), pair.slice(i + 1));
    }
  };
  const cookieHeader = () => [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  saveCookies(loginRes);
  const loginBody = await loginRes.text();
  if (!loginRes.ok) {
    console.error(`Login ${loginRes.status}: ${loginBody.slice(0, 180)}`);
    process.exit(1);
  }

  const sessionRes = await fetch(`${BASE}/api/v1/auth/session`, {
    headers: { Cookie: cookieHeader() },
    cache: "no-store",
  });
  const sessionJson = await sessionRes.json().catch(() => ({}));
  const empresaId = sessionJson.workspace_activo?.empresa_id
    || sessionJson.data?.workspace_activo?.empresa_id
    || sessionJson.user?.app_metadata?.empresa_id
    || null;

  const extra = [];
  if (empresaId) {
    extra.push({
      path: `/api/v1/royal-holiday/${empresaId}/catalogo`,
      auth: true,
      crit: "worksheet-rh",
    });
  }

  const apiResults = [];
  for (const ep of [...API_PATHS, ...extra]) {
    const samples = [];
    for (let i = 0; i < SAMPLES; i++) {
      const headers = { cache: "no-store" };
      if (ep.auth) headers.Cookie = cookieHeader();
      samples.push(await timedGet(`${BASE}${ep.path}`, headers));
    }
    const sum = summarize(samples);
    apiResults.push({ path: ep.path, crit: ep.crit, ...sum });
    console.log(
      `${sum.status}\t${String(sum.p50).padStart(5)} / ${String(sum.p95).padStart(5)} / ${String(sum.p99).padStart(5)} ms\t${String(sum.bytes).padStart(7)} B\t${ep.path}`,
    );
  }

  const htmlResults = [];
  for (const p of HTML_PATHS) {
    const samples = [];
    for (let i = 0; i < SAMPLES; i++) {
      samples.push(await timedGet(`${BASE}${p}`, { cache: "no-store" }));
    }
    const sum = summarize(samples);
    htmlResults.push({ path: p, ...sum });
    console.log(
      `${sum.status}\t${String(sum.p50).padStart(5)} / ${String(sum.p95).padStart(5)} / ${String(sum.p99).padStart(5)} ms\t${String(sum.bytes).padStart(7)} B\tHTML ${p}`,
    );
  }

  const unauthSync = await timedGet(`${BASE}/api/v1/sync`, { cache: "no-store" });
  const unauthProspects = await timedGet(`${BASE}/api/v1/prospects`, { cache: "no-store" });

  const payload = {
    measuredAt: new Date().toISOString(),
    base: BASE,
    samples: SAMPLES,
    loginStatus: loginRes.status,
    sessionKeys: sessionJson && typeof sessionJson === "object" ? Object.keys(sessionJson).slice(0, 20) : [],
    hasEmpresaId: Boolean(empresaId),
    api: apiResults,
    html: htmlResults,
    unauth: {
      sync: { status: unauthSync.status, ms: unauthSync.ms },
      prospects: { status: unauthProspects.status, ms: unauthProspects.ms },
    },
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\nEscrito ${OUT}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
