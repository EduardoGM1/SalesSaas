/**
 * Suite baseline Fase 1 + escritura de docs/arquitectura/baseline-fase1.md
 * Uso: node scripts/architecture/run-baseline.mjs [--no-write]
 *
 * No provisiona cuentas QA. E2E smoke usa Playwright webServer (efímero).
 * verify local puede fallar sin API/web levantados — se documenta.
 */
import { spawnSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "docs/arquitectura/baseline-fase1.md");
const noWrite = process.argv.includes("--no-write");

function sh(label, command, env = {}) {
  console.log(`\n── ${label} ──`);
  console.log(`$ ${command}`);
  const started = Date.now();
  const r = spawnSync(command, {
    cwd: ROOT,
    stdio: "pipe",
    shell: true,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  const ms = Date.now() - started;
  const code = r.status ?? 1;
  const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
  const tail = out.split(/\r?\n/).slice(-40).join("\n");
  if (code === 0) console.log(`✓ exit 0 (${ms}ms)`);
  else console.log(`✗ exit ${code} (${ms}ms)`);
  return { label, command, code, ms, ok: code === 0, tail };
}

function git(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "(desconocido)";
  }
}

const sha = git("git rev-parse HEAD");
const branch = git("git rev-parse --abbrev-ref HEAD");
const date = new Date().toISOString();

const steps = [];

// Unit / contract
steps.push(sh("test:web", "npm run test:web"));
steps.push(sh("api test:security", "npm run test:security -w @salesapp/api"));

// verify local (hostname localhost: Vite en Windows suele ser ::1, no 127.0.0.1)
steps.push(
  sh("verify (local)", "npm run verify", {
    API_BASE: "http://localhost:4000",
    WEB_BASE: "http://localhost:5173",
  }),
);

// e2e smoke subset — Playwright levanta servers efímeros (CI=1 evita reusar Vite sucio); sin secretos
steps.push(
  sh("e2e smoke", "npx playwright test e2e/smoke.spec.js", {
    CI: "1",
    PLAYWRIGHT_SKIP_SERVERS: "",
  }),
);

const failed = steps.filter((s) => !s.ok);

const md = `# Baseline Fase 1 — red de seguridad

**Fecha (UTC):** ${date}  
**SHA:** \`${sha}\`  
**Rama:** \`${branch}\`  
**Comando:** \`npm run verificar:arquitectura\` / \`node scripts/architecture/run-baseline.mjs\`

## Suite ejecutada

| Paso | Exit | Duración | Resultado |
|------|------|----------|-----------|
${steps
  .map((s) => `| ${s.label} | ${s.code} | ${s.ms}ms | ${s.ok ? "PASS" : "FAIL"} |`)
  .join("\n")}

## Resumen

- **Checks arquitectura (1–5):** ver salida de \`verificar:arquitectura\` (límites, lazy, contratos, push, paridad).
- **Baseline suite:** ${failed.length ? `${failed.length} fallo(s)` : "todo PASS"}.
${failed.length ? `- Fallos: ${failed.map((f) => f.label).join(", ")}.` : ""}

## Notas

- Sin secretos ni datos reales en fixtures.
- E2E smoke no provisiona cuentas; usa páginas públicas + health API.
- \`npm run verify\` requiere API (y a menudo web) locales; si falló aquí, no implica regresión de producto sin contrastar con servidores levantados.
- No se hizo deploy ni merge a \`main\`.

## Colas de salida (últimas líneas)

${steps
  .map(
    (s) => `### ${s.label} (exit ${s.code})

\`\`\`
${s.tail || "(sin salida)"}
\`\`\`
`,
  )
  .join("\n")}
`;

if (!noWrite) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, md, "utf8");
  console.log(`\nBaseline escrito: ${path.relative(ROOT, OUT).replace(/\\/g, "/")}`);
}

console.log("\n════ Resumen baseline ════");
for (const s of steps) {
  console.log(`${s.ok ? "✓" : "✗"} ${s.label}`);
}

if (failed.length) process.exitCode = 1;
