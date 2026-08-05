/**
 * Tras un deploy Production de `saletse`, reasigna el alias público
 * `saletse.vercel.app` al deployment más reciente (evita dominio stale).
 *
 * Uso: node scripts/promote-saletse-alias.mjs
 * Requiere: `npx vercel` autenticado y proyecto linkeado (.vercel).
 */
import { execSync } from "child_process";

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const ls = sh("npx vercel ls saletse --prod 2>&1");
const match = ls.match(/https:\/\/(saletse-[a-z0-9]+-eduardolalito99-2908s-projects\.vercel\.app)/);
if (!match) {
  console.error("No se encontró deployment Production reciente.\n", ls.slice(0, 800));
  process.exit(1);
}
const url = match[1];
console.log("Promoting", url, "→ saletse.vercel.app");
console.log(sh(`npx vercel alias set ${url} saletse.vercel.app`));
