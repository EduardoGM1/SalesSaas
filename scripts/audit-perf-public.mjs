#!/usr/bin/env node
/** Baseline público HTTPS. No requiere login. Solo GET. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.AUDIT_BASE || "https://187.77.14.148").replace(/\/$/, "");
const SAMPLES = Number(process.env.AUDIT_SAMPLES || "20") || 20;
const OUT = path.join(root, "scripts", ".audit-perf-baseline.json");

const PATHS = [
  { path: "/health", kind: "api" },
  { path: "/api/v1", kind: "api" },
  { path: "/api/v1/geo/countries", kind: "api" },
  { path: "/api/v1/sync", kind: "api-unauth" },
  { path: "/api/v1/prospects", kind: "api-unauth" },
  { path: "/", kind: "html" },
  { path: "/login", kind: "html" },
  { path: "/clients", kind: "html" },
];

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function pickHeaders(res) {
  const names = [
    "content-security-policy",
    "strict-transport-security",
    "x-frame-options",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
    "access-control-allow-origin",
    "cache-control",
    "content-encoding",
    "server",
    "location",
  ];
  const out = {};
  for (const n of names) {
    const v = res.headers.get(n);
    if (v) out[n] = v;
  }
  return out;
}

async function timedGet(url) {
  const t0 = Date.now();
  const res = await fetch(url, { cache: "no-store", redirect: "follow" });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    ok: res.status >= 200 && res.status < 400,
    status: res.status,
    ms: Date.now() - t0,
    bytes: buf.length,
    headers: pickHeaders(res),
    finalUrl: res.url,
  };
}

async function main() {
  const results = [];
  for (const ep of PATHS) {
    const samples = [];
    for (let i = 0; i < SAMPLES; i++) {
      samples.push(await timedGet(`${BASE}${ep.path}`));
    }
    const ok = samples.filter((s) => s.ok || s.status === 401);
    const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
    const row = {
      path: ep.path,
      kind: ep.kind,
      n: samples.length,
      status: samples[0]?.status,
      bytes: samples[0]?.bytes,
      headers: samples[0]?.headers || {},
      finalUrl: samples[0]?.finalUrl,
      p50: percentile(ms, 50),
      p95: percentile(ms, 95),
      p99: percentile(ms, 99),
      min: ms[0],
      max: ms[ms.length - 1],
    };
    results.push(row);
    console.log(`${row.status}\t${row.p50}/${row.p95}/${row.p99} ms\t${row.bytes} B\t${ep.path}`);
  }
  fs.writeFileSync(OUT, JSON.stringify({
    measuredAt: new Date().toISOString(),
    base: BASE,
    samples: SAMPLES,
    note: "Sin sesión: E2E_EMAIL no está en .env.local. /sync y /prospects deben ser 401.",
    results,
  }, null, 2));
  console.log("wrote", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
