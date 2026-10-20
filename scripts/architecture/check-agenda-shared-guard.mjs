/**
 * Guard Agenda: ramas `arquitectura/agenda-*` no pueden tocar sync/shared data.
 * Evita repetir la regresión de PUT /sync al migrar agenda.
 *
 * Fallan si el diff vs base (origin/main o main) incluye:
 * - scripts/architecture/sync-shared-files.json
 * - packages/shared/src/data/sync.js
 * - cualquier archivo bajo packages/shared/src/data/
 *
 * En otras ramas / tip main sin diff de agenda: no-op OK.
 *
 * Uso:
 *   node scripts/architecture/check-agenda-shared-guard.mjs
 *   node scripts/architecture/check-agenda-shared-guard.mjs --self-test
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const FORBIDDEN_PREFIXES = ["packages/shared/src/data/"];
const FORBIDDEN_EXACT = new Set([
  "scripts/architecture/sync-shared-files.json",
  "packages/shared/src/data/sync.js",
]);

export function isAgendaBranch(name) {
  const n = String(name || "").replace(/^refs\/heads\//, "");
  return n.startsWith("arquitectura/agenda-");
}

export function isForbiddenPath(rel) {
  const p = String(rel || "").replace(/\\/g, "/");
  if (!p) return false;
  if (FORBIDDEN_EXACT.has(p)) return true;
  return FORBIDDEN_PREFIXES.some((pref) => p === pref.slice(0, -1) || p.startsWith(pref));
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
  for (const ref of ["origin/main", "main"]) {
    try {
      git(`git rev-parse --verify ${ref}`);
      return ref;
    } catch {
      /* next */
    }
  }
  return null;
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

  if (!isAgendaBranch("arquitectura/agenda-tramo-b")) {
    console.error("✗ isAgendaBranch tramo-b");
    failed++;
  } else console.log("✓ isAgendaBranch tramo-b");
  if (isAgendaBranch("main")) {
    console.error("✗ isAgendaBranch main");
    failed++;
  } else console.log("✓ isAgendaBranch main");

  expectFail("sync.js", ["packages/shared/src/data/sync.js"]);
  expectFail("sync-shared-files.json", ["scripts/architecture/sync-shared-files.json"]);
  expectFail("mappers.js", ["packages/shared/src/data/mappers.js"]);
  expectFail("data dir file", ["packages/shared/src/data/sync-columns.js"]);
  expectOk("web agenda", ["apps/web/src/modulos/agenda/dominio/calendar-descansos.js"]);
  expectOk("docs", ["docs/arquitectura/migraciones/agenda-inventario.md"]);

  if (failed) {
    process.exitCode = 1;
    console.error(`✗ Guard agenda self-test: ${failed} fallo(s)`);
    return;
  }
  console.log("✓ Guard agenda self-test OK");
}

function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }

  const branch = currentBranch();
  if (!isAgendaBranch(branch)) {
    console.log(`✓ Guard agenda/shared: no aplica (rama ${branch || "desconocida"})`);
    return;
  }

  const base = resolveBaseRef();
  if (!base) {
    console.error("✗ Guard agenda/shared: no hay origin/main ni main para comparar");
    process.exitCode = 1;
    return;
  }

  const changed = changedFilesVsBase(base);
  const forbidden = findForbidden(changed);
  if (forbidden.length) {
    console.error("✗ Guard agenda/shared: la rama toca archivos prohibidos (sync/shared data):");
    for (const f of forbidden) console.error(`  × ${f}`);
    console.error(
      "\n  En tramos de agenda no se edita packages/shared/src/data/* ni sync-shared-files.json.\n" +
        "  Eso es módulo sync (precedente regresión PUT /sync).\n",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `✓ Guard agenda/shared OK (rama ${branch} vs ${base}; ${changed.length} archivo(s); 0 prohibidos)`,
  );
}

const isMain =
  Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
