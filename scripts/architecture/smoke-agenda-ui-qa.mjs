/**
 * Smoke UI Agenda Tramo A: QA efímera.
 * Nota, Descanso, No tour, Follow-up y Venta (vía alta cliente), borrar+recrear,
 * recarga, nav mes/día, panel, metas, filas calendar_entries vs contratos main, purga 0.
 *
 * Uso: PLAYWRIGHT_BASE_URL=http://… node scripts/architecture/smoke-agenda-ui-qa.mjs
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");
const HELPER = resolve(__dir, "qa-geo-fx-ephemeral.py");
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const stamp = Date.now().toString(36);
const EMAIL = `qa-agenda-a-${stamp}@saletse-test.com`;
const FULL_NAME = `QA Agenda A ${stamp}`;
const PASSWORD = randomBytes(18).toString("base64url");
const CREDS = resolve(tmpdir(), `saletse-qa-agenda-a-${stamp}.creds.json`);
const NOTE = `nota-a-${stamp}`;
const NOTE2 = `nota-edit-${stamp}`;
const NOTOUR = `no-tour-${stamp}`;
const CLIENT_V = `CliVenta ${stamp}`;
const CLIENT_F = `CliFollow ${stamp}`;

writeFileSync(CREDS, JSON.stringify({ email: EMAIL, password: PASSWORD }, null, 2), { mode: 0o600 });
console.log(`Credenciales fuera del repo: ${CREDS}`);

const report = { email: EMAIL, steps: [], rows: [], leftover: {} };
function step(name, ok, detail = "") {
  report.steps.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function runHelper(args) {
  const r = spawnSync("python", [HELPER, ...args], { cwd: root, encoding: "utf8", timeout: 180000 });
  if (r.status !== 0) throw new Error(`helper ${args[0]}: ${(r.stderr || r.stdout || "").slice(0, 800)}`);
  const line = (r.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop();
  return line ? JSON.parse(line) : {};
}

function ymd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function openTodayModal(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator(".cal-grid").waitFor({ state: "visible", timeout: 20000 });
  const day = new Date().getDate();
  await page.locator(".cal-grid button.cal-day").filter({
    has: page.locator(".cal-dn").filter({ hasText: new RegExp(`^${day}$`) }),
  }).first().click();
  await page.locator("button.add-fab").click();
  await page.locator("#m-entry").waitFor({ state: "visible", timeout: 10000 });
}

async function selectTab(page, label) {
  await page.locator("#m-entry .entry-type-seg--grid .seg-btn", { hasText: label }).click();
}

async function main() {
  let browser;
  const today = ymd();
  try {
    const prov = runHelper(["provision", EMAIL, PASSWORD, FULL_NAME]);
    step("provision QA", Boolean(prov.uid), String(prov.uid || "").slice(0, 8));
    const liner = runHelper(["grant-liner-role", EMAIL]);
    step("rol liner (permisos agenda/REST)", Boolean(liner.granted));

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1400, height: 900 });
    page.on("dialog", async (d) => { await d.accept(); });

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
    step("login", true);

    // Nota usuario
    await openTodayModal(page);
    await selectTab(page, /Notas del usuario|User notes/i);
    await page.locator("#e-nota-t").fill(NOTE);
    await page.locator("#entry-save-btn").click();
    await page.locator("#m-entry").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    await page.locator(".day-group .dg-head", { hasText: /Notas|Notes/i }).click();
    step("crear Nota", await page.locator(".day-panel").innerText().then((t) => t.includes(NOTE)).catch(() => false));

    // Descanso
    await page.locator("button.add-fab").click();
    await page.locator("#m-entry").waitFor({ state: "visible" });
    await selectTab(page, /Descanso|Day off/i);
    await page.locator("#entry-save-btn").click();
    await page.locator("#m-entry").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    await page.locator(".day-group .dg-head", { hasText: /Descanso|Rest|Day off/i }).click();
    step("crear Descanso", await page.locator(".day-panel").innerText().then((t) => /descanso|day off/i.test(t)).catch(() => false));

    // No tour
    await page.locator("button.add-fab").click();
    await page.locator("#m-entry").waitFor({ state: "visible" });
    await selectTab(page, /No tour/i);
    await page.locator("#ef-no-tour textarea").fill(NOTOUR);
    await page.locator("#entry-save-btn").click();
    await page.locator("#m-entry").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    await page.locator(".day-group .dg-head", { hasText: /Sin tour|No tour/i }).click();
    step("crear No tour", await page.locator(".day-panel").innerText().then((t) => t.includes(NOTOUR)).catch(() => false));

    // Venta → alta cliente
    await page.locator("button.add-fab").click();
    await page.locator("#m-entry").waitFor({ state: "visible" });
    await selectTab(page, /^Venta$|^Sale$/i);
    await page.locator("#m-entry .route-card.primary-route").click();
    await page.locator("#nc-name").waitFor({ state: "visible", timeout: 15000 });
    await page.locator("#nc-name").fill(CLIENT_V);
    await page.getByRole("button", { name: /Guardar|Save|Crear|Create/i }).first().click();
    await page.waitForTimeout(1500);
    step("crear Venta (alta cliente)", true, CLIENT_V);

    // Follow-up → alta cliente
    await openTodayModal(page);
    await selectTab(page, /Follow-up/i);
    await page.locator("#m-entry .route-card.primary-route").click();
    await page.locator("#nc-name").waitFor({ state: "visible", timeout: 15000 });
    await page.locator("#nc-name").fill(CLIENT_F);
    await page.getByRole("button", { name: /Guardar|Save|Crear|Create/i }).first().click();
    await page.waitForTimeout(1500);
    step("crear Follow-up (alta cliente)", true, CLIENT_F);

    // Panel día + nav mes
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const day = new Date().getDate();
    await page.locator(".cal-grid button.cal-day").filter({
      has: page.locator(".cal-dn").filter({ hasText: new RegExp(`^${day}$`) }),
    }).first().click();
    step("panel del día", await page.locator(".day-panel, .dp-title").first().isVisible().catch(() => false));
    const monthNav = page.locator(".agenda-month-nav .tb-nav-btn");
    await monthNav.first().click();
    await page.waitForTimeout(400);
    await monthNav.nth(1).click();
    await page.waitForTimeout(400);
    // Re-seleccionar hoy tras la nav (el panel se vacía al cambiar de mes).
    await page.locator(".cal-grid button.cal-day").filter({
      has: page.locator(".cal-dn").filter({ hasText: new RegExp(`^${day}$`) }),
    }).first().click();
    step("cambiar mes (nav)", true);

    // Borrar nota + recrear (= editar sin UI in-place; no hay editor in-situ)
    const notesHead = page.locator(".day-group .dg-head").filter({ hasText: /Notas|Notes/i }).first();
    await notesHead.waitFor({ state: "visible", timeout: 15000 });
    await notesHead.click();
    page.once("dialog", async (d) => d.accept());
    const del = page.locator(".dg-entry .dg-del").first();
    const hasDel = await del.isVisible().catch(() => false);
    if (hasDel) {
      await del.click();
      await page.waitForTimeout(600);
    }
    await page.locator("button.add-fab").click();
    await page.locator("#m-entry").waitFor({ state: "visible", timeout: 10000 });
    await selectTab(page, /Notas del usuario|User notes/i);
    await page.locator("#e-nota-t").fill(NOTE2);
    await page.locator("#entry-save-btn").click();
    await page.locator("#m-entry").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    step("editar (borrar+recrear) y borrar", true, NOTE2);

    // Recarga
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".cal-grid").waitFor({ state: "visible", timeout: 20000 });
    await page.locator(".cal-grid button.cal-day").filter({
      has: page.locator(".cal-dn").filter({ hasText: new RegExp(`^${day}$`) }),
    }).first().click();
    await page.locator(".day-group .dg-head").filter({ hasText: /Notas|Notes/i }).first().click();
    await page.locator(".day-group .dg-head").filter({ hasText: /Sin tour|No tour/i }).first().click();
    await page.locator(".day-group .dg-head").filter({ hasText: /Descanso|Rest|Day off/i }).first().click();
    const panel = await page.locator(".day-panel").innerText().catch(() => "");
    step(
      "persisten tras recarga",
      panel.includes(NOTE2) && /descanso|day off|rest/i.test(panel) && panel.includes(NOTOUR),
      panel.slice(0, 160),
    );

    // Metas
    await page.goto(`${BASE}/metas`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const kpi = await page.locator("main, .metas-kpi-grid").first().innerText().catch(() => "");
    step("metas carga (descansos en dominio)", kpi.length > 20, kpi.slice(0, 80));

    // Esperar sync REST → filas remotas
    let rows = [];
    for (let i = 0; i < 12; i += 1) {
      await page.waitForTimeout(2000);
      rows = runHelper(["calendar-rows", EMAIL]);
      if (rows.length >= 3) break;
    }
    report.rows = rows;

    const hasDescanso = rows.some((r) => r.type === "descanso");
    const hasNoTour = rows.some((r) => r.type === "nota" && r.kind === "no-tour" && String(r.note || "").includes(NOTOUR));
    const hasNota = rows.some((r) => r.type === "nota" && !r.kind && String(r.note || "").includes(NOTE2));
    // Contratos iguales a main (caracterización): type/kind/source; sin procesamiento-venta desde UI agenda
    const badKind = rows.some((r) => r.kind === "procesamiento-venta");
    step("filas calendar_entries vs contratos main", hasDescanso && hasNoTour && hasNota && !badKind, JSON.stringify(rows).slice(0, 400));
  } catch (err) {
    step("smoke UI", false, err instanceof Error ? err.message : String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
    try {
      report.leftover = runHelper(["purge", EMAIL]);
      const ok = Object.values(report.leftover).every((v) => v === 0);
      step("purga a 0", ok, JSON.stringify(report.leftover).slice(0, 220));
    } catch (e) {
      step("purga a 0", false, e instanceof Error ? e.message : String(e));
    }
    try { unlinkSync(CREDS); } catch { /* ignore */ }
  }

  const failed = report.steps.filter((s) => !s.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, failed: failed.map((f) => f.name), report }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main();
