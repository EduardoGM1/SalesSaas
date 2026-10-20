/**
 * Smoke QA del Tramo B de ventas (lógica pura, sin cambiar la escritura).
 * Alta desde el expediente, historial, detalle, metas, cancelación.
 * Compara filas de sales y calendar_entries con el contrato de main.
 *
 * PLAYWRIGHT_BASE_URL=http://localhost:5173 node scripts/architecture/smoke-ventas-b-qa.mjs
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
const EMAIL = `qa-ventas-b-${stamp}@saletse-test.com`;
const PASSWORD = randomBytes(18).toString("base64url");
const CREDS = resolve(tmpdir(), `saletse-qa-ventas-b-${stamp}.creds.json`);
const FOLIO = `VB${stamp.slice(-6)}`;

writeFileSync(CREDS, JSON.stringify({ email: EMAIL, password: PASSWORD }, null, 2), { mode: 0o600 });
console.log(`Credenciales fuera del repo: ${CREDS}`);

const report = { email: EMAIL, steps: [], sales: [], calendar: [] };
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

async function pollRows() {
  let sales = [];
  let calendar = [];
  for (let i = 0; i < 15; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    sales = runHelper(["sales-rows", EMAIL]);
    calendar = runHelper(["calendar-rows", EMAIL]);
    if (sales.length && calendar.some((row) => row.type === "venta")) break;
  }
  return { sales, calendar };
}

async function main() {
  let browser;
  try {
    const prov = runHelper(["provision", EMAIL, PASSWORD, `QA Ventas B ${stamp}`]);
    step("provision QA", Boolean(prov.uid));
    step("rol liner", Boolean(runHelper(["grant-liner-role", EMAIL]).granted));

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1400, height: 900 });

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
    step("login", true);

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.locator(".cal-grid").waitFor({ state: "visible", timeout: 20000 });
    const day = new Date().getDate();
    await page.locator(".cal-grid button.cal-day").filter({
      has: page.locator(".cal-dn").filter({ hasText: new RegExp(`^${day}$`) }),
    }).first().click();
    await page.locator("button.add-fab").click();
    await page.locator("#m-entry").waitFor({ state: "visible", timeout: 10000 });
    await page.locator("#m-entry .entry-type-seg--grid .seg-btn", { hasText: /^Venta$|^Sale$/i }).click();
    await page.locator("#m-entry .route-card.primary-route").click();
    await page.locator("#nc-name").waitFor({ state: "visible", timeout: 15000 });
    await page.locator("#nc-name").fill(`VentaB${stamp.slice(-6)}`);
    await page.locator("select").first().selectOption({ label: "Q" });
    await page.getByRole("button", { name: /Guardar|Save|Crear|Create/i }).first().click();
    await page.waitForURL(/\/clients\/[^/?#]+/, { timeout: 20000 });
    await page.locator(".exp-folder-strip").waitFor({ state: "visible", timeout: 20000 });
    await page.locator(".exp-folder-tab-title", { hasText: /^Venta$|^Sale$/ }).click();
    await page.getByRole("button", { name: /Registrar venta|Register sale/i }).first().click();
    await page.locator(".mfield input").first().fill("1500");
    await page.getByPlaceholder(/Folio|folio|contract/i).fill(FOLIO);
    await page.getByRole("button", { name: /Guardar|Save/i }).last().click();
    await page.waitForTimeout(1200);
    step("registrar venta desde expediente", true, FOLIO);
    const clientUrl = page.url();

    await page.goto(`${BASE}/sales`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    const onHistory = page.url().includes("/sales");
    const historyText = await page.locator("body").innerText();
    step("historial /sales", onHistory && historyText.includes(FOLIO), onHistory ? "folio visible" : page.url());
    if (onHistory && historyText.includes(FOLIO)) {
      const view = page.getByRole("button", { name: /Ver venta|View sale/i });
      if (await view.count()) {
        await view.first().click();
        await page.locator("#m-entry, .sales-modal, [role='dialog']").first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
        const detail = await page.locator("body").innerText();
        step("detalle de venta", detail.includes(FOLIO));
        await page.keyboard.press("Escape");
      } else {
        step("detalle de venta", false, "sin botón de detalle");
      }
    } else {
      step("detalle de venta", false, "historial no mostró la venta");
    }

    await page.goto(`${BASE}/goals`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    const goalsBefore = await page.locator("body").innerText();
    const counted = /1[,.]?500|1500/.test(goalsBefore);
    step("metas cuenta la venta igual que el contrato (volumen 1500)", counted);

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.locator(".cal-grid").waitFor({ state: "visible", timeout: 20000 });
    await page.locator(".cal-grid button.cal-day").filter({
      has: page.locator(".cal-dn").filter({ hasText: new RegExp(`^${day}$`) }),
    }).first().click();
    const agendaText = await page.locator(".day-panel").innerText();
    step("agenda muestra la venta del día", agendaText.includes(FOLIO) || /venta/i.test(agendaText));

    const before = await pollRows();
    report.sales = before.sales;
    report.calendar = before.calendar;
    const saleRow = before.sales.find((r) => r.contract === FOLIO);
    const calRow = before.calendar.find((r) => r.type === "venta");
    const saleOk = Boolean(saleRow)
      && saleRow.status === "venta"
      && !saleRow.process_date
      && Number(saleRow.vol) === 1500;
    const calOk = Boolean(calRow)
      && calRow.source === "client"
      && !calRow.kind
      && calRow.status === "venta"
      && !calRow.process_date;
    step("fila sales vs main (venta, sin process_date)", saleOk, JSON.stringify(saleRow || null));
    step("fila calendar_entries vs main (t=venta, sin kind ni process_date)", calOk, JSON.stringify(calRow || null));

    await page.goto(clientUrl, { waitUntil: "domcontentloaded" });
    await page.locator(".exp-folder-strip").waitFor({ state: "visible", timeout: 20000 });
    await page.locator(".exp-folder-tab-title", { hasText: /^Venta$|^Sale$/ }).click();
    const openSale = page.getByRole("button", { name: /Abrir venta|Open sale/i });
    if (await openSale.count()) {
      await openSale.first().click();
      const status = page.locator("select").filter({ has: page.locator("option", { hasText: /Cancelada|Cancelled/i }) }).first();
      await status.selectOption({ label: "Cancelada" }).catch(async () => {
        await status.selectOption({ label: "Cancelled" });
      });
      await page.getByRole("button", { name: /Guardar|Save/i }).last().click();
      await page.waitForTimeout(1200);
      step("cancelar venta", true);
      const after = await pollRows();
      report.salesAfter = after.sales;
      report.calendarAfter = after.calendar;
      const cancelled = after.sales.find((r) => r.contract === FOLIO);
      const calAfter = after.calendar.find((r) => r.type === "venta");
      step(
        "fila sales cancelada vs main",
        Boolean(cancelled) && cancelled.status === "cancelada" && !cancelled.process_date,
        JSON.stringify(cancelled || null),
      );
      step(
        "agenda conserva t=venta cancelada sin process_date",
        Boolean(calAfter) && calAfter.status === "cancelada" && !calAfter.process_date && !calAfter.kind,
        JSON.stringify(calAfter || null),
      );
      await page.goto(`${BASE}/goals`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const goalsAfter = await page.locator("body").innerText();
      step("metas deja de contar la cancelada", !/1[,.]?500|1500/.test(goalsAfter));
    } else {
      step("cancelar venta", false, "no está el botón Abrir venta");
    }
  } catch (err) {
    step("smoke ventas B", false, err instanceof Error ? err.message : String(err));
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
  console.log(JSON.stringify({ ok: failed.length === 0, failed: failed.map((f) => f.name) }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main();
