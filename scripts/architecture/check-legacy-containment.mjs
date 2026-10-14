/**
 * Contención legacy: no crecer carpetas congeladas (components, lib, pages, …).
 * Código nuevo → apps/<app>/src/modulos/. La lista base solo puede encogerse.
 *
 * Excepciones: scripts/architecture/legacy-containment-exceptions.json
 * (reason obligatoria por archivo).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASELINE_PATH = path.join(ROOT, "scripts/architecture/legacy-baseline.json");
const EXCEPTIONS_PATH = path.join(ROOT, "scripts/architecture/legacy-containment-exceptions.json");
const EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".css", ".json"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(name))) {
      out.push(path.relative(ROOT, full).replace(/\\/g, "/"));
    }
  }
  return out;
}

function main() {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const exceptions = JSON.parse(fs.readFileSync(EXCEPTIONS_PATH, "utf8"));
  const baseSet = new Set((baseline.files || []).map((f) => f.replace(/\\/g, "/")));
  const exceptSet = new Set((exceptions.files || []).map((e) => (typeof e === "string" ? e : e.file).replace(/\\/g, "/")));

  for (const e of exceptions.files || []) {
    if (typeof e === "object" && e && !e.reason) {
      console.error(`✗ Excepción sin reason: ${e.file}`);
      process.exitCode = 1;
      return;
    }
  }

  const folders = [...(baseline.folders?.web || []), ...(baseline.folders?.api || [])];
  const current = folders.flatMap((d) => walk(path.join(ROOT, d))).sort();
  const currentSet = new Set(current);

  const added = current.filter((f) => !baseSet.has(f) && !exceptSet.has(f));
  const missingFromDisk = [...baseSet].filter((f) => !currentSet.has(f) && !fs.existsSync(path.join(ROOT, f)));
  // Encoger es OK (migración). Solo fallamos por crecimiento.
  // missingFromDisk: archivo en baseline ya no existe → aviso, no fallo (lista se actualizará en PR de migración).

  if (added.length) {
    console.error("✗ Contención legacy: archivos NUEVOS fuera de modulos/ (no están en la lista base):");
    for (const f of added) console.error(`  + ${f}`);
    console.error(
      "\n  Pon el código en apps/<app>/src/modulos/<modulo>/ o documenta una excepción en\n" +
        "  scripts/architecture/legacy-containment-exceptions.json (file + reason).\n" +
        "  Tras migrar, reduce legacy-baseline.json (nunca lo amplíes salvo excepción).\n",
    );
    process.exitCode = 1;
    return;
  }

  if (missingFromDisk.length) {
    console.log(
      `· Contención: ${missingFromDisk.length} entrada(s) de baseline ya no existen en disco (OK al migrar; actualiza baseline en el PR).`,
    );
  }

  console.log(
    `✓ Contención legacy OK (${current.length} archivos en carpetas congeladas, baseline ${baseSet.size}, excepciones ${exceptSet.size})`,
  );
}

main();
