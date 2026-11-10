/**
 * Smoke de solo lectura de la API sync.
 * No crea filas. Comprueba salud y que GET/PUT /sync siguen exigiendo sesión.
 */
import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function envFile(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (!line || line.startsWith("#") || i < 0) continue;
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}

const overlay = envFile(resolve(tmpdir(), "saletse-vps-auth-overlay.env"));
const local = { ...envFile(resolve(root, ".env")), ...envFile(resolve(root, ".env.local")), ...overlay };
const API = (process.env.API_BASE || local.VITE_SUPABASE_URL || "").replace(/\/$/, "");
if (!API) {
  console.error("Falta API_BASE");
  process.exit(1);
}

const checks = [
  ["/health", "GET", [200]],
  ["/api/v1/sync", "GET", [401, 503]],
  ["/api/v1/sync", "PUT", [401, 503]],
];

let failed = 0;
for (const [path, method, ok] of checks) {
  const res = await fetch(`${API}${path}`, { method });
  const pass = ok.includes(res.status);
  if (!pass) failed += 1;
  console.log(`${pass ? "ok" : "fail"} ${method} ${path} ${res.status}`);
}
if (failed) process.exit(1);
console.log("smoke sync lectura ok");
