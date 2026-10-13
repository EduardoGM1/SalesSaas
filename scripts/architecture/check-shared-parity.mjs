/**
 * Paridad web ↔ packages/shared para el manifiesto de sync:shared.
 * Genera con esbuild a temp y compara byte-a-byte (normaliza CRLF).
 * No escribe en packages/shared.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import os from "node:os";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST = path.join(ROOT, "scripts/architecture/sync-shared-files.json");

function normalize(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const pairs = manifest.pairs || [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shared-parity-"));
  const errors = [];

  try {
    for (const pair of pairs) {
      const webAbs = path.join(ROOT, pair.web);
      const sharedAbs = path.join(ROOT, pair.shared);
      if (!fs.existsSync(webAbs)) {
        errors.push(`falta fuente web: ${pair.web}`);
        continue;
      }
      if (!fs.existsSync(sharedAbs)) {
        errors.push(`falta shared: ${pair.shared}`);
        continue;
      }

      const outFile = path.join(tmp, path.basename(pair.shared));
      let generated;
      try {
        if (pair.web.endsWith(".js")) {
          generated = fs.readFileSync(webAbs, "utf8");
        } else {
          execSync(
            [
              "npx --yes esbuild",
              `"${webAbs.replace(/\\/g, "/")}"`,
              "--bundle=false",
              "--format=esm",
              "--platform=neutral",
              "--charset=utf8",
              `--outfile="${outFile.replace(/\\/g, "/")}"`,
              "--log-level=error",
            ].join(" "),
            { cwd: ROOT, stdio: "pipe" },
          );
          generated = fs.readFileSync(outFile, "utf8");
        }
      } catch (err) {
        errors.push(`generar falló para ${pair.web}: ${err.message}`);
        continue;
      }

      // Misma reescritura de imports que scripts/fix-shared-imports.mjs (sobre el archivo temp).
      const sharedRel = pair.shared.replace(/^packages\/shared\/src\/?/, "");
      const sharedRelDir = path.posix.dirname(sharedRel);
      const depth = sharedRelDir && sharedRelDir !== "." ? sharedRelDir.split("/").length : 0;
      const prefix = depth ? "../".repeat(depth) : "./";
      const withJsExt = (p) => {
        const cleaned = p.replace(/\.ts$/, ".js").replace(/\.tsx$/, ".js");
        return cleaned.endsWith(".js") ? cleaned : `${cleaned}.js`;
      };
      generated = generated.replace(/from "@\/lib\/([^"]+)"/g, (_, p) => `from "${prefix}${withJsExt(p)}"`);
      generated = generated.replace(/from '@\/lib\/([^']+)'/g, (_, p) => `from '${prefix}${withJsExt(p)}'`);
      generated = generated.replace(/from "\.\/([^"]+)"/g, (m, p) => (p.endsWith(".js") ? m : `from "./${withJsExt(p)}"`));
      generated = generated.replace(/from '\.\/([^']+)'/g, (m, p) => (p.endsWith(".js") ? m : `from './${withJsExt(p)}'`));
      generated = generated.replace(/from "\.\.\/([^"]+)"/g, (m, p) => (p.endsWith(".js") ? m : `from "../${withJsExt(p)}"`));
      generated = generated.replace(/from '\.\.\/([^']+)'/g, (m, p) => (p.endsWith(".js") ? m : `from '../${withJsExt(p)}'`));

      generated = normalize(generated);
      const current = normalize(fs.readFileSync(sharedAbs, "utf8"));
      if (generated !== current) {
        errors.push(`desalineado: ${pair.web} ≠ ${pair.shared} (correr npm run sync:shared)`);
      } else {
        console.log(`  ✓ ${pair.web}`);
      }
    }

    // Nota: shared-only no se valida por esbuild, solo existencia
    for (const rel of manifest.sharedOnlyNoted || []) {
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) {
        errors.push(`shared-only ausente: ${rel}`);
      } else {
        console.log(`  · shared-only OK ${rel}`);
      }
    }

    for (const row of manifest.intentionallyDivergent || []) {
      console.log(`  · divergente documentado: ${row.web} ↔ ${row.shared}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (errors.length) {
    console.error("✗ Paridad sync:shared FALLÓ:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✓ Paridad web↔shared OK (${pairs.length} pares + shared-only)`);
}

main();
