#!/usr/bin/env node
/**
 * Auditoría manual de egress REST.
 *
 * Uso:
 *   E2E_EMAIL=... E2E_PASSWORD=... node scripts/audit-egress.js
 *   EGRESS_BASE_URL=http://187.77.14.148 E2E_EMAIL=... E2E_PASSWORD=... node scripts/audit-egress.js
 *
 * Lee .env.local si existen E2E_EMAIL / E2E_PASSWORD / EGRESS_*.
 * No modifica datos. No imprime secretos.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(root, ".env.local"));

const BASE = (process.env.EGRESS_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL || process.env.EGRESS_EMAIL || "";
const PASSWORD = process.env.E2E_PASSWORD || process.env.EGRESS_PASSWORD || "";

const ENDPOINTS = [
  "/api/v1/prospects?limit=100&offset=0",
  "/api/v1/sales?limit=100&offset=0",
  "/api/v1/calendar-entries?limit=100&offset=0",
  "/api/v1/activities?limit=100&offset=0",
  "/api/v1/tool-calculations?tool=worksheet",
  "/api/v1/sync",
];

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
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

function extractRows(parsed, urlPath) {
  if (!parsed || typeof parsed !== "object") return 0;
  if (urlPath.includes("/sync")) {
    const clients = parsed.data?.clients || parsed.clients;
    if (clients && typeof clients === "object" && !Array.isArray(clients)) {
      return Object.keys(clients).length;
    }
    return 0;
  }
  if (Array.isArray(parsed.data)) return parsed.data.length;
  if (parsed.data && typeof parsed.data === "object") return 1;
  if (Array.isArray(parsed)) return parsed.length;
  return 0;
}

function pad(value, width) {
  const s = String(value);
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("Falta E2E_EMAIL y E2E_PASSWORD (o EGRESS_EMAIL / EGRESS_PASSWORD).");
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
  if (!loginRes.ok) {
    const body = await loginRes.text();
    console.error(`Login falló ${loginRes.status}: ${body.slice(0, 200)}`);
    process.exit(1);
  }

  const rows = [];
  for (const endpoint of ENDPOINTS) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}${endpoint}`, {
      headers: { Cookie: cookieHeader() },
      cache: "no-store",
    });
    const buf = Buffer.from(await res.arrayBuffer());
    let parsed = null;
    try {
      parsed = JSON.parse(buf.toString("utf8"));
    } catch {
      parsed = null;
    }
    const filas = extractRows(parsed, endpoint);
    rows.push({
      endpoint,
      status: res.status,
      ms: Date.now() - t0,
      bytes: buf.length,
      filas,
      bytesFila: filas > 0 ? Math.round(buf.length / filas) : buf.length,
    });
  }

  const w = [48, 7, 8, 10, 8, 12];
  const header = [
    pad("endpoint", w[0]),
    pad("status", w[1]),
    pad("ms", w[2]),
    pad("bytes", w[3]),
    pad("filas", w[4]),
    pad("bytes/fila", w[5]),
  ].join(" ");
  console.log(`\nEgress REST · ${BASE}\n`);
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of rows) {
    console.log([
      pad(r.endpoint, w[0]),
      pad(r.status, w[1]),
      pad(r.ms, w[2]),
      pad(r.bytes, w[3]),
      pad(r.filas, w[4]),
      pad(r.bytesFila, w[5]),
    ].join(" "));
  }
  console.log("");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
