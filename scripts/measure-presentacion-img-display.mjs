#!/usr/bin/env node
/**
 * Mide tamaño renderizado (CSS px) de cada imagen en desktop/móvil × ES/EN.
 * Inyecta también las URLs que solo viven en constantes JS (BRIMG, PCPH, …).
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "apps/web/public");
const OUT = path.join(ROOT, "docs/presentacion/display-sizes.json");
const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(ROOT, "docs/presentacion/img-manifest.json"), "utf8"),
);

function startStaticServer(rootDir, port) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".avif": "image/avif",
  };
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let rel = urlPath === "/" ? "/presentacion/index.html" : urlPath;
    let filePath = path.join(rootDir, rel);
    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403);
      return res.end();
    }
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
    } catch { /* */ }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("not found");
      }
      res.writeHead(200, {
        "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

/** Estilos CSS reales para forzar tamaño de pantalla al medir. */
const STYLE_BY_FILE = {
  // Test drive grid cells
  "09.jpg": "tc",
  "10.jpg": "tc",
  "11.jpg": "tc",
  "12.jpg": "tc",
  "13.jpg": "tc",
  "14.jpg": "tc",
  "15.jpg": "tc",
  "16.jpg": "tc",
  "17.jpg": "tc",
  // BRIMG icons
  "18.png": "bicon",
  "19.png": "bicon",
  "20.png": "bicon",
  "21.png": "bicon",
  "22.png": "bicon",
  "23.png": "bicon",
  "24.png": "bicon",
  // logos branch
  "25.png": "lg-cr",
  "26.png": "lg-gpr",
  "27.png": "lg-acc",
  // floating / dest photos
  "28.jpg": "cphoto",
  "29.jpg": "cphoto",
  "30.jpg": "cphoto",
  "31.jpg": "cphoto",
  "32.jpg": "eph",
  "33.jpg": "eph",
  "34.jpg": "tdx-room",
  "35.jpg": "tdx-img",
};

async function measureViewport(browser, base, viewport, lang) {
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.route(/fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare/, (route) => route.abort());
  await page.goto(`${base}/presentacion/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(500);

  await page.evaluate(({ langCode, styleByFile }) => {
    document.documentElement.lang = langCode;
    document.documentElement.style.setProperty("color-scheme", "dark");

    // Layout helpers matching presentation CSS
    const css = document.createElement("style");
    css.textContent = `
      #measure-root{position:fixed;inset:0;overflow:auto;background:#0B1E27;z-index:9999;padding:24px;display:grid;gap:16px}
      #measure-root .tc{position:relative;width:calc((100vw - 80px)/3);height:calc((100vh - 160px)/3);min-height:120px;overflow:hidden}
      #measure-root .tc img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      #measure-root .bicon img{height:clamp(16px,2.6vh,22px);width:clamp(24px,3.6vh,32px);object-fit:contain}
      #measure-root .lg-cr img{height:clamp(9px,1.5vh,12px);width:auto}
      #measure-root .lg-gpr img{height:clamp(50px,8vh,70px);width:auto}
      #measure-root .lg-acc img{height:clamp(36px,5.8vh,52px);width:auto}
      #measure-root .cphoto img{width:min(42vw,360px);aspect-ratio:3/2;object-fit:cover;display:block}
      #measure-root .eph img{width:min(28vw,280px);aspect-ratio:7/10;object-fit:cover;display:block}
      #measure-root .tdx-room img{width:min(40vw,320px);aspect-ratio:7/10;object-fit:cover;display:block}
      #measure-root .tdx-img img{width:min(46vw,600px);aspect-ratio:1100/774;object-fit:cover;display:block}
      #measure-root .pic img{width:min(54vw,824px);aspect-ratio:5/4;max-height:calc(100vh - 270px);object-fit:cover;display:block}
      #measure-root .coin img{width:min(40vw,500px);aspect-ratio:1408/768;object-fit:cover;display:block}
      #measure-root .affil img{height:clamp(20px,2.3vw,28px);width:auto}
      #measure-root .welcome img{width:min(40vw,320px);height:auto}
      #measure-root .vimg-wrap img{width:min(46vw,600px);height:auto;display:block}
    `;
    document.head.appendChild(css);

    const root = document.createElement("div");
    root.id = "measure-root";
    document.body.appendChild(root);

    const html = document.documentElement.outerHTML;
    const files = [...html.matchAll(/\/presentacion\/img\/(\d{2}\.[a-z0-9]+)/gi)].map((m) => m[1]);
    const uniq = [...new Set(files)];

    const wrapClass = (file) => {
      if (styleByFile[file]) return styleByFile[file];
      if (file.startsWith("01")) return "welcome";
      if (file.startsWith("02")) return "pic";
      if (file.startsWith("03") || file.startsWith("04") || file.startsWith("05")) return "affil";
      if (file.startsWith("06") || file.startsWith("07")) return "coin";
      if (file.startsWith("08")) return "vimg-wrap";
      return "cphoto";
    };

    for (const file of uniq) {
      if (file.startsWith("06") && langCode === "en") continue;
      if (file.startsWith("07") && langCode !== "en") continue;
      const box = document.createElement("div");
      box.className = wrapClass(file);
      box.dataset.file = file;
      const img = document.createElement("img");
      img.src = `/presentacion/img/${file}`;
      img.alt = file;
      box.appendChild(img);
      root.appendChild(box);
    }
  }, { langCode: lang, styleByFile: STYLE_BY_FILE });

  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll("#measure-root img")];
    return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  }, { timeout: 30000 });

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("#measure-root [data-file]")].map((box) => {
      const img = box.querySelector("img");
      const r = img.getBoundingClientRect();
      return {
        file: box.dataset.file,
        displayW: Math.round(r.width * 100) / 100,
        displayH: Math.round(r.height * 100) / 100,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        wrap: box.className,
      };
    }),
  );
  await page.close();
  return rows;
}

async function main() {
  const port = 5199;
  const server = await startStaticServer(PUBLIC, port);
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const all = [];
    for (const [label, viewport, lang] of [
      ["desktop-es", { width: 1440, height: 900 }, "es"],
      ["desktop-en", { width: 1440, height: 900 }, "en"],
      ["mobile-es", { width: 390, height: 844 }, "es"],
      ["mobile-en", { width: 390, height: 844 }, "en"],
    ]) {
      const rows = await measureViewport(browser, base, viewport, lang);
      console.log(label, "measured", rows.length);
      all.push({ label, rows });
    }
    const byFile = new Map();
    for (const { label, rows } of all) {
      for (const r of rows) {
        const cur = byFile.get(r.file) || {
          file: r.file,
          maxDisplayW: 0,
          maxDisplayH: 0,
          samples: [],
        };
        cur.maxDisplayW = Math.max(cur.maxDisplayW, r.displayW);
        cur.maxDisplayH = Math.max(cur.maxDisplayH, r.displayH);
        cur.samples.push({ label, ...r });
        byFile.set(r.file, cur);
      }
    }
    for (const img of MANIFEST.images) {
      if (!byFile.has(img.file)) {
        byFile.set(img.file, {
          file: img.file,
          maxDisplayW: 0,
          maxDisplayH: 0,
          samples: [],
          note: "missing",
        });
      }
    }
    const images = [...byFile.values()]
      .sort((a, b) => a.file.localeCompare(b.file))
      .map((m) => ({
        ...m,
        targetMaxW: Math.max(1, Math.ceil(m.maxDisplayW * 2)),
        targetMaxH: Math.max(1, Math.ceil(m.maxDisplayH * 2)),
      }));
    fs.writeFileSync(
      OUT,
      JSON.stringify({ generatedAt: new Date().toISOString(), rule: "2× max observed CSS px", images }, null, 2),
    );
    console.log("wrote", OUT);
    console.log(
      images.map((i) => `${i.file}\t${i.maxDisplayW}x${i.maxDisplayH}\t2x=${i.targetMaxW}x${i.targetMaxH}`).join("\n"),
    );
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
