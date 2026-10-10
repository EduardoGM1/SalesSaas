#!/usr/bin/env node
/**
 * Extrae las 35 imágenes base64 del HTML fuente a:
 *   docs/presentacion/img-originales/   (conservar, no servir)
 *   public/presentacion/img/   (servidas; luego las optimiza otro script)
 * y escribe docs/presentacion/img-manifest.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "docs/presentacion/Presentacion-Royal-Holiday.source.html");
const OUT_ORIG = path.join(ROOT, "docs/presentacion/img-originales");
const OUT_PUBLIC = path.join(ROOT, "public/presentacion/img");
const MANIFEST = path.join(ROOT, "docs/presentacion/img-manifest.json");

fs.mkdirSync(OUT_ORIG, { recursive: true });
fs.mkdirSync(OUT_PUBLIC, { recursive: true });

const html = fs.readFileSync(SRC, "utf8");
const re = /data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)/gi;
const entries = [];
let m;
while ((m = re.exec(html))) {
  const fmt = m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase();
  const buf = Buffer.from(m[2], "base64");
  entries.push({
    order: entries.length + 1,
    fmt,
    bytes: buf.length,
    index: m.index,
    buf,
    dataUrlPrefix: m[0].slice(0, 40),
  });
}

if (entries.length !== 35) {
  console.warn(`WARN: expected 35 images, got ${entries.length}`);
}

const contextSnippet = (idx, radius = 180) => {
  const start = Math.max(0, idx - radius);
  const end = Math.min(html.length, idx + radius);
  return html.slice(start, end).replace(/\s+/g, " ");
};

const guessRole = (snippet, order, fmt) => {
  const s = snippet.toLowerCase();
  if (/ph-es|lang.?es|es\.png|moneda.*es|currency.*es/.test(s)) return "bilingual-es";
  if (/ph-en|lang.?en|en\.png|moneda.*en|currency.*en/.test(s)) return "bilingual-en";
  if (/logo|brand/.test(s)) return "logo";
  if (/icon|ico-|nav-/.test(s)) return "icon";
  if (fmt === "png" && order === 1) return "hero-logo";
  return fmt === "png" ? "graphic" : "photo";
};

const manifest = [];
for (const e of entries) {
  const meta = await sharp(e.buf).metadata();
  const ext = e.fmt === "jpeg" ? "jpg" : e.fmt;
  const base = String(e.order).padStart(2, "0");
  const fileName = `${base}.${ext}`;
  const snippet = contextSnippet(e.index);
  const role = guessRole(snippet, e.order, e.fmt);
  const origPath = path.join(OUT_ORIG, fileName);
  const pubPath = path.join(OUT_PUBLIC, fileName);
  fs.writeFileSync(origPath, e.buf);
  fs.writeFileSync(pubPath, e.buf);
  manifest.push({
    order: e.order,
    file: fileName,
    format: e.fmt,
    role,
    width: meta.width,
    height: meta.height,
    bytes: e.bytes,
    kb: Number((e.bytes / 1024).toFixed(1)),
    context: snippet.slice(0, 220),
  });
  console.log(
    `#${e.order} ${fileName} ${meta.width}x${meta.height} ${(e.bytes / 1024).toFixed(1)}KB role=${role}`,
  );
}

fs.writeFileSync(MANIFEST, JSON.stringify({ generatedAt: new Date().toISOString(), count: manifest.length, images: manifest }, null, 2));
console.log("manifest", MANIFEST);
console.log(
  "totalKB",
  (manifest.reduce((a, b) => a + b.bytes, 0) / 1024).toFixed(1),
);
