/**
 * Huecos del smoke UI Agenda Tramo A:
 * Follow-up (nota de expediente tras el modal), Venta (alta + registrar venta),
 * borrar una nota, cambio de día. Semana: la agenda no tiene vista semana.
 *
 * PLAYWRIGHT_BASE_URL=http://… node scripts/architecture/smoke-agenda-ui-gaps.mjs
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
const EMAIL = `qa-agenda-gap-${stamp}@saletse-test.com`;
const PASSWORD = randomBytes(18).toString("base64url");
const CREDS = resolve(tmpdir(), `saletse-qa-agenda-gap-${stamp}.creds.json`);
const FOLLOW_NOTE = `follow-${stamp}`;
const DEL_NOTE = `borrar-${stamp}`;
const FOLIO = `F${stamp.slice(-6)}`;

writeFileSync(CREDS, JSON.stringify({ email: EMAIL, password: PASSWORD }, null, 2), { mode: 0o600 });
console.log(`Credenciales fuera del repo: ${CREDS}`);

const report = { email: EMAIL, steps: [], rows: [], jobs: [] };
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

async function createClientFromTab(page, tab, name) {
  await openTodayModal(page);
  await page.locator("#m-entry .entry-type-seg--grid .seg-btn", { hasText: tab }).click();
  await page.locator("#m-entry .route-card.primary-route").click();
  await page.locator("#nc-name").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#nc-name").fill(name);
  await page.locator("select").first().selectOption({ label: "Q" });
  await page.getByRole("button", { name: /Guardar|Save|Crear|Create/i }).first().click();
  await page.waitForURL(/\/clients\/[^/?#]+/, { timeout: 20000 });
  await page.locator(".exp-folder-strip").waitFor({ state: "visible", timeout: 20000 });
}

async function main() {
  let browser;
  const today = ymd();
  try {
    const prov = runHelper(["provision", EMAIL, PASSWORD, `QA Gap ${stamp}`]);
    step("provision QA", Boolean(prov.uid), String(prov.uid || "").slice(0, 8));
    step("rol liner", Boolean(runHelper(["grant-liner-role", EMAIL]).granted));

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1400, height: 900 });
    page.on("dialog", async (d) => { await d.accept(); });

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
    step("login", true);

    // Follow-up: el modal no escribe calendar; la fila nace al guardar la nota follow del expediente.
    await createClientFromTab(page, /Follow-up/i, `Follow${stamp.slice(-6)}`);
    await page.locator(".exp-folder-tab-title", { hasText: /^Notas$|^Notes$/ }).click();
    await page.getByRole("button", { name: /Notas del expediente|File notes/i }).click();
    await page.locator(".seg .seg-btn", { hasText: /^Follow-up$/i }).click();
    await page.locator('input[type="date"]').first().fill(today);
    await page.locator("textarea").first().fill(FOLLOW_NOTE);
    await page.getByRole("button", { name: /Guardar nota|Save note/i }).click();
    await page.waitForTimeout(800);
    step("follow-up (nota expediente tras modal)", true, FOLLOW_NOTE);

    // Venta: el modal no escribe calendar; la fila nace al registrar la venta (status venta, sin processDate).
    await createClientFromTab(page, /^Venta$|^Sale$/i, `Venta${stamp.slice(-6)}`);
    await page.locator(".exp-folder-tab-title", { hasText: /^Venta$|^Sale$/ }).click();
    await page.getByRole("button", { name: /Registrar venta|Register sale/i }).first().click();
    await page.locator(".mfield input").first().fill("1500");
    await page.getByPlaceholder(/Folio|folio|contract/i).fill(FOLIO);
    await page.getByRole("button", { name: /Guardar|Save/i }).last().click();
    await page.waitForTimeout(1200);
    step("venta (registrar tras modal, status venta)", true, FOLIO);

    // Borrar nota de usuario y confirmar que desaparece.
    await openTodayModal(page);
    await page.locator("#m-entry .seg-btn", { hasText: /Notas del usuario|User notes/i }).click();
    await page.locator("#e-nota-t").fill(DEL_NOTE);
    await page.locator("#entry-save-btn").click();
    await page.locator("#m-entry").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    await page.locator(".day-group .dg-head").filter({ hasText: /Notas|Notes/i }).first().click();
    const row = page.locator(".dg-entry").filter({ hasText: DEL_NOTE });
    await row.locator(".dg-del").click();
    await page.locator(".confirm-dialog").getByRole("button", { name: /Confirmar|Confirm/i }).click();
    await page.locator(".confirm-dialog").waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    const still = await page.locator(".day-panel").innerText();
    step("borrar nota", !still.includes(DEL_NOTE), still.includes(DEL_NOTE) ? "sigue visible" : "");

    // Cambio de día (no hay vista semana).
    const other = new Date().getDate() === 1 ? 2 : 1;
    await page.locator(".cal-grid button.cal-day").filter({
      has: page.locator(".cal-dn").filter({ hasText: new RegExp(`^${other}$`) }),
    }).first().click();
    const title = await page.locator(".dp-title, .day-panel").first().innerText();
    step("cambiar de día", title.includes(String(other)), title.slice(0, 80));
    const weekUi = await page.getByRole("button", { name: /semana|week/i }).count();
    step("vista semana (no existe en agenda)", weekUi === 0, `controles semana=${weekUi}`);

    let rows = [];
    for (let i = 0; i < 15; i += 1) {
      await page.waitForTimeout(2000);
      rows = runHelper(["calendar-rows", EMAIL]);
      if (rows.some((r) => r.type === "venta") && rows.some((r) => r.type === "follow")) break;
    }
    report.rows = rows;
    report.jobs = runHelper(["push-jobs", EMAIL]);

    const follow = rows.find((r) => r.type === "follow" && String(r.note || "").includes(FOLLOW_NOTE));
    const venta = rows.find((r) => r.type === "venta");
    const deleted = rows.some((r) => String(r.note || "").includes(DEL_NOTE));
    const followOk = Boolean(follow)
      && follow.source === "client-note"
      && !follow.kind
      && !follow.process_date;
    const ventaOk = Boolean(venta)
      && venta.source === "client"
      && !venta.kind
      && venta.status === "venta"
      && !venta.process_date;
    step("fila follow vs contrato main", followOk, JSON.stringify(follow || null));
    step("fila venta vs contrato main (sin processDate/kind)", ventaOk, JSON.stringify(venta || null));
    step("fila borrada ausente", !deleted);
    const bad = rows.filter((r) => r.kind === "procesamiento-venta");
    step("sin kind procesamiento-venta en venta normal", bad.length === 0, JSON.stringify(bad));
  } catch (err) {
    step("smoke huecos", false, err instanceof Error ? err.message : String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
    try {
      const leftover = runHelper(["purge", EMAIL]);
      report.leftover = leftover;
      step("purga a 0", Object.values(leftover).every((v) => v === 0), JSON.stringify(leftover).slice(0, 180));
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
