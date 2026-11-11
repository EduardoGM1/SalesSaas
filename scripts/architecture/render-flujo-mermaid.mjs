/**
 * Extrae bloques ```mermaid``` de flujo-aplicacion.md y genera SVG con mmdc.
 * node scripts/architecture/render-flujo-mermaid.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");
const mdPath = resolve(root, "docs/arquitectura/flujo-aplicacion.md");
const outDir = resolve(root, "docs/arquitectura/flujo");
mkdirSync(outDir, { recursive: true });

const IDS = [
  "01-arranque",
  "02-contexto-workspace",
  "03-permisos",
  "04-navegacion",
  "05-clientes-expediente",
  "06-ventas-agenda-metas",
  "07-herramientas-rh",
  "08-admin-equipo-notif",
  "09-datos",
  "10-visibilidad-actual",
  "11-visibilidad-objetivo",
];

const md = readFileSync(mdPath, "utf8");
const blocks = [...md.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)].map((m) => m[1].trim());
if (blocks.length !== IDS.length) {
  console.error(`Esperaba ${IDS.length} diagramas, encontré ${blocks.length}`);
  process.exit(1);
}

const cfg = resolve(tmpdir(), "saletse-mmdc-config.json");
writeFileSync(
  cfg,
  JSON.stringify({
    theme: "dark",
    themeVariables: {
      primaryColor: "#1e293b",
      primaryTextColor: "#e2e8f0",
      primaryBorderColor: "#64748b",
      lineColor: "#94a3b8",
      secondaryColor: "#0f172a",
      tertiaryColor: "#334155",
      background: "#0b1220",
      mainBkg: "#1e293b",
      nodeBorder: "#64748b",
      clusterBkg: "#0f172a",
      titleColor: "#e2e8f0",
      edgeLabelBackground: "#0f172a",
    },
  }),
);

for (let i = 0; i < IDS.length; i++) {
  const mmd = resolve(tmpdir(), `saletse-flujo-${IDS[i]}.mmd`);
  const svg = resolve(outDir, `${IDS[i]}.svg`);
  writeFileSync(mmd, blocks[i] + "\n");
  const r = spawnSync(
    "npx",
    ["--yes", "@mermaid-js/mermaid-cli", "-i", mmd, "-o", svg, "-c", cfg, "-b", "transparent"],
    { cwd: root, encoding: "utf8", shell: true, timeout: 120000 },
  );
  if (r.status !== 0 || !existsSync(svg)) {
    console.error(r.stdout || "", r.stderr || "");
    throw new Error(`falló mmdc ${IDS[i]}`);
  }
  console.log("ok", IDS[i]);
}
console.log("listo", outDir);
