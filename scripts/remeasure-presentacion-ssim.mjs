#!/usr/bin/env node
/**
 * Remide SSIM: original completo reescalado al tamaño exacto del entregable
 * (sin tope 720 ni referencia pre-reducida intermedia).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { ssim as ssimJs } from "ssim.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIG = path.join(ROOT, "docs/presentacion/img-originales");
const OUT = path.join(ROOT, "apps/web/public/presentacion/img");
const MANIFEST = path.join(ROOT, "docs/presentacion/img-manifest.json");
const REPORT = path.join(ROOT, "docs/presentacion/optimize-report.json");
const SSIM_MIN = 0.985;

async function rgbaAt(buf, width, height) {
  const { data } = await sharp(buf)
    .resize(width, height, { fit: "fill" })
    .flatten({ background: { r: 11, g: 30, b: 39 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width, height };
}

async function ssimFullSize(origBuf, outBuf) {
  const meta = await sharp(outBuf).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  // Original completo → tamaño exacto del entregable
  const ref = await sharp(origBuf)
    .resize(w, h, { fit: "fill" })
    .toBuffer();
  const a = await rgbaAt(ref, w, h);
  const b = await rgbaAt(outBuf, w, h);
  const result = ssimJs(a, b);
  return Number(result?.mssim ?? result?.ssim ?? 0);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const prev = fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, "utf8")) : { images: [] };
const prevByOrder = new Map((prev.images || []).map((r) => [r.order, r]));

const rows = [];
for (const img of manifest.images) {
  const prevRow = prevByOrder.get(img.order);
  const outName = prevRow?.outputFile || img.file;
  const origPath = path.join(ORIG, img.file);
  const outPath = path.join(OUT, outName);
  if (!fs.existsSync(origPath) || !fs.existsSync(outPath)) {
    rows.push({ order: img.order, file: img.file, out: outName, error: "missing file" });
    continue;
  }
  const origBuf = fs.readFileSync(origPath);
  const outBuf = fs.readFileSync(outPath);
  const origMeta = await sharp(origBuf).metadata();
  const outMeta = await sharp(outBuf).metadata();
  const resized = (origMeta.width !== outMeta.width) || (origMeta.height !== outMeta.height);
  const hasAlpha = Boolean(origMeta.hasAlpha);
  const ssim = await ssimFullSize(origBuf, outBuf);
  rows.push({
    order: img.order,
    file: img.file,
    out: outName,
    origPx: `${origMeta.width}x${origMeta.height}`,
    outPx: `${outMeta.width}x${outMeta.height}`,
    resized,
    hasAlpha,
    ssim: Number(ssim.toFixed(4)),
    pass: ssim >= SSIM_MIN,
  });
  console.log(
    `#${String(img.order).padStart(2, "0")} ${outName} ssim=${ssim.toFixed(4)}`
    + ` orig=${origMeta.width}x${origMeta.height}→${outMeta.width}x${outMeta.height}`
    + ` resized=${resized} alpha=${hasAlpha} ${ssim >= SSIM_MIN ? "PASS" : "FAIL"}`,
  );
}

const below = rows.filter((r) => !r.error && r.ssim < SSIM_MIN);
const outJson = path.join(ROOT, "docs/presentacion/ssim-full-original-report.json");
fs.writeFileSync(outJson, JSON.stringify({ method: "full-original→output-size", ssimMin: SSIM_MIN, below, rows }, null, 2));
console.log("\n--- Below 0.985 ---");
if (!below.length) console.log("(none)");
else below.forEach((r) => console.log(`#${r.order} ${r.out} ssim=${r.ssim}`));
console.log("wrote", outJson);
