/**
 * Vite build de CI / verificar:arquitectura:completo.
 * Usa placeholders (no secretos) para VITE_* — solo detecta roturas de import/fachada/TS.
 * No sustituye build-web-vps-prod.py (self-hosted real).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const env = {
  ...process.env,
  CI: process.env.CI || "1",
  VITE_BUILD_ID: process.env.VITE_BUILD_ID || "ci-architecture",
  // Placeholders: el bundle no se despliega desde este script.
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321",
  VITE_SUPABASE_ANON_KEY:
    process.env.VITE_SUPABASE_ANON_KEY
    || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24ifQ.ci-placeholder",
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24ifQ.ci-placeholder",
};

console.log("build:web:ci — Vite build con VITE_* placeholder (no deploy)");
const r = spawnSync("npm", ["run", "build", "-w", "@salesapp/web"], {
  cwd: ROOT,
  env,
  stdio: "inherit",
  shell: true,
});
process.exit(r.status ?? 1);
