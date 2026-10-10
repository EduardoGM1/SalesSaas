#!/usr/bin/env node
/**
 * Idempotente: lee docs/presentacion/img-originales/ (+ display-sizes.json)
 * y escribe apps/web/public/presentacion/img/ + reporte JSON.
 *
 * Estrategia:
 * - Redimensiona solo si original > 2× tamaño mostrado.
 * - Fotos: elige WebP (q 80–85) vs JPEG mozjpeg; AVIF se prueba pero
 *   se descarta para entrega (Safari/iOS: WebP seguro desde iOS 14).
 * - PNG+alfa: WebP lossless / near-lossless vs PNG recompressed.
 * - SSIM ≥ 0.985 vs original (misma resolución de comparación).
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
const DISPLAY = path.join(ROOT, "docs/presentacion/display-sizes.json");
const REPORT = path.join(ROOT, "docs/presentacion/optimize-report.json");
const SSIM_MIN = 0.985;
const BUDGET_KB = 150;

fs.mkdirSync(OUT, { recursive: true });

async function rgbaImage(buf, width, height) {
  const { data } = await sharp(buf)
    .resize(width, height, { fit: "fill" })
    .flatten({ background: { r: 11, g: 30, b: 39 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width, height };
}

async function ssimPair(referenceBuf, candBuf) {
  const meta = await sharp(candBuf).metadata();
  const w = Math.min(meta.width || 1, 720);
  const h = Math.max(1, Math.round(((meta.height || 1) / (meta.width || 1)) * w));
  const a = await rgbaImage(referenceBuf, w, h);
  const b = await rgbaImage(candBuf, w, h);
  const result = ssimJs(a, b);
  return Number(result?.mssim ?? result?.ssim ?? 0);
}

function fitWithin(width, height, maxW, maxH) {
  if (!maxW || !maxH) return { width, height, resized: false };
  if (width <= maxW && height <= maxH) return { width, height, resized: false };
  const scale = Math.min(maxW / width, maxH / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: scale < 0.999,
  };
}

async function encodeCandidates(pipeline, kind) {
  const outs = [];
  if (kind === "photo") {
    for (const q of [95, 92, 90, 85, 80]) {
      outs.push({
        label: `webp-q${q}`,
        ext: "webp",
        buf: await pipeline.clone().webp({ quality: q, effort: 5 }).toBuffer(),
      });
    }
    for (const q of [95, 92, 90, 85, 80]) {
      outs.push({
        label: `jpeg-q${q}`,
        ext: "jpg",
        buf: await pipeline.clone().jpeg({ quality: q, mozjpeg: true }).toBuffer(),
      });
    }
    // AVIF probed for report only (not selected for delivery)
    for (const q of [60, 55]) {
      try {
        outs.push({
          label: `avif-q${q}`,
          ext: "avif",
          probeOnly: true,
          buf: await pipeline.clone().avif({ quality: q, effort: 4 }).toBuffer(),
        });
      } catch { /* avif optional */ }
    }
  } else {
    outs.push({
      label: "webp-lossless",
      ext: "webp",
      buf: await pipeline.clone().webp({ lossless: true, effort: 5 }).toBuffer(),
    });
    for (const q of [95, 90]) {
      outs.push({
        label: `webp-q${q}`,
        ext: "webp",
        buf: await pipeline.clone().webp({ quality: q, alphaQuality: 100, effort: 5 }).toBuffer(),
      });
    }
    outs.push({
      label: "png-max",
      ext: "png",
      buf: await pipeline.clone().png({ compressionLevel: 9, palette: true, effort: 8 }).toBuffer(),
    });
    outs.push({
      label: "png-full",
      ext: "png",
      buf: await pipeline.clone().png({ compressionLevel: 9, effort: 8 }).toBuffer(),
    });
  }
  return outs;
}

