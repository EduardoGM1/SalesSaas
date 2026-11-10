/**
 * Guard Royal Holiday: ramas `arquitectura/royal-holiday-*` no pueden tocar
 * las fórmulas de shared, sync, db-store ni el outbox.
 *
 * Fallan si el diff vs base (origin/main o main) incluye:
 * - scripts/architecture/sync-shared-files.json
 * - packages/shared/src/data/sync.js y cualquier archivo bajo packages/shared/src/data/
 * - un archivo cuyo nombre es db-store.*
 * - un archivo cuyo nombre contiene "outbox"
 *
 * En otras ramas: no-op OK.
 *
 * Uso:
 *   node scripts/architecture/check-expediente-shared-guard.mjs
 *   node scripts/architecture/check-expediente-shared-guard.mjs --self-test
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const FORBIDDEN_PREFIXES = ["packages/shared/src/data/", "packages/shared/src/calculations/"];
const FORBIDDEN_EXACT = new Set([
  "scripts/architecture/sync-shared-files.json",
  "packages/shared/src/data/sync.js",
]);

export function isRoyalHolidayBranch(name) {
  const n = String(name || "").replace(/^refs\/heads\//, "");
  return n.startsWith("arquitectura/royal-holiday-");
}

export function isForbiddenPath(rel) {
  const p = String(rel || "").replace(/\\/g, "/");
  if (!p) return false;
  if (FORBIDDEN_EXACT.has(p)) return true;
  if (FORBIDDEN_PREFIXES.some((pref) => p === pref.slice(0, -1) || p.startsWith(pref))) return true;
  const base = p.split("/").pop() || "";
  if (base.startsWith("db-store.")) return true;
  if (/outbox/i.test(base)) return true;
  return false;
}

export function findForbidden(changedPaths) {
  return [...new Set((changedPaths || []).map((p) => p.replace(/\\/g, "/")).filter(isForbiddenPath))].sort();
}

function git(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

function currentBranch() {
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF;
  if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== "main") {
    return process.env.GITHUB_REF_NAME;
  }
  try {
    return git("git rev-parse --abbrev-ref HEAD");
  } catch {
    return "";
  }
}

function resolveBaseRef() {
  try {
    git("git rev-parse --verify origin/main");
    return "origin/main";
  } catch {
    /* CI shallow: a menudo no trae origin/main */
  }
  try {
    git("git fetch --no-tags --depth=50 origin main:refs/remotes/origin/main");
    git("git rev-parse --verify origin/main");
    return "origin/main";
  } catch {
    /* fall through */
  }
  try {
    git("git rev-parse --verify main");
    return "main";
  } catch {
    return null;
  }
}

function changedFilesVsBase(baseRef) {
  const set = new Set();
  for (const cmd of [
    `git diff --name-only ${baseRef}...HEAD`,
    `git diff --name-only ${baseRef}`,
    "git diff --name-only --cached",
    "git ls-files --others --exclude-standard",
  ]) {
    try {
      const out = git(cmd);
      for (const line of out.split(/\r?\n/).filter(Boolean)) set.add(line.replace(/\\/g, "/"));
    } catch {
      /* ignore */
    }
  }
  return [...set];
}

function selfTest() {
  let failed = 0;
  const expectFail = (label, paths) => {
    const hit = findForbidden(paths);
    if (!hit.length) {
      console.error(`✗ self-test ${label}: debía fallar`);
      failed++;
    } else {
      console.log(`✓ self-test ${label}: bloquea ${hit.join(", ")}`);
    }
  };
  const expectOk = (label, paths) => {
    const hit = findForbidden(paths);
    if (hit.length) {
      console.error(`✗ self-test ${label}: no debía fallar → ${hit.join(", ")}`);
      failed++;
    } else {
      console.log(`✓ self-test ${label}: permite`);
    }
  };

  if (!isRoyalHolidayBranch("arquitectura/royal-holiday-tramo-a")) {
    console.error("✗ isRoyalHolidayBranch tramo-a");
    failed++;
  } else console.log("✓ isRoyalHolidayBranch tramo-a");
  if (isRoyalHolidayBranch("main") || isRoyalHolidayBranch("arquitectura/expediente-tramo-b")) {
    console.error("✗ isRoyalHolidayBranch fuera de royal-holiday");
    failed++;
  } else console.log("✓ isRoyalHolidayBranch ignora main y expediente");

  expectFail("sync.js", ["packages/shared/src/data/sync.js"]);
  expectFail("sync-shared-files.json", ["scripts/architecture/sync-shared-files.json"]);
  expectFail("mappers.js", ["packages/shared/src/data/mappers.js"]);
  expectFail("formulas", ["packages/shared/src/calculations/royal-holiday.js"]);
  expectFail("db-store.ts", ["apps/web/src/stores/db-store.ts"]);
  expectFail("sync-outbox.js", ["apps/web/src/lib/sync-outbox.js"]);
  expectOk("ui royal holiday", ["apps/web/src/modulos/royal-holiday/ui/RhOpsHubPage.jsx"]);
  expectOk("cliente", ["apps/web/src/modulos/royal-holiday/cliente.js"]);
  expectOk("docs", ["docs/arquitectura/migraciones/royal-holiday-inventario.md"]);

  if (failed) {
    process.exitCode = 1;
    console.error(`✗ Guard royal-holiday self-test: ${failed} fallo(s)`);
    return;
  }
  console.log("✓ Guard royal-holiday self-test OK");
}

function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }

  const branch = currentBranch();
  if (!isRoyalHolidayBranch(branch)) {
    console.log(`✓ Guard royal-holiday/shared: no aplica (rama ${branch || "desconocida"})`);
    return;
  }

  const base = resolveBaseRef();
  if (!base) {
    console.error("✗ Guard royal-holiday/shared: no hay origin/main ni main para comparar");
    process.exitCode = 1;
    return;
  }

  const changed = changedFilesVsBase(base);
  const forbidden = findForbidden(changed);
  if (forbidden.length) {
    console.error("✗ Guard royal-holiday/shared: la rama toca archivos prohibidos (fórmulas, sync, db-store u outbox):");
    for (const f of forbidden) console.error(`  × ${f}`);
    console.error(
      "\n  En tramos de Royal Holiday no se editan las fórmulas de packages/shared/src/calculations/*,\n" +
        "  packages/shared/src/data/*, sync-shared-files.json, db-store.* ni archivos de outbox.\n",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `✓ Guard royal-holiday/shared OK (rama ${branch} vs ${base}; ${changed.length} archivo(s); 0 prohibidos)`,
  );
}

const isMain =
  Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
