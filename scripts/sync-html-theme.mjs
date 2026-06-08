import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const htmlPath = path.resolve(root, "..", "index.html");
const cssOut = path.join(root, "src/app/html-theme.css");
const logoOut = path.join(root, "public/saletse-logo.png");

const html = fs.readFileSync(htmlPath, "utf8");
const styleStart = html.indexOf("<style>") + 7;
const styleEnd = html.indexOf("</style>");
if (styleStart < 7 || styleEnd < 0) throw new Error("No se encontró bloque <style> en index.html");

let css = html.slice(styleStart, styleEnd).trim();
css = css.replace(/body\{[^}]+\}/, "body{font-family:var(--font-sans,'Inter',sans-serif);background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden;}");
css = css.replace(/--mono:'JetBrains Mono',monospace;/, "--mono:var(--font-geist-mono,'JetBrains Mono'),monospace;");

const header = `/* Auto-synced from ${htmlPath.replace(/\\/g, "/")} */\n`;
const footer = `
/* React app aliases */
.sales-page { display: block; flex: 1; padding: 24px 28px; animation: pageIn 0.18s ease; }
.main > main { display: flex; flex-direction: column; flex: 1; min-height: 0; }
a.sb-item { text-decoration: none; color: rgba(255,255,255,0.55); }
a.sb-item:hover { color: rgba(255,255,255,0.9); }
a.sb-item.active { color: #93c5fd; }
a.tool-card { text-decoration: none; color: inherit; }
`;

fs.writeFileSync(cssOut, header + css + footer);

const marker = "data:image/png;base64,";
const start = html.indexOf(marker);
if (start < 0) throw new Error("Logo base64 no encontrado");
const end = html.indexOf('"', start + marker.length);
const b64 = html.slice(start + marker.length, end);
fs.writeFileSync(logoOut, Buffer.from(b64, "base64"));

console.log("Wrote", cssOut, css.length, "bytes CSS");
console.log("Wrote", logoOut, fs.statSync(logoOut).size, "bytes logo");
