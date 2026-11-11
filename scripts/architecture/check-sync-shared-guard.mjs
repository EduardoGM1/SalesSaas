/**
 * Guard sync: ramas `arquitectura/sync-*` no pueden tocar
 * packages/shared/src/data/*, sync-shared-files.json ni db-store.
 * El outbox y los archivos sync del módulo sí se pueden mover.
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

/** Única rama que puede editar sync.js (Etapa 2 visibilidad). */
const SYNC_VISIBILIDAD_BRANCH = "arquitectura/sync-visibilidad";
const SYNC_JS_PATH = "packages/shared/src/data/sync.js";

export function isSyncBranch(name) {
  const n = String(name || "").replace(/^refs\/heads\//, "");
  return n.startsWith("arquitectura/sync-");
}

export function isForbiddenPath(rel) {
  const p = String(rel || "").replace(/\\/g, "/");
  if (!p) return false;
  if (FORBIDDEN_EXACT.has(p)) return true;
  if (FORBIDDEN_PREFIXES.some((pref) => p === pref.slice(0, -1) || p.startsWith(pref))) return true;
  const base = p.split("/").pop() || "";
  if (base.startsWith("db-store.")) return true;
  return false;
}

export function isSyncVisibilidadBranch(name) {
  const n = String(name || "").replace(/^refs\/heads\//, "");
  return n === SYNC_VISIBILIDAD_BRANCH;
}

export function findForbidden(changedPaths, branch = "") {
  const allowSyncJs = isSyncBranch(branch) && isSyncVisibilidadBranch(branch);
  return [...new Set(
    (changedPaths || [])
      .map((p) => p.replace(/\\/g, "/"))
      .filter((p) => {
        if (!isForbiddenPath(p)) return false;
        if (allowSyncJs && p === SYNC_JS_PATH) return false;
        return true;
      }),
  )].sort();
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
    /* CI shallow */
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

  if (!isSyncVisibilidadBranch(SYNC_VISIBILIDAD_BRANCH)) {
    console.error("✗ isSyncVisibilidadBranch");
    failed++;
  } else console.log("✓ isSyncVisibilidadBranch");

  const allowVis = findForbidden([SYNC_JS_PATH], SYNC_VISIBILIDAD_BRANCH);
  if (allowVis.length) {
    console.error("✗ sync-visibilidad debe permitir sync.js");
    failed++;
  } else console.log("✓ sync-visibilidad permite solo sync.js");

  const blockMappers = findForbidden(["packages/shared/src/data/mappers.js"], SYNC_VISIBILIDAD_BRANCH);
  if (!blockMappers.length) {
    console.error("✗ sync-visibilidad aún bloquea mappers.js");
    failed++;
  } else console.log("✓ sync-visibilidad bloquea mappers.js");

  if (!isSyncBranch("arquitectura/sync-tramo-c")) {
    console.error("✗ isSyncBranch tramo-c");
    failed++;
  } else console.log("✓ isSyncBranch tramo-c");
  if (isSyncBranch("main") || isSyncBranch("arquitectura/royal-holiday-tramo-a")) {
    console.error("✗ isSyncBranch fuera de sync");
    failed++;
  } else console.log("✓ isSyncBranch ignora main y royal-holiday");

  expectFail("sync.js", ["packages/shared/src/data/sync.js"]);
  expectFail("sync-shared-files.json", ["scripts/architecture/sync-shared-files.json"]);
  expectFail("mappers.js", ["packages/shared/src/data/mappers.js"]);
  expectFail("db-store.ts", ["apps/web/src/stores/db-store.ts"]);
  expectOk("outbox", ["apps/web/src/lib/sync-outbox.js"]);
  expectOk("api sync", ["apps/api/src/modulos/sync/servicios/sync-service.js"]);
  expectOk("docs", ["docs/arquitectura/migraciones/sync-inventario.md"]);

  if (failed) {
    process.exitCode = 1;
    console.error(`✗ Guard sync self-test: ${failed} fallo(s)`);
    return;
  }
  console.log("✓ Guard sync self-test OK");
}

function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }

  const branch = currentBranch();
  if (!isSyncBranch(branch)) {
    console.log(`✓ Guard sync/shared: no aplica (rama ${branch || "desconocida"})`);
    return;
  }

  const base = resolveBaseRef();
  if (!base) {
    console.error("✗ Guard sync/shared: no hay origin/main ni main para comparar");
    process.exitCode = 1;
    return;
  }

  const changed = changedFilesVsBase(base);
  const forbidden = findForbidden(changed, branch);
  if (forbidden.length) {
    console.error("✗ Guard sync/shared: la rama toca shared data o db-store:");
    for (const f of forbidden) console.error(`  × ${f}`);
    console.error(
      "\n  En tramos de sync no se editan packages/shared/src/data/*,\n" +
        "  sync-shared-files.json ni db-store.*\n",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `✓ Guard sync/shared OK (rama ${branch} vs ${base}; ${changed.length} archivo(s); 0 prohibidos)`,
  );
}

const isMain =
  Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
