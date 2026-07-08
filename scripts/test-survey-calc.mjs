/**
 * Prueba unitaria del Cambio 4 (totales sin año).
 * Uso: node scripts/test-survey-calc.mjs
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "scripts", ".tmp-survey-calc.mjs");
const entry = path.join(root, "apps/web/src/lib/calculations/survey.ts");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

try {
  execSync(
    [
      "npx --yes esbuild",
      `"${entry}"`,
      "--bundle",
      "--format=esm",
      "--platform=neutral",
      `--outfile="${out}"`,
      `--alias:@=${path.join(root, "apps/web/src").replace(/\\/g, "/")}`,
    ].join(" "),
    { cwd: root, stdio: "pipe" },
  );

  const { computeSurvey } = await import(pathToFileURL(out).href);
  const data = {
    sh1y: "",
    sh1a: "2000",
    sh2y: "",
    sh2a: "3000",
    sh3y: "",
    sh3a: "",
  };
  const result = computeSurvey(data);
  assert(result.hist.spend === 5000, `hist.spend esperado 5000, obtuvo ${result.hist.spend}`);
  assert(result.hist.avg === 2500, `hist.avg esperado 2500, obtuvo ${result.hist.avg}`);
  assert(result.hist.dp === 2500, `hist.dp esperado 2500, obtuvo ${result.hist.dp}`);
  assert(Math.abs(result.hist.mi - 2500 / 12) < 0.01, `hist.mi incorrecto: ${result.hist.mi}`);

  const cleared = computeSurvey({ ...data, sh2a: "" });
  assert(cleared.hist.spend === 2000, `recálculo tras borrar: ${cleared.hist.spend}`);

  console.log("✓ computeSurvey: totales sin año OK");
} finally {
  if (fs.existsSync(out)) fs.unlinkSync(out);
}
