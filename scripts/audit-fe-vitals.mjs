import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE || "http://187.77.14.148";
const N = Number(process.env.AUDIT_FE_SAMPLES || "8") || 8;
const ROUTES = ["/login", "/", "/clients"];

function pct(vals, p) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return Math.round(s[idx]);
}

async function measure(page, path) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = {};
    for (const p of performance.getEntriesByType("paint")) paints[p.name] = p.startTime;
    const lcps = performance.getEntriesByType("largest-contentful-paint");
    const lcp = lcps[lcps.length - 1];
    return {
      ttfb: nav?.responseStart ?? null,
      fcp: paints["first-contentful-paint"] ?? null,
      lcp: lcp?.startTime ?? null,
      dcl: nav?.domContentLoadedEventEnd ?? null,
      load: nav?.loadEventEnd ?? null,
      transfer: nav?.transferSize ?? null,
      encoded: nav?.encodedBodySize ?? null,
    };
  });
  return { status: res?.status() ?? 0, ...m };
}

const browser = await chromium.launch();
const results = [];
for (const path of ROUTES) {
  const samples = [];
  for (let i = 0; i < N; i++) {
    const page = await browser.newPage();
    samples.push(await measure(page, path));
    await page.close();
  }
  const pick = (k) => samples.map((s) => s[k]).filter((v) => typeof v === "number");
  results.push({
    path,
    n: samples.length,
    status: samples[0]?.status,
    ttfb: { p50: pct(pick("ttfb"), 50), p95: pct(pick("ttfb"), 95) },
    fcp: { p50: pct(pick("fcp"), 50), p95: pct(pick("fcp"), 95) },
    lcp: { p50: pct(pick("lcp"), 50), p95: pct(pick("lcp"), 95) },
    dcl: { p50: pct(pick("dcl"), 50), p95: pct(pick("dcl"), 95) },
    load: { p50: pct(pick("load"), 50), p95: pct(pick("load"), 95) },
  });
  console.log(JSON.stringify(results[results.length - 1]));
}
await browser.close();
