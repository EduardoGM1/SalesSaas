#!/usr/bin/env node
/**
 * Diagnóstico del timeout magic-link + click-through OPC a–f en prod.
 * Login real del flujo a–f: formulario email/password (no magic link).
 */
import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://187.77.14.148").replace(/\/$/, "");
const SHOTS = process.env.QA_OPC_E2E_SHOTS || resolve(__dir, ".qa-opc-e2e-shots");
const RESULTS = resolve(__dir, ".qa-opc-e2e-results.json");
const EMAIL = process.env.QA_OPC_E2E_EMAIL;
const PASSWORD = process.env.QA_OPC_E2E_PASSWORD;
const PROSPECT = process.env.QA_OPC_E2E_PROSPECT || "Qaopc E2e";

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function rec(out, key, ok, detail) {
  out[key] = { pass: !!ok, detail };
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${key}: ${detail}`);
}

async function dumpPage(page, label) {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 800);
  const login = await page.locator('input[name="email"]').count();
  const pm = await page.locator('[data-testid="rh-pm-page"]').count();
  const loading = body.includes("Cargando sesión") || body.includes("Cargando");
  return { label, url, title, loginForm: login > 0, rhPmPage: pm > 0, loading, body };
}

async function diagnoseMagicLink(browser) {
  const report = { cause: null, snapshots: [] };
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  if (error) {
    report.cause = `generateLink: ${error.message}`;
    return report;
  }
  const link = data?.properties?.action_link || "";
  let parsed = {};
  try {
    const u = new URL(link);
    parsed = {
      host: u.host,
      pathname: u.pathname,
      hasToken: u.searchParams.has("token") || u.searchParams.has("token_hash"),
      type: u.searchParams.get("type"),
      redirect_to: u.searchParams.get("redirect_to"),
    };
  } catch {
    parsed = { rawPrefix: link.slice(0, 160) };
  }
  report.actionLink = parsed;

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const jumped = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) jumped.push(frame.url());
  });
  try {
    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(8000);
    const snap = await dumpPage(page, "after-magic-8s");
    snap.navigations = jumped.slice(0, 12);
    report.snapshots.push(snap);
    await page.screenshot({ path: `${SHOTS}/diag-magic-link.png`, fullPage: true });

    // Mismo error que el test viejo: ir a Premanifiesto sin confirmar sesión.
    await page.goto(`${BASE}/ops/rh/premanifiesto`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);
    const snap2 = await dumpPage(page, "premanifiesto-after-magic");
    report.snapshots.push(snap2);
    await page.screenshot({ path: `${SHOTS}/diag-pm-after-magic.png`, fullPage: true });

    if (snap.loginForm || snap2.loginForm) {
      report.cause = "test/entorno: el action_link no deja sesión en la SPA; ProtectedRoute muestra /login y rh-pm-page nunca monta. El waitForURL(/auth/) se tragaba el fallo.";
    } else if (snap2.rhPmPage) {
      report.cause = "el magic link SÍ estableció sesión; el timeout anterior no se reproduce (posible flake de flags/red).";
    } else if (snap2.body.includes("No tienes acceso")) {
      report.cause = "página: sesión ok pero canRead=false (flags OPC).";
    } else if (snap2.url.includes("/tools")) {
      report.cause = "página: RhToolFlagGate redirigió a /tools (falta worksheet.royal_holiday).";
    } else if (snap2.loading) {
      report.cause = "página: se queda en estado de carga (sesión/flags no resuelven).";
    } else {
      report.cause = `indeterminado tras magic link. url=${snap2.url}`;
    }
  } catch (err) {
    report.cause = `excepción al visitar action_link: ${err.message}`;
    report.snapshots.push({ label: "error", url: page.url(), body: String(err) });
    await page.screenshot({ path: `${SHOTS}/diag-magic-error.png`, fullPage: true }).catch(() => {});
  } finally {
    await ctx.close();
  }
  return report;
}

async function passwordLogin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 30000 });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('form').locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 45000 });
  await page.waitForTimeout(1500);
}

function parseCupo(text) {
  const m = String(text || "").match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { ocupado: Number(m[1]), max: Number(m[2]), raw: m[0] };
}

async function sidebarHrefs(page) {
  return page.locator(".sb-nav a.sb-item").evaluateAll((els) =>
    els.map((el) => el.getAttribute("href")),
  );
}

async function sessionDebug(page) {
  return page.evaluate(async () => {
    const res = await fetch("/api/v1/auth/session", { credentials: "include" });
    const json = await res.json().catch(() => ({}));
    const ws = json.workspace_activo || {};
    return {
      status: res.status,
      tipo: ws.tipo,
      role_slug: ws.role_slug,
      empresa_id: ws.empresa_id,
      opcFlag: json.flags?.["rh.tool.premanifiesto.opc"],
      rhFlag: json.flags?.["worksheet.royal_holiday"],
    };
  }).catch((err) => ({ error: String(err) }));
}

async function findCupoLibre(page) {
  const cupo = page.locator('[data-testid="rh-pm-cupo-libre"]');
  if (await cupo.count()) return cupo.first();
  await page.getByRole("button", { name: "Calendario", exact: true }).click().catch(() => {});
  await page.locator(".cal-widget .cal-grid").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  const days = page.locator(".cal-widget .cal-grid button.cal-day");
  const n = await days.count();
  for (let i = 0; i < n; i += 1) {
    await days.nth(i).click();
    await page.locator(".rh-pm-day-panel").waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(600);
    if (await page.locator('[data-testid="rh-pm-cupo-libre"]').count()) {
      return page.locator('[data-testid="rh-pm-cupo-libre"]').first();
    }
  }
  return null;
}

async function runFlow(browser, out) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    await passwordLogin(page);
    await page.screenshot({ path: `${SHOTS}/a-after-login.png`, fullPage: true });

    const compactLink = page.locator('.sb-nav a.sb-item[href="/ops/rh/premanifiesto"]');
    try {
      await compactLink.waitFor({ state: "visible", timeout: 25000 });
    } catch {
      const hrefsEarly = await sidebarHrefs(page);
      rec(out, "a.sidebar", false, `compact no apareció. hrefs=${JSON.stringify(hrefsEarly)} session=${JSON.stringify(await sessionDebug(page))}`);
      await page.screenshot({ path: `${SHOTS}/a-sidebar.png`, fullPage: true });
      return;
    }
    const hrefs = await sidebarHrefs(page);
    rec(
      out,
      "a.sidebar",
      hrefs.length === 3 && hrefs.includes("/ops/rh/premanifiesto") && hrefs.includes("/clients") && hrefs.includes("/metas") && !hrefs.includes("/tools"),
      `hrefs=${JSON.stringify(hrefs)} session=${JSON.stringify(await sessionDebug(page))}`,
    );
    await page.screenshot({ path: `${SHOTS}/a-sidebar.png` });

    await compactLink.click();
    try {
      await page.waitForSelector('[data-testid="rh-pm-page"]', { timeout: 45000 });
      rec(out, "b.premanifiesto", true, `url=${page.url()}`);
    } catch {
      const snap = await dumpPage(page, "pm-timeout");
      rec(out, "b.premanifiesto", false, `no rh-pm-page: ${JSON.stringify(snap)}`);
      await page.screenshot({ path: `${SHOTS}/b-pm-fail.png`, fullPage: true });
      return;
    }

    await page.locator(".rh-pm-day-panel").waitFor({ state: "visible", timeout: 30000 });
    await page.getByText("Cargando olas").waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
    const cupoBtn = await findCupoLibre(page);
    const olasVisible = await page.locator(".rh-pm-ola-group").count();
    rec(out, "b.olas", olasVisible > 0 && !!cupoBtn, `olas=${olasVisible} cupoLibre=${cupoBtn ? 1 : 0}`);
    await page.screenshot({ path: `${SHOTS}/b-olas.png`, fullPage: true });
    if (!cupoBtn) return;

    const beforeText = (await cupoBtn.innerText()).trim();
    const before = parseCupo(beforeText);
    const olaHead = cupoBtn.locator("xpath=ancestor::*[contains(@class,'rh-pm-ola-head')]");
    const olaName = ((await olaHead.locator(".dg-name").textContent()) || "").trim();
    await cupoBtn.click();
    await page.waitForURL(/\/clients\/opc-nuevo/, { timeout: 20000 });
    const url = new URL(page.url());
    const precarga = url.searchParams.get("ola") && url.searchParams.get("fecha") && url.searchParams.get("hora");
    rec(out, "c.opc-nuevo", precarga, page.url());
    await page.screenshot({ path: `${SHOTS}/c-opc-nuevo.png`, fullPage: true });

    await page.locator('[data-testid="opc-expediente-tabs"]').waitFor({ state: "visible", timeout: 20000 });
    await page.getByRole("button", { name: "Información cliente" }).click();
    const rows = page.locator(".opc-int-row");
    await rows.nth(1).locator("input").nth(0).fill("Qaopc");
    await rows.nth(1).locator("input").nth(1).fill("E2e");
    await rows.nth(2).locator("input").nth(0).fill("Qamujer");
    await rows.nth(2).locator("input").nth(1).fill("E2e");
    await page.getByRole("button", { name: "Estancia" }).click();
    await page.locator('.frow:has(.flabel:text("Agencia")) input').fill("QA Agencia");
    await page.getByRole("button", { name: "Invitación" }).click();
    const fechaVal = await page.locator('input[type="date"]').inputValue();
    const horaVal = await page.locator('input[type="time"]').inputValue();
    rec(
      out,
      "d.tabs",
      Boolean(fechaVal && horaVal),
      `fecha=${fechaVal} hora=${horaVal} olaName=${olaName}`,
    );
    await page.screenshot({ path: `${SHOTS}/d-invitacion.png`, fullPage: true });

    await page.getByRole("button", { name: "Confirmar invitación" }).click();
    const navP = page.waitForURL(/\/clients\/(?!opc-nuevo)[^/]+/, { timeout: 45000 }).then(() => "nav");
    const toastP = page.locator(".toast-item, .toast-card-title").first()
      .waitFor({ state: "visible", timeout: 45000 })
      .then(() => "toast");
    const winner = await Promise.race([navP, toastP]).catch(() => "timeout");
    const toastText = ((await page.locator(".toast-item, .toast-card-title").first().textContent().catch(() => "")) || "").trim();
    if (winner !== "nav") {
      await page.waitForURL(/\/clients\/(?!opc-nuevo)[^/]+/, { timeout: 15000 }).catch(() => {});
    }
    const landed = /\/clients\/[0-9a-f-]{8,}/i.test(page.url()) && !page.url().includes("opc-nuevo");
    rec(out, "e.confirm-nav", landed, `winner=${winner} url=${page.url()} toast=${toastText}`);
    if (!landed) {
      await page.screenshot({ path: `${SHOTS}/e-confirm-fail.png`, fullPage: true });
      return;
    }

    await page.locator('.sb-nav a.sb-item[href="/ops/rh/premanifiesto"]').click();
    await page.waitForSelector('[data-testid="rh-pm-page"]', { timeout: 30000 });
    const bookedFecha = url.searchParams.get("fecha");
    if (bookedFecha) {
      const dayNum = Number(bookedFecha.slice(8, 10));
      await page.getByRole("button", { name: "Calendario", exact: true }).click().catch(() => {});
      await page.locator(".cal-widget .cal-grid").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      await page.locator(".cal-widget .cal-grid button.cal-day .cal-dn", { hasText: new RegExp(`^${dayNum}$`) }).first().click();
    }
    await page.getByText("Cargando olas").waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
    await page.locator(".rh-pm-ola-group").first().waitFor({ state: "visible", timeout: 30000 });
    const afterPills = page.locator(".rh-pm-cupo-pill");
    const nPills = await afterPills.count();
    let afterMatch = null;
    for (let i = 0; i < nPills; i += 1) {
      const head = afterPills.nth(i).locator("xpath=ancestor::*[contains(@class,'rh-pm-ola-head')]");
      const name = ((await head.locator(".dg-name").textContent()) || "").trim();
      if (name === olaName) {
        afterMatch = parseCupo(await afterPills.nth(i).innerText());
        break;
      }
    }
    const bumped = afterMatch && before && afterMatch.ocupado === before.ocupado + 1;
    rec(
      out,
      "e.cupo-spa",
      bumped,
      `ola=${olaName} before=${before?.raw} after=${afterMatch?.raw} (sin location.reload)`,
    );
    await page.screenshot({ path: `${SHOTS}/e-cupo-spa.png`, fullPage: true });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="rh-pm-page"]', { timeout: 45000 });
    if (bookedFecha) {
      const dayNum = Number(bookedFecha.slice(8, 10));
      await page.getByRole("button", { name: "Calendario", exact: true }).click().catch(() => {});
      await page.locator(".cal-widget .cal-grid").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      await page.locator(".cal-widget .cal-grid button.cal-day .cal-dn", { hasText: new RegExp(`^${dayNum}$`) }).first().click();
    }
    await page.getByText("Cargando olas").waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
    await page.locator(".rh-pm-ola-group").first().waitFor({ state: "visible", timeout: 30000 });
    const persistPills = page.locator(".rh-pm-cupo-pill");
    const nPersist = await persistPills.count();
    let persistMatch = null;
    for (let i = 0; i < nPersist; i += 1) {
      const head = persistPills.nth(i).locator("xpath=ancestor::*[contains(@class,'rh-pm-ola-head')]");
      const name = ((await head.locator(".dg-name").textContent()) || "").trim();
      if (name === olaName) {
        persistMatch = parseCupo(await persistPills.nth(i).innerText());
        break;
      }
    }
    rec(
      out,
      "f.cupo-reload",
      persistMatch && before && persistMatch.ocupado === before.ocupado + 1,
      `ola=${olaName} persist=${persistMatch?.raw} expected=${before ? before.ocupado + 1 : "?"}/${before?.max}`,
    );
    await page.screenshot({ path: `${SHOTS}/f-cupo-reload.png`, fullPage: true });
  } finally {
    await ctx.close();
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("Faltan QA_OPC_E2E_EMAIL / QA_OPC_E2E_PASSWORD");
    process.exit(1);
  }
  mkdirSync(SHOTS, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    prospect: PROSPECT,
    magicLink: null,
    flow: {},
  };
  const browser = await chromium.launch({ headless: true });
  try {
    console.log("=== DIAGNÓSTICO magic link (reproducción del timeout) ===");
    report.magicLink = await diagnoseMagicLink(browser);
    console.log("causa:", report.magicLink.cause);

    console.log("=== FLUJO a–f (login password) ===");
    try {
      await runFlow(browser, report.flow);
    } catch (err) {
      rec(report.flow, "flow.exception", false, err.stack || String(err));
    }
  } finally {
    await browser.close();
  }
  report.finishedAt = new Date().toISOString();
  const needed = ["a.sidebar", "b.premanifiesto", "b.olas", "c.opc-nuevo", "d.tabs", "e.confirm-nav", "e.cupo-spa", "f.cupo-reload"];
  const flowPass = needed.every((k) => report.flow[k]?.pass === true);
  report.pass = flowPass;
  writeFileSync(RESULTS, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${RESULTS} pass=${report.pass}`);
  process.exit(flowPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
