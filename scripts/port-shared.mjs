/**
 * Copia src/lib → packages/shared/src convirtiendo imports @/lib → relativos.
 * Elimina anotaciones TypeScript simples para salida .js ESM.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC_LIB = path.join(ROOT, "apps", "web", "src", "lib");
const DEST = path.join(ROOT, "packages", "shared", "src");

const SKIP = new Set(["supabase/middleware.ts", "supabase/server.ts", "supabase/client.ts"]);

function stripTypes(code) {
  return code
    .replace(/^import type .+$/gm, "")
    .replace(/^export type .+$/gm, "")
    .replace(/^export interface .+$/gm, "")
    .replace(/^interface .+$/gm, "")
    .replace(/: (?:Promise<)?[A-Za-z_$][\w$<>, |&\[\]?]*(?:>)?(?=\s*[,)=])/g, "")
    .replace(/ as const/g, "")
    .replace(/ as [A-Za-z_$][\w$<>, |&\[\]?]*/g, "")
    .replace(/from "@\/lib\//g, 'from "./')
    .replace(/from '@\/lib\//g, "from './")
    .replace(/\.ts"/g, '.js"')
    .replace(/\.ts'/g, ".js'");
}

function walk(dir, base = "") {
  for (const name of fs.readdirSync(dir)) {
    const rel = path.join(base, name).replace(/\\/g, "/");
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      walk(full, rel);
      continue;
    }
    if (!name.endsWith(".ts")) continue;
    if (SKIP.has(rel)) continue;
    const outRel = rel.replace(/\.ts$/, ".js");
    const outPath = path.join(DEST, outRel);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const raw = fs.readFileSync(full, "utf8");
    fs.writeFileSync(outPath, stripTypes(raw), "utf8");
    console.log(`  ${rel} → ${outRel}`);
  }
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
console.log("Portando lib compartida...");
walk(SRC_LIB);
console.log("Listo:", DEST);
