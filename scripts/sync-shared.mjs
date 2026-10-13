/**
 * Porta el manifiesto web → packages/shared (esbuild + copia JS + fix imports).
 * No borra shared-only (push/, calculations/, sync.js, validators.js, …).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(ROOT, "scripts/architecture/sync-shared-files.json");

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const pairs = manifest.pairs || [];

const tsSources = pairs
  .map((p) => p.web)
  .filter((w) => w.endsWith(".ts") || w.endsWith(".tsx"))
  .map((w) => path.join(ROOT, w));

const jsCopies = pairs.filter((p) => p.web.endsWith(".js"));

if (tsSources.length) {
  const args = tsSources.map((f) => `"${f.replace(/\\/g, "/")}"`).join(" ");
  execSync(
    [
      "npx --yes esbuild",
      args,
      "--bundle=false",
      "--format=esm",
      "--platform=neutral",
      "--charset=utf8",
      `--outdir="${path.join(ROOT, "packages/shared/src").replace(/\\/g, "/")}"`,
      "--outbase=apps/web/src/lib",
      "--log-level=error",
    ].join(" "),
    { cwd: ROOT, stdio: "inherit" },
  );
}

for (const pair of jsCopies) {
  const src = path.join(ROOT, pair.web);
  const dest = path.join(ROOT, pair.shared);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`copied ${pair.web} → ${pair.shared}`);
}

execSync("node scripts/fix-shared-imports.mjs", { cwd: ROOT, stdio: "inherit" });
console.log("sync:shared OK");
