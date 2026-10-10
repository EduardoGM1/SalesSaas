#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = JSON.parse(
  fs.readFileSync(path.join(ROOT, "docs/presentacion/optimize-report.json"), "utf8"),
);
const out = path.join(ROOT, "docs/presentacion/comparativa.html");

const rows = report.images
  .map((img) => {
    const orig = `img-originales/${img.sourceFile}`;
    const opt = `../../apps/web/public/presentacion/img/${img.outputFile}`;
    return `<tr>
  <td>#${img.order}<br><small>${img.role || ""}</small></td>
  <td><img src="${orig}" alt="orig ${img.order}"><div class="meta">${img.dimBefore} · ${img.kbBefore} KB · ${img.formatIn}</div></td>
  <td><img src="${opt}" alt="opt ${img.order}"><div class="meta">${img.dimAfter} · ${img.kbAfter} KB · ${img.formatOut} · ${img.encoder}<br>SSIM ${img.ssim}${img.ssimPass ? "" : " ⚠ bajo umbral"} · ${img.savingsPct}%</div></td>
</tr>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Comparativa presentación RH — original vs optimizada</title>
<style>
  body{font:14px/1.4 system-ui,sans-serif;margin:24px;background:#111;color:#eee}
  h1{font-size:20px}
  .sum{margin:12px 0 24px;padding:12px;background:#1c1c1c;border-radius:8px}
  table{width:100%;border-collapse:collapse}
  th,td{border-bottom:1px solid #333;padding:12px;vertical-align:top}
  th{text-align:left;color:#9cf}
  img{max-width:100%;height:auto;background:#0B1E27;border-radius:8px}
  .meta{margin-top:8px;color:#aaa;font-size:12px}
  td:nth-child(2),td:nth-child(3){width:42%}
</style>
</head>
<body>
<h1>Contact sheet — 35 imágenes presentación Royal Holiday</h1>
<div class="sum">
  Total: <b>${report.totalKbBefore} KB → ${report.totalKbAfter} KB</b>
  (${report.savingsPct}% ahorro) · SSIM mín ${report.ssimMin} ·
  generado ${report.generatedAt}
</div>
<table>
  <thead><tr><th>#</th><th>Original</th><th>Optimizada</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
</body>
</html>
`;
fs.writeFileSync(out, html);
console.log("wrote", out);
