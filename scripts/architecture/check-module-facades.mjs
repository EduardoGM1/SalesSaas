/**
 * Fachadas de módulo: imports a otro módulo solo vía su index (fachada).
 * Dentro del mismo módulo se permiten paths internos (dominio/, servicios/, …).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCAN_ROOTS = [
  path.join(ROOT, "apps/web/src"),
  path.join(ROOT, "apps/api/src"),
];
const EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const IMPORT_RE =
  /(?:import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+|import\s*\(|export\s+(?:type\s+)?[\s\S]*?\s+from\s+|require\s*\()\s*["']([^"']+)["']/g;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
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

/** @returns {{ app: 'web'|'api', modulo: string } | null} */
function moduleOfFile(rel) {
  const m = rel.match(/^apps\/(web|api)\/src\/modulos\/([^/]+)\//);
  if (!m) return null;
  return { app: m[1], modulo: m[2] };
}

/**
 * Resuelve specifier a { app, modulo, rest } si apunta a un módulo.
 * rest vacío / index.* = fachada OK.
 */
function resolveModuleImport(spec, fromRel) {
  if (!spec || spec.startsWith("node:") || spec.startsWith("@salesapp/")) return null;

  // Alias web @/modulos/...
  let m = spec.match(/^@\/modulos\/([^/'"]+)(?:\/(.*))?$/);
  if (m) {
    return { app: "web", modulo: m[1], rest: m[2] || "" };
  }

  // Relativos desde el archivo
  if (spec.startsWith(".")) {
    const fromDir = path.posix.dirname(fromRel);
    const resolved = path.posix.normalize(path.posix.join(fromDir, spec));
    const hit = resolved.match(/^apps\/(web|api)\/src\/modulos\/([^/]+)(?:\/(.*))?$/);
    if (hit) {
      return { app: hit[1], modulo: hit[2], rest: hit[3] || "" };
    }
  }

  // apps/web/src/modulos/... (raro)
  m = spec.replace(/\\/g, "/").match(/(?:^|\/)apps\/(web|api)\/src\/modulos\/([^/]+)(?:\/(.*))?$/);
  if (m) {
    return { app: m[1], modulo: m[2], rest: m[3] || "" };
  }

  return null;
}

function isFacadeRest(rest) {
  if (!rest || rest === ".") return true;
  if (/^index(?:\.(js|ts|mjs|cjs|jsx|tsx))?$/.test(rest)) return true;
  // Entradas delgadas (no usar index.js: Vite lo prioriza sobre index.ts)
  if (rest === "fachada-node.js") return true;
  if (rest === "fachada-i18n.js") return true;
  if (rest === "fachada-preguntas.js") return true;
  if (rest === "fachada-toast.js") return true;
  return false;
}

function main() {
  const violations = [];

  for (const root of SCAN_ROOTS) {
    for (const file of walk(root)) {
      const rel = relPosix(file);
      // La propia fachada index.* puede reexportar internos
      if (/\/modulos\/[^/]+\/index\.(js|ts|mjs|cjs|jsx|tsx)$/.test(rel)) continue;

      const src = fs.readFileSync(file, "utf8");
      const self = moduleOfFile(rel);
      IMPORT_RE.lastIndex = 0;
      let m;
      while ((m = IMPORT_RE.exec(src))) {
        const target = resolveModuleImport(m[1], rel);
        if (!target) continue;
        // Mismo módulo: OK
        if (self && self.app === target.app && self.modulo === target.modulo) continue;
        if (isFacadeRest(target.rest)) continue;
        violations.push({ file: rel, spec: m[1], modulo: `${target.app}/modulos/${target.modulo}` });
      }
    }
  }

  if (violations.length) {
    console.error("✗ Fachadas: imports a carpetas internas de otro módulo (usa @/modulos/<nombre> o ../modulos/<nombre>):");
    for (const v of violations) {
      console.error(`  ${v.file}`);
      console.error(`    → ${v.spec}  (${v.modulo})`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("✓ Fachadas de módulo OK (imports cruzados solo por index)");
}

main();
