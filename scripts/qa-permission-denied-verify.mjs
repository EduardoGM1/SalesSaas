/**
 * Verificación puntual: WORKSPACE_PERMISSION_DENIED con login real (Chromium).
 * Env: PLAYWRIGHT_BASE_URL, QA_DENIED_EMAIL/PASSWORD, QA_ALLOWED_EMAIL/PASSWORD
 */
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "@playwright/test";

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://187.77.14.148").replace(/\/$/, "");
const DENIED_EMAIL = process.env.QA_DENIED_EMAIL;
const DENIED_PASSWORD = process.env.QA_DENIED_PASSWORD;
const ALLOWED_EMAIL = process.env.QA_ALLOWED_EMAIL;
const ALLOWED_PASSWORD = process.env.QA_ALLOWED_PASSWORD;
const RESULTS = process.env.QA_PERM_RESULTS || resolve(__dir, ".qa-permission-denied-results.json");
const SALE_DATE = "2026-08-30";

const report = {
  startedAt: new Date().toISOString(),
  checks: {},
  denied: {},
  allowed: {},
};

function rec(id, pass, detail) {
  report.checks[id] = { pass, detail };
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${id}: ${detail}`);
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 30000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 90000 });
  await page.waitForSelector(".cal-grid, .sidebar, .ws-rail-trigger", { timeout: 90000 });
  await page.waitForTimeout(1200);
}

async function api(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(path, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: res.status, json, text: text.slice(0, 800) };
    },
    { method, path, body },
  );
}

function rowId(resp) {
  const j = resp?.json;
  return j?.data?.id || j?.id || null;
}

async function sessionWorkspace(page) {
  const sess = await api(page, "GET", "/api/v1/auth/session");
  const ws =
    sess.json?.workspace_activo_id ||
    sess.json?.profile?.workspace_activo_id ||
    sess.json?.workspace?.id ||
    sess.json?.activeWorkspaceId ||
    null;
  return { status: sess.status, workspaceId: ws, userId: sess.json?.user?.id || sess.json?.profile?.id || null };
}

async function createProspectAndSale(page, label) {
  const prospect = await api(page, "POST", "/api/v1/prospects", {
    name: label,
    name1: label,
    status: "activo",
  });
  const prospectId = rowId(prospect);
  const sale = prospectId
    ? await api(page, "POST", "/api/v1/sales", {
        prospect_id: prospectId,
        sale_date: SALE_DATE,
        vol: 1,
        tours: 1,
        status: "venta",
        note: label,
      })
    : { status: 0, json: null, text: "skip: no prospect" };
  return { prospect, prospectId, sale, saleId: rowId(sale) };
}

async function main() {
  if (!DENIED_EMAIL || !DENIED_PASSWORD || !ALLOWED_EMAIL || !ALLOWED_PASSWORD) {
    throw new Error("Faltan credenciales QA_DENIED_* / QA_ALLOWED_*");
  }

  const browser = await chromium.launch({ headless: true });
  let failed = false;
  try {
    const deniedCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
    const deniedPage = await deniedCtx.newPage();
    await login(deniedPage, DENIED_EMAIL, DENIED_PASSWORD);
    const deniedSess = await sessionWorkspace(deniedPage);
    const createdDenied = await createProspectAndSale(deniedPage, "QA perm-denied verify");
    const deniedDelete = createdDenied.saleId
      ? await api(deniedPage, "DELETE", `/api/v1/sales/${createdDenied.saleId}`)
      : { status: 0, json: null, text: "skip: no sale" };

    report.denied = {
      session: deniedSess,
      prospectStatus: createdDenied.prospect.status,
      prospectId: createdDenied.prospectId,
      saleStatus: createdDenied.sale.status,
      saleId: createdDenied.saleId,
      saleBody: createdDenied.sale.json,
      deleteStatus: deniedDelete.status,
      deleteBody: deniedDelete.json,
      deleteText: deniedDelete.text,
    };

    const deniedOk =
      deniedDelete.status === 403 &&
      deniedDelete.json?.code === "WORKSPACE_PERMISSION_DENIED" &&
      deniedDelete.json?.error === "No tienes permiso para realizar esta acción.";
    rec(
      "denied_403_workspace_permission_denied",
      deniedOk,
      `DELETE /api/v1/sales/${createdDenied.saleId || "?"} → HTTP ${deniedDelete.status} body=${JSON.stringify(deniedDelete.json)}`,
    );
    rec(
      "denied_created_sale_for_write_check",
      Boolean(createdDenied.saleId) && createdDenied.sale.status >= 200 && createdDenied.sale.status < 300,
      `POST sale HTTP ${createdDenied.sale.status} id=${createdDenied.saleId || "(ninguno)"}`,
    );
    if (!deniedOk) failed = true;
    await deniedCtx.close();

    const allowedCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
    const allowedPage = await allowedCtx.newPage();
    await login(allowedPage, ALLOWED_EMAIL, ALLOWED_PASSWORD);
    const allowedSess = await sessionWorkspace(allowedPage);
    const createdAllowed = await createProspectAndSale(allowedPage, "QA perm-allowed verify");
    const allowedDelete = createdAllowed.saleId
      ? await api(allowedPage, "DELETE", `/api/v1/sales/${createdAllowed.saleId}`)
      : { status: 0, json: null, text: "skip: no sale" };

    report.allowed = {
      session: allowedSess,
      prospectStatus: createdAllowed.prospect.status,
      prospectId: createdAllowed.prospectId,
      saleStatus: createdAllowed.sale.status,
      saleId: createdAllowed.saleId,
      deleteStatus: allowedDelete.status,
      deleteBody: allowedDelete.json,
      deleteText: allowedDelete.text,
    };

    const allowedOk = allowedDelete.status === 200 && allowedDelete.json?.ok === true;
    rec(
      "allowed_delete_ok",
      allowedOk,
      `DELETE /api/v1/sales/${createdAllowed.saleId || "?"} → HTTP ${allowedDelete.status} body=${JSON.stringify(allowedDelete.json)}`,
    );
    if (!allowedOk) failed = true;
    await allowedCtx.close();
  } finally {
    report.finishedAt = new Date().toISOString();
    report.failed = failed;
    writeFileSync(RESULTS, JSON.stringify(report, null, 2), "utf8");
    await browser.close();
  }

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
