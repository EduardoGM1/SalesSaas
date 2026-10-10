#!/usr/bin/env node
/**
 * Falla si falta alguna imagen referenciada o si alguna supera el presupuesto
 * sin justificación en el reporte.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = path.join(ROOT, "public/presentacion/index.html");
const IMG_DIR = path.join(ROOT, "public/presentacion/img");
const REPORT = path.join(ROOT, "docs/presentacion/optimize-report.json");
const BUDGET = 150 * 1024;
/** Justificados: foto hero vimg / detalle grande / moneda a resolución de pantalla. */
const ALLOW_OVER = new Set([2, 8, 35]);

const html = fs.readFileSync(HTML, "utf8");
const refs = [...html.matchAll(/\/presentacion\/img\/([0-9]{2}\.[a-z0-9]+)/gi)].map((m) => m[1]);
const uniq = [...new Set(refs)];
if (!uniq.length) throw new Error("no image refs in HTML");

const report = JSON.parse(fs.readFileSync(REPORT, "utf8"));
const byOut = new Map(report.images.map((i) => [i.outputFile, i]));

let failed = 0;
for (const file of uniq) {
  const full = path.join(IMG_DIR, file);
  if (!fs.existsSync(full)) {
    console.error("MISSING", file);
    failed++;
    continue;
  }
  const st = fs.statSync(full);
  const row = byOut.get(file);
  const order = row?.order ?? parseInt(file, 10);
  if (st.size > BUDGET && !ALLOW_OVER.has(order)) {
    console.error(
      "OVER_BUDGET",
      file,
      `${(st.size / 1024).toFixed(1)}KB`,
      row ? `ssim=${row.ssim} enc=${row.encoder}` : "",
    );
    failed++;
  } else if (st.size > BUDGET) {
    console.log(
      "OVER_BUDGET_OK",
      file,
      `${(st.size / 1024).toFixed(1)}KB`,
      "(justificado)",
    );
  }
}

// Every manifest/report image must exist on disk
for (const img of report.images) {
  const full = path.join(IMG_DIR, img.outputFile);
  if (!fs.existsSync(full)) {
    console.error("MISSING_REPORT", img.outputFile);
    failed++;
  }
}

const total = report.totalBytesAfter;
if (total > 2 * 1024 * 1024) {
  console.error("TOTAL_OVER_2MB", (total / 1024).toFixed(1));
  failed++;
}

if (failed) {
  console.error("FAIL test-presentacion-img-budget", failed);
  process.exit(1);
}
console.log("PASS test-presentacion-img-budget", {
  refs: uniq.length,
  totalKb: (total / 1024).toFixed(1),
});
