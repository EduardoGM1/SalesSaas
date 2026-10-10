#!/usr/bin/env node
/**
 * Reescribe el HTML fuente reemplazando data: URLs base64 por
 * /presentacion/img/NN.ext (orden de aparición = manifest).
 * Salida: apps/web/public/presentacion/index.html
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "docs/presentacion/Presentacion-Royal-Holiday.source.html");
const MANIFEST = path.join(ROOT, "docs/presentacion/img-manifest.json");
const OUT = path.join(ROOT, "apps/web/public/presentacion/index.html");

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const byOrder = new Map(manifest.images.map((img) => [img.order, img]));
let order = 0;
const html = fs.readFileSync(SRC, "utf8");
const out = html.replace(
  /data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+/gi,
  () => {
    order += 1;
    const img = byOrder.get(order);
    if (!img) throw new Error(`missing manifest entry #${order}`);
    return `/presentacion/img/${img.file}`;
  },
);
if (order !== manifest.images.length) {
  throw new Error(`replaced ${order} but manifest has ${manifest.images.length}`);
}

// Fix #7 role in manifest if needed
const images = manifest.images.map((img) => {
  if (img.order === 6) return { ...img, role: "bilingual-es" };
  if (img.order === 7) return { ...img, role: "bilingual-en" };
  return img;
});
fs.writeFileSync(MANIFEST, JSON.stringify({ ...manifest, images }, null, 2));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log("wrote", OUT, "bytes", out.length, "images", order);
