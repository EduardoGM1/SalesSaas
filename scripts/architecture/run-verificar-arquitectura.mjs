/**
 * npm run verificar:arquitectura
 * Ejecuta red de seguridad (1–5) y, salvo ARCH_SKIP_BASELINE=1, la suite baseline (6).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const skipBaseline = process.env.ARCH_SKIP_BASELINE === "1";
const writeBaseline = process.env.ARCH_WRITE_BASELINE !== "0";

const checks = [
  ["límites capas", "node", ["scripts/architecture/check-layer-boundaries.mjs"]],
  ["lazy imports", "node", ["scripts/architecture/check-lazy-imports.mjs"]],
  ["contratos tools", "node", ["scripts/architecture/check-tool-contracts.mjs"]],
  ["push deeplinks", "node", ["scripts/architecture/check-push-deeplinks.mjs"]],
  ["paridad shared", "node", ["scripts/architecture/check-shared-parity.mjs"]],
];

function run(label, cmd, args, opts = {}) {
  console.log(`\n━━ ${label} ━━`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
    ...opts,
  });
  const code = r.status ?? 1;
  return { label, code, ok: code === 0 };
}

const results = [];

for (const [label, cmd, args] of checks) {
  results.push(run(label, cmd, args));
}

if (!skipBaseline) {
  const baselineArgs = ["scripts/architecture/run-baseline.mjs"];
  if (!writeBaseline) baselineArgs.push("--no-write");
  results.push(run("baseline suite", "node", baselineArgs));
}

console.log("\n════ Resumen verificar:arquitectura ════");
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.label} (exit ${r.code})`);
  if (!r.ok) failed += 1;
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("\nTodo verde.");
}