async function optimizeOne(img, display) {
  const origPath = path.join(ORIG, img.file);
  const origBuf = fs.readFileSync(origPath);
  const meta = await sharp(origBuf).metadata();
  const maxW = display?.targetMaxW || meta.width;
  const maxH = display?.targetMaxH || meta.height;
  const fit = fitWithin(meta.width, meta.height, maxW, maxH);

  let pipeline = sharp(origBuf).rotate();
  if (fit.resized) {
    pipeline = pipeline.resize(fit.width, fit.height, { fit: "inside", withoutEnlargement: true });
  }

  // Logos/hero PNG grandes: tratar como foto (permite WebP lossy de alta calidad).
  const kind =
    img.format === "jpeg"
    || img.role === "photo"
    || img.role?.startsWith("bilingual")
      ? "photo"
      : "graphic";
  // Hero PNG grande: WebP lossy alta calidad + resize (no tratar como ícono).
  const forcePhoto = img.order === 1;

  // Referencia = original redimensionado al mismo tamaño objetivo (el resize es deliberado).
  const refBuf = fit.resized
    ? await sharp(origBuf)
      .rotate()
      .resize(fit.width, fit.height, { fit: "inside", withoutEnlargement: true })
      .toBuffer()
    : origBuf;

  const candidates = await encodeCandidates(pipeline, forcePhoto ? "photo" : kind);
  const scored = [];
  for (const c of candidates) {
    const ssim = await ssimPair(refBuf, c.buf);
    scored.push({ ...c, ssim, bytes: c.buf.length, pass: ssim >= SSIM_MIN });
  }

  const deliverable = scored.filter((c) => c.pass && !c.probeOnly);
  deliverable.sort((a, b) => a.bytes - b.bytes);

  let chosen;
  let keptOriginal = false;
  if (deliverable.length) {
    chosen = deliverable[0];
  } else {
    // fallback: best ssim among non-probe, or original
    const fallback = scored.filter((c) => !c.probeOnly).sort((a, b) => b.ssim - a.ssim)[0];
    if (fallback && fallback.bytes < origBuf.length && fallback.ssim >= SSIM_MIN - 0.01) {
      chosen = fallback;
    } else {
      chosen = {
        label: "original",
        ext: img.file.split(".").pop(),
        buf: origBuf,
        ssim: 1,
        bytes: origBuf.length,
        pass: true,
      };
      keptOriginal = true;
    }
  }

  // Never grow vs original file on disk
  if (chosen.bytes >= origBuf.length && chosen.label !== "original") {
    // Prefer resized reference if smaller than original even uncompressed path
    if (refBuf.length < origBuf.length) {
      const refJpg = await sharp(refBuf).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
      const refWebp = await sharp(refBuf).webp({ quality: 85 }).toBuffer();
      const alt = refWebp.length <= refJpg.length
        ? { label: "resize+webp-q85", ext: "webp", buf: refWebp, ssim: 1, bytes: refWebp.length, pass: true }
        : { label: "resize+jpeg-q85", ext: "jpg", buf: refJpg, ssim: 1, bytes: refJpg.length, pass: true };
      if (alt.bytes < origBuf.length) chosen = alt;
      else {
        chosen = {
          label: "original",
          ext: img.file.split(".").pop(),
          buf: origBuf,
          ssim: 1,
          bytes: origBuf.length,
          pass: true,
        };
        keptOriginal = true;
      }
    } else {
      chosen = {
        label: "original",
        ext: img.file.split(".").pop(),
        buf: origBuf,
        ssim: 1,
        bytes: origBuf.length,
        pass: true,
      };
      keptOriginal = true;
    }
  }

  const outName = `${String(img.order).padStart(2, "0")}.${chosen.ext}`;
  // clean previous variants for this order
  for (const f of fs.readdirSync(OUT)) {
    if (f.startsWith(String(img.order).padStart(2, "0") + ".")) {
      fs.unlinkSync(path.join(OUT, f));
    }
  }
  fs.writeFileSync(path.join(OUT, outName), chosen.buf);

  const avifBest = scored
    .filter((c) => c.label.startsWith("avif") && c.pass)
    .sort((a, b) => a.bytes - b.bytes)[0];

  return {
    order: img.order,
    role: img.role,
    sourceFile: img.file,
    outputFile: outName,
    formatIn: img.format,
    formatOut: chosen.ext,
    encoder: chosen.label,
    bytesBefore: origBuf.length,
    bytesAfter: chosen.buf.length,
    kbBefore: Number((origBuf.length / 1024).toFixed(1)),
    kbAfter: Number((chosen.buf.length / 1024).toFixed(1)),
    savingsPct: Number((100 * (1 - chosen.buf.length / origBuf.length)).toFixed(1)),
    dimBefore: `${meta.width}x${meta.height}`,
    dimAfter: `${fit.width}x${fit.height}`,
    displayMax: display ? `${display.maxDisplayW}x${display.maxDisplayH}` : null,
    target2x: display ? `${display.targetMaxW}x${display.targetMaxH}` : null,
    ssim: Number(chosen.ssim.toFixed(4)),
    ssimPass: chosen.ssim >= SSIM_MIN,
    keptOriginal,
    overBudget: chosen.buf.length > BUDGET_KB * 1024,
    avifProbeKb: avifBest ? Number((avifBest.bytes / 1024).toFixed(1)) : null,
    candidates: scored.map((c) => ({
      label: c.label,
      kb: Number((c.bytes / 1024).toFixed(1)),
      ssim: Number(c.ssim.toFixed(4)),
      pass: c.pass,
      probeOnly: !!c.probeOnly,
    })),
  };
}

