/**
 * Guard admin: ramas `arquitectura/admin-*` no tocan shared auth catalog,
 * sync data, db-store ni outbox.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FORBIDDEN_PREFIXES = ["packages/shared/src/data/", "packages/shared/src/auth/"];
const FORBIDDEN_EXACT = new Set([
  "scripts/architecture/sync-shared-files.json",
  "packages/shared/src/data/sync.js",
  "packages/shared/src/auth/permissions.js",
]);

export function isAdminBranch(name) {
  const n = String(name || "").replace(/^refs\/heads\//, "");
  return n.startsWith("arquitectura/admin-");
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
    } else console.log(`✓ self-test ${label}: bloquea ${hit.join(", ")}`);
  };
  const expectOk = (label, paths) => {
    const hit = findForbidden(paths);
    if (hit.length) {
      console.error(`✗ self-test ${label}: no debía fallar → ${hit.join(", ")}`);
      failed++;
    } else console.log(`✓ self-test ${label}: permite`);
  };

  if (!isAdminBranch("arquitectura/admin-tramo-a")) {
    console.error("✗ isAdminBranch");
    failed++;
  } else console.log("✓ isAdminBranch");
  if (isAdminBranch("main") || isAdminBranch("arquitectura/sync-tramo-a")) {
    console.error("✗ isAdminBranch fuera");
    failed++;
  } else console.log("✓ isAdminBranch ignora otras");

  expectFail("permissions", ["packages/shared/src/auth/permissions.js"]);
  expectFail("sync.js", ["packages/shared/src/data/sync.js"]);
  expectFail("db-store", ["apps/web/src/stores/db-store.ts"]);
  expectOk("ui admin", ["apps/web/src/modulos/admin/ui/AdminUsersPage.jsx"]);
  expectOk("docs", ["docs/arquitectura/migraciones/admin-inventario.md"]);

  if (failed) {
    process.exitCode = 1;
    console.error(`✗ Guard admin self-test: ${failed} fallo(s)`);
    return;
  }
  console.log("✓ Guard admin self-test OK");
}

function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const branch = currentBranch();
  if (!isAdminBranch(branch)) {
    console.log(`✓ Guard admin/shared: no aplica (rama ${branch || "desconocida"})`);
    return;
  }
  const base = resolveBaseRef();
  if (!base) {
    console.error("✗ Guard admin/shared: no hay origin/main ni main");
    process.exitCode = 1;
    return;
  }
  const changed = changedFilesVsBase(base);
  const forbidden = findForbidden(changed);
  if (forbidden.length) {
    console.error("✗ Guard admin/shared: la rama toca auth/sync/db-store/outbox:");
    for (const f of forbidden) console.error(`  × ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `✓ Guard admin/shared OK (rama ${branch} vs ${base}; ${changed.length} archivo(s); 0 prohibidos)`,
  );
}

const isMain =
  Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
