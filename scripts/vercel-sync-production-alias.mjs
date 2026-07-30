#!/usr/bin/env node
/**
 * Sincroniza saletse.vercel.app con el último deploy de producción.
 * Vercel no actualiza aliases manuales al hacer push; ejecutar tras deploy si hace falta.
 */
import { execSync } from "node:child_process";

const ALIAS = "saletse.vercel.app";
const PROJECT = "saletse";

const list = execSync(`vercel ls ${PROJECT} --format json`, { encoding: "utf8" });
const deployments = JSON.parse(list);
const latest = deployments.find((d) => d.target === "production" && d.state === "READY")
  || deployments.find((d) => d.state === "READY");

if (!latest?.url) {
  console.error("No production deployment found");
  process.exit(1);
}

const deploymentUrl = latest.url.startsWith("http") ? latest.url : `https://${latest.url}`;
console.log(`Pointing ${ALIAS} -> ${deploymentUrl}`);
execSync(`vercel alias set ${deploymentUrl.replace(/^https:\/\//, "")} ${ALIAS}`, { stdio: "inherit" });
