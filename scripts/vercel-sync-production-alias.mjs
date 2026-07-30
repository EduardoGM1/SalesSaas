#!/usr/bin/env node
/**
 * Sincroniza saletse.vercel.app con el último deploy de producción
 * y elimina aliases legacy que Vercel recrea en cada deploy.
 */
import { execSync } from "node:child_process";

const CANONICAL_ALIAS = "saletse.vercel.app";
const PROJECT = "saletse";
const LEGACY_ALIASES = [
  "sales-app-nine-gamma.vercel.app",
  "sales-app-eduardolalito99-2908s-projects.vercel.app",
  "sales-app-git-main-eduardolalito99-2908s-projects.vercel.app",
  "saletse-git-main-eduardolalito99-2908s-projects.vercel.app",
  "saletse-eduardolalito99-2908s-projects.vercel.app",
];

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

function runQuiet(cmd) {
  try {
    execSync(cmd, { stdio: "pipe", encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

const list = execSync(`vercel ls ${PROJECT} --format json`, { encoding: "utf8" });
const parsed = JSON.parse(list);
const deployments = Array.isArray(parsed) ? parsed : parsed.deployments ?? [];
const latest = deployments.find((d) => d.target === "production" && d.state === "READY")
  || deployments.find((d) => d.state === "READY");

if (!latest?.url) {
  console.error("No production deployment found");
  process.exit(1);
}

const deploymentHost = latest.url.replace(/^https?:\/\//, "");
console.log(`Pointing ${CANONICAL_ALIAS} -> ${deploymentHost}`);
run(`vercel alias set ${deploymentHost} ${CANONICAL_ALIAS}`);

for (const alias of LEGACY_ALIASES) {
  console.log(`Removing legacy alias ${alias}`);
  runQuiet(`echo y | vercel alias remove ${alias}`);
}

console.log(`Done. Use only https://${CANONICAL_ALIAS}/`);
