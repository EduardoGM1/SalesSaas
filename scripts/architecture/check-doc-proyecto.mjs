/**
 * Valida docs/PROYECTO.md: rutas y enlaces citados, comandos npm, tabla de versiones
 * y ausencia de secretos, datos personales y material de operaciones (repo público).
 *
 * Uso: node scripts/architecture/check-doc-proyecto.mjs [ruta.md]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOC = path.resolve(ROOT, process.argv[2] || "docs/PROYECTO.md");
const text = fs.readFileSync(DOC, "utf8");
const docDir = path.dirname(DOC);
const errors = [];
const stats = { rutas: 0, enlaces: 0, comandos: 0, versiones: 0 };

const ROOTS = ["apps/", "packages/", "scripts/", "docs/", "e2e/", "supabase/", ".github/", "public/", "deploy/", "api/", ".cursor/"];
const ROOT_FILES = ["README.md", "package.json", "package-lock.json", "playwright.config.js", "vercel.json", ".env.example"];
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

// Rutas en backticks (sin plantillas ni comodines).
for (const m of text.matchAll(/`([^`\n]+)`/g)) {
  const raw = m[1].trim();
  if (/[<>{}*…\s]|:\w|NNNN/.test(raw)) continue;
  const isPath = ROOTS.some((r) => raw.startsWith(r)) || ROOT_FILES.includes(raw);
  if (!isPath) continue;
  stats.rutas++;
  if (!exists(raw.replace(/\/$/, ""))) errors.push(`ruta inexistente: ${raw}`);
}

// Enlaces markdown relativos.
for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
  const href = m[1];
  if (/^(https?:|mailto:|#)/.test(href)) continue;
  stats.enlaces++;
  const target = path.resolve(docDir, href.split("#")[0]);
  if (!fs.existsSync(target)) errors.push(`enlace roto: ${href}`);
}

// Comandos npm run <script> [-w <workspace>].
const pkgs = { root: JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) };
for (const ws of ["apps/web", "apps/api", "packages/shared"]) {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, ws, "package.json"), "utf8"));
  pkgs[p.name] = p;
  pkgs[ws] = p;
}
for (const m of text.matchAll(/npm run ([\w:.-]+)(?:\s+-w\s+(@[\w/-]+))?/g)) {
  const [, script, ws] = m;
  stats.comandos++;
  const pkg = ws ? pkgs[ws] : pkgs.root;
  if (!pkg) errors.push(`workspace desconocido: ${ws}`);
  else if (!pkg.scripts?.[script]) errors.push(`script npm inexistente: npm run ${script}${ws ? ` -w ${ws}` : ""}`);
}

// Tabla de versiones contra package.json y package-lock.json.
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8")).packages;
const block = text.split("<!-- versiones:inicio -->")[1]?.split("<!-- versiones:fin -->")[0];
if (!block) errors.push("falta el bloque <!-- versiones:inicio --> … <!-- versiones:fin -->");
else {
  for (const line of block.split("\n")) {
    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length !== 4 || cells[0] === "Paquete" || /^-+$/.test(cells[0])) continue;
    const [name, declared, resolved, where] = cells;
    stats.versiones++;
    const pkg = where === "raíz" ? pkgs.root : pkgs[where];
    const decl = pkg && { ...pkg.dependencies, ...pkg.devDependencies }[name];
    if (decl !== declared) errors.push(`versión declarada distinta: ${name} doc=${declared} ${where}=${decl}`);
    const got = lock[`node_modules/${name}`]?.version;
    if (got !== resolved) errors.push(`versión resuelta distinta: ${name} doc=${resolved} lock=${got}`);
  }
}

// Secretos, PII y material de operaciones.
const FORBIDDEN = {
  jwt: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
  clave_api: /\b(sk_(live|test)_[A-Za-z0-9]+|re_[A-Za-z0-9]{16,}|AKIA[A-Z0-9]{12,})\b/g,
  asignacion_secreto: /(password|passwd|secret|token|api[_-]?key|service_role)\s*[=:]\s*['"]?[A-Za-z0-9+/_-]{8,}/gi,
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/g,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  uuid: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  ruta_backups: /\/opt\/|saletse-backups/gi,
  ruta_ops: /\.saletse-ops/gi,
  ruta_servidor: /\/var\/www|\/root\/|\/home\/|\.pm2\/|saletse-prod-db|ssh\s+\w+@/gi,
  supabase_ref: /\b[a-z0-9]{20}\.supabase\.co\b/gi,
  politica_rls: /\b\w+_(tenant_role|select_own|insert_own|update_own|delete_own)\b|broadcast_expediente|presence_[a-z]+\b|create\s+policy|drop\s+policy|pg_policies/gi,
  funcion_rls: /user_can_access_prospect|user_in_workspace|workspace_has_permission|effective_workspace_permissions/gi,
};
const lines = text.split("\n");
for (const [kind, rx] of Object.entries(FORBIDDEN)) {
  lines.forEach((l, i) => {
    for (const m of l.matchAll(rx)) errors.push(`${kind} en línea ${i + 1}: ${m[0].slice(0, 6)}…`);
  });
}

const rel = path.relative(ROOT, DOC).replaceAll("\\", "/");
console.log(`${rel}: ${stats.rutas} rutas, ${stats.enlaces} enlaces, ${stats.comandos} comandos npm, ${stats.versiones} versiones revisadas`);
if (errors.length) {
  console.error(`✗ ${errors.length} problema(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("✓ sin problemas (rutas, enlaces, comandos, versiones, secretos/PII/ops = 0)");
