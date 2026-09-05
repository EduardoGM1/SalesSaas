#!/usr/bin/env node
/**
 * Smoke campo-a-campo del expediente OPC (3 tabs planos).
 * Login password. No asume el E2E de navegación anterior.
 */
import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "@playwright/test";

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5177").replace(/\/$/, "");
const SHOTS = process.env.QA_OPC_FIELDS_SHOTS || resolve(__dir, ".qa-opc-fields-shots");
const RESULTS = process.env.QA_OPC_FIELDS_RESULTS || resolve(__dir, ".qa-opc-fields-results.json");
const EMAIL = process.env.QA_OPC_FIELDS_EMAIL;
const PASSWORD = process.env.QA_OPC_FIELDS_PASSWORD;
const MARK = process.env.QA_OPC_FIELDS_MARK || `QaopcF${Date.now().toString(36)}`;

export const FIXTURE = {
  pais: "México",
  pax: "2",
  estado: "Quintana Roo",
  modulo: "Módulo 4",
  idioma: "Español",
  estadoCivil: "Casados",
  hombre: { nombre: MARK, apellido: "Perez", nacionalidad: "MX", edad: "40", ocupacion: "Ingeniero" },
  mujer: { nombre: "Anaqa", apellido: "Lopez", nacionalidad: "MX", edad: "38", ocupacion: "Doctora" },
  ninos: { nombre: "Leoqa", apellido: "Perez", nacionalidad: "MX", edad: "8", ocupacion: "Estudiante" },
  notasCliente: "nota-cliente-opc",
  agencia: "Agencia QA Fields",
  nights: "3",
  roomType: "Deluxe",
  rate: "110",
  roomNumber: "1204",
  total: "330",
  notasEstancia: "nota-estancia-opc",
  calificacion: "Calif-A",
  regalo: "iPad QA",
  notasInvitacion: "nota-invitacion-opc",
};