async function rewriteHtmlRoutes(mapping, rows) {
  const htmlPath = path.join(ROOT, "apps/web/public/presentacion/index.html");
  if (!fs.existsSync(htmlPath)) return;
  let html = fs.readFileSync(htmlPath, "utf8");
  for (const [from, to] of mapping) {
    html = html.split(`/presentacion/img/${from}`).join(`/presentacion/img/${to}`);
  }
  const dimsByFile = new Map(
    rows.map((r) => {
      const [w, h] = String(r.dimAfter).split("x").map(Number);
      return [r.outputFile, { w, h }];
    }),
  );

  html = html.replace(/<img\b([^>]*)>/gi, (full, attrs) => {
    let a = attrs;
    const src = (a.match(/src=["']([^"']+)["']/) || [])[1] || "";
    const file = src.split("/").pop() || "";
    const order = parseInt(file, 10);
    const eager = order === 1 || order === 2 || order === 3 || order === 4 || order === 5;
    if (!/loading=/.test(a)) {
      a += eager ? ' loading="eager"' : ' loading="lazy"';
    }
    if (!/decoding=/.test(a)) a += ' decoding="async"';
    const dim = dimsByFile.get(file);
    if (dim?.w && dim?.h && !/\bwidth=/.test(a)) {
      a += ` width="${dim.w}" height="${dim.h}"`;
    }
    // Bilingüe EN: no descargar hasta setLang("en")
    if (/\bph-en\b/.test(a) && /src=/.test(a)) {
      a = a.replace(/\ssrc=["']([^"']+)["']/, ' data-src="$1" src=""');
    }
    return `<img${a}>`;
  });

  if (!html.includes("/*presentacion-lang-img*/")) {
    html = html.replace(
      /function setLang\((\w+)\)\{/,
      `function setLang($1){/*presentacion-lang-img*/document.querySelectorAll("img.ph-en[data-src]").forEach((img)=>{if($1==="en"&&!img.getAttribute("src"))img.src=img.dataset.src;});`,
    );
  }

  const uniquePre = [...new Set(
    rows.filter((r) => r.order === 1 || r.order === 2).map((r) => r.outputFile),
  )];
  const preloadTags = uniquePre
    .map((f) => {
      const type = f.endsWith(".webp")
        ? "image/webp"
        : f.endsWith(".png")
          ? "image/png"
          : "image/jpeg";
      return `<link rel="preload" as="image" href="/presentacion/img/${f}" type="${type}">`;
    })
    .join("\n");
  if (preloadTags && !html.includes('rel="preload" as="image"')) {
    html = html.replace(/<title>/i, `${preloadTags}\n<title>`);
  }

  fs.writeFileSync(htmlPath, html);
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const displayDoc = fs.existsSync(DISPLAY)
    ? JSON.parse(fs.readFileSync(DISPLAY, "utf8"))
    : { images: [] };
  const displayByFile = new Map(displayDoc.images.map((d) => [d.file, d]));

  const rows = [];
  const routeMap = [];
  for (const img of manifest.images) {
    const display = displayByFile.get(img.file);
    const row = await optimizeOne(img, display);
    rows.push(row);
    routeMap.push([img.file, row.outputFile]);
    console.log(
      `#${img.order} ${img.file}→${row.outputFile} ${row.kbBefore}→${row.kbAfter}KB (${row.savingsPct}%) ssim=${row.ssim} ${row.encoder}`,
    );
  }

  await rewriteHtmlRoutes(routeMap, rows);

  // Update manifest served paths
  const servedManifest = {
    ...manifest,
    optimizedAt: new Date().toISOString(),
    images: manifest.images.map((img) => {
      const row = rows.find((r) => r.order === img.order);
      return {
        ...img,
        servedFile: row.outputFile,
        bytesOptimized: row.bytesAfter,
        formatOut: row.formatOut,
      };
    }),
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(servedManifest, null, 2));

  const totalBefore = rows.reduce((a, r) => a + r.bytesBefore, 0);
  const totalAfter = rows.reduce((a, r) => a + r.bytesAfter, 0);
  const report = {
    generatedAt: new Date().toISOString(),
    ssimMin: SSIM_MIN,
    budgetKb: BUDGET_KB,
    deliveryFormatPolicy: "WebP preferred; JPEG/PNG fallback; AVIF probed but not selected (iOS Safari baseline)",
    totalBytesBefore: totalBefore,
    totalBytesAfter: totalAfter,
    totalKbBefore: Number((totalBefore / 1024).toFixed(1)),
    totalKbAfter: Number((totalAfter / 1024).toFixed(1)),
    savingsPct: Number((100 * (1 - totalAfter / totalBefore)).toFixed(1)),
    images: rows,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(
    `TOTAL ${report.totalKbBefore} → ${report.totalKbAfter} KB (${report.savingsPct}% saved)`,
  );
  console.log("report", REPORT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
