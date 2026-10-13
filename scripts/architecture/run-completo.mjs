/**
 * npm run verificar:arquitectura:completo
 *
 * Checks 1–5 + verify local + e2e smoke.
 * Requiere stack local (o que Playwright pueda levantarlo).
 *
 * Variables (nombres; valores en .env.local, nunca en el repo):
 *   API: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (si aplica),
 *        API_PORT, WEB_ORIGIN
 *   Web: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 *   Verify: API_BASE, WEB_BASE (default http://localhost:4000 / :5173)
 *
 * Preferir hostname `localhost` (no 127.0.0.1) para Vite en Windows:
 * Vite puede escuchar solo en ::1.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const API_BASE = process.env.API_BASE || "http://localhost:4000";
const WEB_BASE = process.env.WEB_BASE || "http://localhost:5173";

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok || res.status === 401 || res.status === 503;
  } catch {
    return false;
  }
}

function run(label, command, env = {}) {
  console.log(`\n━━ ${label} ━━`);
  console.log(`$ ${command}`);
  const r = spawnSync(command, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  const code = r.status ?? 1;
  console.log(code === 0 ? `✓ ${label}` : `✗ ${label} (exit ${code})`);
  return { label, code, ok: code === 0 };
}

const results = [];

results.push(
  run("checks 1–5", "npm run verificar:arquitectura:checks"),
);

const apiOk = await isUp(`${API_BASE}/health`);
const webOk = await isUp(WEB_BASE);
if (!apiOk || !webOk) {
  console.error(
    `\n✗ Stack incompleto (API ${apiOk ? "OK" : "DOWN"} @ ${API_BASE}, WEB ${webOk ? "OK" : "DOWN"} @ ${WEB_BASE}).\n` +
      `  Levantar antes: npm run dev:api   y   npm run dev:web\n` +
      `  Usar hostname localhost (no 127.0.0.1) para Vite en Windows.\n` +
      `  Vars: ver docs/arquitectura/baseline-fase1.md § Reproducibilidad.\n`,
  );
  process.exitCode = 1;
} else {
  results.push(run("verify local", "npm run verify", { API_BASE, WEB_BASE }));
  results.push(
    run("e2e smoke", "npx playwright test e2e/smoke.spec.js", {
      CI: process.env.CI || "1",
      PLAYWRIGHT_SKIP_SERVERS: "1",
      PLAYWRIGHT_BASE_URL: WEB_BASE,
    }),
  );
}

console.log("\n════ Resumen verificar:arquitectura:completo ════");
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.label}`);
  if (!r.ok) failed += 1;
}
if (failed) process.exitCode = 1;
else console.log("\nTodo verde.");