function rec(out, key, ok, detail) {
  out[key] = { pass: !!ok, detail };
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${key}: ${detail}`);
}

async function passwordLogin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 30000 });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator("form").locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 45000 });
  await page.waitForTimeout(1500);
}

async function findCupoLibre(page) {
  const pills = page.locator(".rh-pm-cupo-pill.is-clickable, .rh-pm-cupo-pill");
  const n = await pills.count();
  for (let i = 0; i < n; i += 1) {
    const el = pills.nth(i);
    const txt = (await el.innerText()).trim();
    const m = txt.match(/(\d+)\s*\/\s*(\d+)/);
    if (m && Number(m[1]) < Number(m[2])) return el;
  }
  return null;
}

async function fillPerson(page, who, person) {
  for (const key of ["nombre", "apellido", "nacionalidad", "edad", "ocupacion"]) {
    await page.getByTestId(`opc-int-${who}-${key}`).fill(String(person[key]));
  }
}

async function runFlow(browser, out) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  try {
    await passwordLogin(page);
    const compactLink = page.locator('.sb-nav a.sb-item[href="/ops/rh/premanifiesto"]');
    await compactLink.waitFor({ state: "visible", timeout: 30000 });
    rec(out, "a.login-pm-link", true, page.url());

    await compactLink.click();
    await page.waitForSelector('[data-testid="rh-pm-page"]', { timeout: 45000 });
    await page.locator(".rh-pm-day-panel").waitFor({ state: "visible", timeout: 30000 });
    await page.getByText("Cargando olas").waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
    const cupoBtn = await findCupoLibre(page);
    rec(out, "b.cupo-libre", !!cupoBtn, cupoBtn ? "ok" : "sin cupo");
    if (!cupoBtn) return;

    await cupoBtn.click();
    await page.waitForURL(/\/clients\/opc-nuevo/, { timeout: 20000 });
    await page.locator('[data-testid="opc-expediente-tabs"]').waitFor({ state: "visible", timeout: 20000 });

    const folderStrip = await page.locator(".exp-folder-strip").count();
    rec(out, "c.sin-carpetas", folderStrip === 0, `folderStrip=${folderStrip}`);

    const tabCount = await page.locator('[data-testid="opc-expediente-tabs"] .admin-subnav-item').count();
    rec(out, "c.tres-tabs", tabCount === 3, `tabs=${tabCount}`);

    const draftBtn = await page.getByRole("button", { name: /Guardar borrador/i }).count();
    rec(out, "c.sin-borrador-ui", draftBtn === 0, `draftButtons=${draftBtn}`);

    const headerConfirm = await page.getByTestId("opc-confirm").count();
    rec(out, "c.header-confirmar", headerConfirm === 1, `confirm=${headerConfirm}`);

    const fx = FIXTURE;
    const tabs = page.locator('[data-testid="opc-expediente-tabs"]');
    await tabs.getByRole("button", { name: "Información cliente" }).click();
    await page.getByTestId("opc-pais").fill(fx.pais);
    await page.getByTestId("opc-pax").fill(fx.pax);
    await page.getByTestId("opc-estado").fill(fx.estado);
    await page.getByTestId("opc-modulo").fill(fx.modulo);
    await page.getByTestId("opc-idioma").fill(fx.idioma);
    await page.getByTestId("opc-estado-civil").fill(fx.estadoCivil);
    await fillPerson(page, "hombre", fx.hombre);
    await fillPerson(page, "mujer", fx.mujer);
    await fillPerson(page, "ninos", fx.ninos);
    await page.getByTestId("opc-notas-cliente").fill(fx.notasCliente);
    await page.screenshot({ path: `${SHOTS}/cliente.png`, fullPage: true });

    await tabs.getByRole("button", { name: "Estancia" }).click();
    await page.getByTestId("opc-agencia").fill(fx.agencia);
    await page.getByTestId("opc-nights").fill(fx.nights);
    await page.getByTestId("opc-room-type").fill(fx.roomType);
    await page.getByTestId("opc-rate").fill(fx.rate);
    await page.getByTestId("opc-room-number").fill(fx.roomNumber);
    const totalVal = await page.getByTestId("opc-total").inputValue();
    rec(out, "d.total-auto", totalVal === fx.total, `total=${totalVal}`);
    await page.getByTestId("opc-notas-estancia").fill(fx.notasEstancia);
    await page.screenshot({ path: `${SHOTS}/estancia.png`, fullPage: true });

    await tabs.getByRole("button", { name: "Invitación" }).click();
    const fechaVal = await page.getByTestId("opc-fecha").inputValue();
    const horaVal = await page.getByTestId("opc-hora").inputValue();
    rec(out, "d.fecha-hora", Boolean(fechaVal && horaVal), `fecha=${fechaVal} hora=${horaVal}`);
    await page.getByTestId("opc-calif").fill(fx.calificacion);
    await page.getByTestId("opc-regalo").fill(fx.regalo);
    await page.getByTestId("opc-notas-invitacion").fill(fx.notasInvitacion);
    await page.screenshot({ path: `${SHOTS}/invitacion.png`, fullPage: true });

    await page.getByTestId("opc-confirm").click();
    await page.waitForURL(/\/clients\/(?!opc-nuevo)[^/]+/, { timeout: 45000 });
    const landed = /\/clients\/[0-9a-f-]{8,}/i.test(page.url()) && !page.url().includes("opc-nuevo");
    const prospectId = (page.url().match(/\/clients\/([0-9a-f-]{36})/i) || [])[1] || "";
    rec(out, "e.confirm-nav", landed && !!prospectId, `url=${page.url()}`);
    out.prospectId = prospectId;
    out.mark = MARK;
    out.fecha = fechaVal;
    await page.screenshot({ path: `${SHOTS}/despues-confirm.png`, fullPage: true });
  } finally {
    await ctx.close();
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("Faltan QA_OPC_FIELDS_EMAIL / QA_OPC_FIELDS_PASSWORD");
    process.exit(1);
  }
  mkdirSync(SHOTS, { recursive: true });
  const report = { startedAt: new Date().toISOString(), mark: MARK, base: BASE, flow: {} };
  const browser = await chromium.launch({ headless: true });
  try {
    await runFlow(browser, report.flow);
    report.prospectId = report.flow.prospectId;
    report.mark = report.flow.mark || MARK;
    report.fecha = report.flow.fecha;
  } catch (err) {
    rec(report.flow, "flow.exception", false, err.stack || String(err));
  } finally {
    await browser.close();
  }
  report.finishedAt = new Date().toISOString();
  const needed = [
    "a.login-pm-link",
    "b.cupo-libre",
    "c.sin-carpetas",
    "c.tres-tabs",
    "c.sin-borrador-ui",
    "c.header-confirmar",
    "d.total-auto",
    "d.fecha-hora",
    "e.confirm-nav",
  ];
  report.pass = needed.every((k) => report.flow[k]?.pass === true);
  writeFileSync(RESULTS, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${RESULTS} pass=${report.pass} prospectId=${report.prospectId || ""}`);
  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
