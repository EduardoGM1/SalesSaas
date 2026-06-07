// Rasteriza los SVG de marca a PNG para la PWA.
// Uso: node scripts/generate-icons.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");

const iconSvg = readFileSync(join(pub, "icon.svg"));
const maskableSvg = readFileSync(join(pub, "icon-maskable.svg"));

const render = (svg, size, out) =>
  sharp(svg, { density: 512 }).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(join(pub, out));

const targets = [
  [iconSvg, 192, "icon-192.png"],
  [iconSvg, 512, "icon-512.png"],
  [maskableSvg, 192, "icon-maskable-192.png"],
  [maskableSvg, 512, "icon-maskable-512.png"],
  [maskableSvg, 180, "apple-touch-icon.png"],
  [maskableSvg, 32, "favicon.png"],
];

await Promise.all(targets.map(([svg, size, out]) => render(svg, size, out)));
console.log("Iconos PNG generados:", targets.map((t) => t[2]).join(", "));
