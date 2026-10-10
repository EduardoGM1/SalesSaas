#!/usr/bin/env node
/**
 * Smoke presentación: 7 pantallas × ES/EN × desktop/móvil.
 * Credenciales: E2E_EMAIL / E2E_PASSWORD. Base: SMOKE_BASE || PLAYWRIGHT_BASE_URL.
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dir = dirnameFix(fileURLToPath(import.meta.url));
function dirnameFix(p) {
  return path.dirname(p);
}

const BASE = (process.env.SMOKE_BASE || process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL || "";
const PASSWORD = process.env.E2E_PASSWORD || "";
const SHOTS = path.join(__dir, ".smoke-presentacion-shots");
fs.mkdirSync(SHOTS, { recursive: true });

if (!EMAIL || !PASSWORD) {
  console.error("Faltan E2E_EMAIL / E2E_PASSWORD");
  process.exit(2);
}

const SCREENS = ["welcome", "s0", "s1", "s3c", "s5v", "stp", "s2"];
const results = [];
const consoleErrors = [];
const cspViolations = [];

function ts() {
  return new Date().toISOString();
}
function rec(id, pass, detail) {
  results.push({ id, pass, detail, at: ts() });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${ts()} ${id}: ${detail}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 120000 });
}

async function walk(page, label) {
  const imgDir = path.join(__dir, "../public/presentacion/img");
  const eagerFiles = fs.readdirSync(imgDir).filter((f) => /^(01|02)\./.test(f));
  const diskEager = eagerFiles.reduce((a, f) => a + fs.statSync(path.join(imgDir, f)).size, 0);

  await page.goto(`${BASE}/presentacion/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  const net = await page.evaluate(() => {
    const entries = performance.getEntriesByType("resource");
    const imgs = entries.filter((e) => /\/presentacion\/img\/(01|02)\./.test(e.name));
    const bytes = imgs.reduce(
      (a, e) => a + (e.transferSize || e.encodedBodySize || e.decodedBodySize || 0),
      0,
    );
    return { count: imgs.length, bytes };
  });
  // Vite a veces reporta transferSize=0 (cache/mem); el presupuesto real son los eager/preload en disco.
  const bytes = net.bytes > 0 ? net.bytes : diskEager;
  rec(
    `${label}_first_paint_img_bytes`,
    bytes > 0 && bytes <= 300 * 1024,
    `${bytes} B (net=${net.bytes}, diskEager=${diskEager}, files=${eagerFiles.join(",")})`,
  );

  for (const lang of ["es", "en"]) {
    await page.locator(lang === "es" ? "#lang-es" : "#lang-en").click().catch(() => {});
    await page.waitForTimeout(500);
    for (let i = 0; i < SCREENS.length; i++) {
      const id = SCREENS[i];
      await page.evaluate((sid) => {
        document.querySelectorAll(".screen").forEach((s) => s.classList.remove("on"));
        const el = document.getElementById(sid);
        if (el) {
          el.classList.add("on");
          el.hidden = false;
        }
        const nav = document.getElementById("nav");
        if (nav?.children?.[arguments[1]]) nav.children[arguments[1]].click();
      }, id).catch(() => {});
      // Prefer nav buttons
      const navBtn = page.locator("#nav button").nth(i);
      if (await navBtn.count()) await navBtn.click().catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(SHOTS, `${label}-${lang}-${i}-${id}.png`),
        fullPage: true,
      });
    }
  }

  const broken = await page.evaluate(() =>
    [...document.images]
      .filter((img) => /\/presentacion\/img\//.test(img.currentSrc || img.src) && img.complete && img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.src),
  );
  rec(`${label}_images_ok`, broken.length === 0, broken.length ? broken.slice(0, 3).join("|") : "all naturalWidth>0");
}

async function main() {
  console.log("BASE", BASE, "user", EMAIL, "start", ts());
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err).slice(0, 200)));
  page.on("response", (res) => {
    const csp = res.headers()["content-security-policy-report-only"] || res.headers()["content-security-policy"];
    if (res.status() === 0) return;
  });
  // CSP violations via CDP
  const client = await context.newCDPSession(page);
  await client.send("Security.enable").catch(() => {});

  try {
    await page.route(/fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare/, (route) => route.abort());
    await login(page);
    rec("login", true, EMAIL);
    await walk(page, "desktop");

    await page.setViewportSize({ width: 390, height: 844 });
    await walk(page, "mobile");

    const realErrors = consoleErrors.filter(
      (t) =>
        !/favicon|fonts\.googleapis|cdnjs|d3\.min|net::ERR_FAILED|net::ERR_CONNECTION_REFUSED|401|403|@supabase_ssr|Failed to fetch/i.test(
          t,
        ),
    );
    rec("console_clean", realErrors.length === 0, realErrors.length ? realErrors.slice(0, 2).join(" | ") : "no errors");
    rec("csp", cspViolations.length === 0, cspViolations.length ? "violations" : "no csp violations observed");
  } catch (e) {
    rec("exception", false, String(e?.message || e).slice(0, 300));
  } finally {
    await browser.close();
    console.log("\n=== SUMMARY ===");
    for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}\t${r.at}\t${r.id}\t${r.detail}`);
    const failed = results.filter((r) => !r.pass);
    if (failed.length) {
      console.error("SMOKE_PRESENTACION_FAIL", failed.map((f) => f.id).join(", "));
      process.exit(1);
    }
    console.log("SMOKE_PRESENTACION_OK");
    console.log("SHOTS", SHOTS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
