/**
 * Límites entre capas (web):
 * - components/** no pueden importar apps/api ni @salesapp/api
 * - components/** no pueden usar fetch( salvo allowlist temporal
 *
 * Fallo CI si hay violaciones nuevas (fuera de allowlist).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const COMPONENTS = path.join(ROOT, "apps/web/src/components");
const ALLOWLIST_PATH = path.join(ROOT, "scripts/architecture/allowlist-component-fetch.json");

const IMPORT_RE = /(?:import\s+(?:[\s\S]*?)\s+from\s+|import\s*\(|export\s+[\s\S]*?\s+from\s+|require\s*\()\s*["']([^"']+)["']/g;
const FETCH_RE = /\bfetch\s*\(/g;
const EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(name))) out.push(full);
  }
  return out;
}

function relPosix(abs) {
  return path.relative(ROOT, abs).replace(/\\/g, "/");
}

function isForbiddenApiImport(spec) {
  if (!spec) return false;
  if (spec === "@salesapp/api" || spec.startsWith("@salesapp/api/")) return true;
  if (spec.includes("apps/api/")) return true;
  // Relative escapes toward apps/api (best-effort)
  if (/(?:^|\/)\.\.\/(?:\.\.\/)*api\//.test(spec) && !spec.includes("/lib/") && !spec.includes("sync-api")) {
    return /apps\/api|\/api\/src\//.test(spec);
  }
  return false;
}

function main() {
  const allow = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
  const allowSet = new Set((allow.files || []).map((f) => f.replace(/\\/g, "/")));

  const missingAllow = [...allowSet].filter((f) => !fs.existsSync(path.join(ROOT, f)));
  const fetchViolations = [];
  const importViolations = [];
  const staleAllow = [];

  for (const file of walk(COMPONENTS)) {
    const rel = relPosix(file);
    const src = fs.readFileSync(file, "utf8");

    IMPORT_RE.lastIndex = 0;
    let m;
    while ((m = IMPORT_RE.exec(src))) {
      if (isForbiddenApiImport(m[1])) {
        importViolations.push({ file: rel, spec: m[1] });
      }
    }

    FETCH_RE.lastIndex = 0;
    const hasFetch = FETCH_RE.test(src);
    if (hasFetch && !allowSet.has(rel)) {
      fetchViolations.push(rel);
    }
    if (!hasFetch && allowSet.has(rel)) {
      staleAllow.push(rel);
    }
  }

  let failed = false;

  if (missingAllow.length) {
    failed = true;
    console.error("✗ Allowlist apunta a archivos inexistentes:");
    for (const f of missingAllow) console.error(`  - ${f}`);
  }

  if (importViolations.length) {
    failed = true;
    console.error("✗ Imports prohibidos (components → API servidor):");
    for (const v of importViolations) console.error(`  - ${v.file} ← ${v.spec}`);
  }

  if (fetchViolations.length) {
    failed = true;
    console.error("✗ fetch() en componentes fuera de allowlist:");
    for (const f of fetchViolations) console.error(`  - ${f}`);
    console.error(`  Allowlist: ${relPosix(ALLOWLIST_PATH)}`);
  }

  if (staleAllow.length) {
    // No falla CI: aviso para limpiar allowlist
    console.warn("⚠ Allowlist incluye archivos sin fetch() (candidatos a retirar):");
    for (const f of staleAllow) console.warn(`  - ${f}`);
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  console.log(
    `✓ Límites de capas OK (${allowSet.size} fetch allowlist, 0 imports API prohibidos en components)`,
  );
}

main();
