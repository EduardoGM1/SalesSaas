/**
 * Instantánea de import() dinámicos en:
 * - apps/web/src/routes/lazy-pages.js
 * - apps/web/src/components/clients/client-detail.jsx
 * - apps/web/src/components/layout/sidebar.jsx
 *
 * Falla si un import("@/…") apunta a un archivo inexistente.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_SRC = path.join(ROOT, "apps/web/src");
const TARGETS = [
  "apps/web/src/routes/lazy-pages.js",
  "apps/web/src/components/clients/client-detail.jsx",
  "apps/web/src/components/layout/sidebar.jsx",
];

const IMPORT_DYN_RE = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
const TRY_EXTS = [".js", ".jsx", ".ts", ".tsx"];

function fileExists(abs) {
  try {
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

function resolveLocal(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) {
    base = path.join(WEB_SRC, spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else {
    return { kind: "package", path: null };
  }

  if (fileExists(base)) return { kind: "file", path: base };

  const ext = path.extname(base);
  if (ext) return { kind: "missing", path: base };

  for (const e of TRY_EXTS) {
    const candidate = base + e;
    if (fileExists(candidate)) return { kind: "file", path: candidate };
  }
  for (const e of TRY_EXTS) {
    const candidate = path.join(base, `index${e}`);
    if (fileExists(candidate)) return { kind: "file", path: candidate };
  }
  return { kind: "missing", path: base };
}

function main() {
  const missing = [];
  let checked = 0;

  for (const rel of TARGETS) {
    const abs = path.join(ROOT, rel);
    if (!fileExists(abs)) {
      missing.push({ file: rel, spec: "(archivo fuente ausente)" });
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    IMPORT_DYN_RE.lastIndex = 0;
    let m;
    while ((m = IMPORT_DYN_RE.exec(src))) {
      const spec = m[1];
      const resolved = resolveLocal(spec, abs);
      if (resolved.kind === "package") continue;
      checked += 1;
      if (resolved.kind === "missing") {
        missing.push({ file: rel, spec, resolved: resolved.path });
      }
    }
  }

  if (missing.length) {
    console.error("✗ import() dinámicos apuntan a archivos inexistentes:");
    for (const row of missing) {
      console.error(`  - ${row.file}: ${row.spec}`);
      if (row.resolved) console.error(`    buscado: ${row.resolved}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`✓ Lazy/dynamic imports OK (${checked} especifiers en ${TARGETS.length} archivos)`);
}

main();
