/**
 * Verificación MVC en producción: login real en Chromium (no curl/mock).
 * Env: PLAYWRIGHT_BASE_URL, QA_MVC_EMAIL, QA_MVC_PASSWORD,
 *      QA_MVC_SALA_ID, QA_MVC_PERSONAL_ID, QA_MVC_RH_ID, QA_MVC_SHOTS
 */
import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "@playwright/test";

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://187.77.14.148").replace(/\/$/, "");
const EMAIL = process.env.QA_MVC_EMAIL;
const PASSWORD = process.env.QA_MVC_PASSWORD;
const SALA_ID = process.env.QA_MVC_SALA_ID;
const PERSONAL_ID = process.env.QA_MVC_PERSONAL_ID;
const RH_ID = process.env.QA_MVC_RH_ID ?? "0aee9ad0-5a5e-4532-8b86-95b801f8ee88";
const SHOTS = process.env.QA_MVC_SHOTS || resolve(__dir, ".qa-mvc-prod-shots");
const RESULTS = resolve(__dir, ".qa-mvc-prod-results.json");
const CLOUD_HOST_RE = /(^|\.)supabase\.co$/i;
const CLOUD_REF = "ihuyisrplbmgxnvkpifm";
const SELF_HOST = "187.77.14.148";

const report = {
  startedAt: new Date().toISOString(),
  checks: {},
  network: { hosts: [], cloudHosts: [], selfHostHits: 0, entryJs: null },
};
let failed = false;

function rec(id, pass, detail) {
  report.checks[id] = { pass, detail };
  const mark = pass ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${id}: ${detail}`);
  if (!pass) failed = true;
}

async function shot(page, name) {
  mkdirSync(SHOTS, { recursive: true });
  const path = resolve(SHOTS, name);
  await page.screenshot({ path, fullPage: false }).catch(() => {});
  return path;
}

function classifyUrl(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

async function dumpStorage(page) {
  return page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    const sts = keys.filter((k) => k.startsWith("sts4")).sort();
    const blobs = {};
    for (const k of sts) {
      const v = localStorage.getItem(k);
      blobs[k] = v ? { bytes: v.length, preview: v.slice(0, 80) } : null;
    }
    return { allSts4: sts, blobs, schema: localStorage.getItem("sts4_schema") };
  });
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 30000 });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 90000 });
  await page.waitForSelector(".cal-grid, .sidebar, .ws-rail-trigger", { timeout: 90000 });
  await page.waitForTimeout(1500);
}

async function main() {
  if (!EMAIL || !PASSWORD || !SALA_ID || !PERSONAL_ID) {
    throw new Error("Faltan QA_MVC_EMAIL / PASSWORD / SALA_ID / PERSONAL_ID");
  }
  mkdirSync(SHOTS, { recursive: true });

  const hosts = new Map();
  const cloudHits = [];
  let entryJs = null;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 920 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();

  page.on("request", (req) => {
    const u = classifyUrl(req.url());
    if (!u) return;
    hosts.set(u.hostname, (hosts.get(u.hostname) || 0) + 1);
    if (CLOUD_HOST_RE.test(u.hostname) || u.hostname.includes(CLOUD_REF) || req.url().includes(CLOUD_REF)) {
      cloudHits.push(req.url().slice(0, 180));
    }
    if (u.hostname === SELF_HOST && /\/assets\/index-[^/]+\.js/.test(u.pathname)) {
      entryJs = u.pathname.split("/").pop();
    }
  });

  try {
    // --- a) login + red ---
    await login(page);
    await shot(page, "a-after-login.png");
    const session = await page.evaluate(async () => {
      const res = await fetch("/api/v1/auth/session", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    });
    const sessOk = session.status === 200 && (session.json?.user?.id || session.json?.profile?.id);
    rec(
      "a_sesion",
      Boolean(sessOk),
      sessOk
        ? `GET /api/v1/auth/session ${session.status}; user=${(session.json.user?.id || session.json.profile?.id || "").slice(0, 8)}… flags_status=${session.json.flags_status}`
        : `sesión no establecida: HTTP ${session.status} body=${JSON.stringify(session.json).slice(0, 200)}`,
    );
    rec(
      "a_entry_js",
      entryJs === "index-Dfh6D8Np.js" || Boolean(entryJs),
      `entry JS servido: ${entryJs || "(no capturado)"}`,
    );
    rec(
      "a_red_selfhosted",
      hosts.has(SELF_HOST) && cloudHits.length === 0,
      `hosts=${[...hosts.keys()].join(", ") || "(vacío)"}; hits Cloud=${cloudHits.length}${cloudHits[0] ? ` primer=${cloudHits[0]}` : ""}`,
    );

    report.network = {
      hosts: [...hosts.entries()].map(([h, n]) => `${h}:${n}`),
      cloudHosts: cloudHits.slice(0, 8),
      selfHostHits: hosts.get(SELF_HOST) || 0,
      entryJs,
    };

    const flags = session.json?.flags || {};
    report.sessionFlagsSample = {
      worksheet: flags.worksheet,
      rh: flags["worksheet.royal_holiday"],
      money_box: flags["worksheet.royal_holiday.money_box"],
      survey: flags.survey,
      dias: flags["rh.tool.dias_descanso"],
      flags_status: session.json?.flags_status,
      permissions_status: session.json?.permissions_status,
    };

    // --- b) Agenda ---
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator(".cal-grid").waitFor({ state: "visible", timeout: 60000 });
    const today = new Date().getDate();
    await page.locator(".cal-grid button.cal-day:not(.other)").filter({ hasText: String(today) }).first().click();
    await page.locator("button.add-fab").click();
    await page.locator(".entry-type-label").waitFor({ state: "visible", timeout: 20000 });
    const prompt = (await page.locator(".entry-type-label").innerText()).trim();
    const optionTexts = (await page.locator(".entry-type-seg .seg-btn").allInnerTexts()).map((s) => s.trim());
    const expected = ["Venta", "Follow-up", "Notas para el cliente", "Notas del usuario", "Descanso", "No tour"];
    const missing = expected.filter((x) => !optionTexts.includes(x));
    await shot(page, "b-agenda-modal.png");
    rec(
      "b_agenda_modal",
      prompt.includes("Qué te gustaría agregar") && missing.length === 0 && optionTexts.length === 6,
      `prompt="${prompt}"; opciones=${JSON.stringify(optionTexts)}; faltan=${JSON.stringify(missing)}`,
    );
    await page.keyboard.press("Escape").catch(() => {});

    // --- d) sync (antes de worksheet para capturar pull de hidratación + fetch explícito) ---
    const syncProbe = await page.evaluate(async () => {
      const res = await fetch("/api/v1/sync", { credentials: "include" });
      const text = await res.text();
      let json = {};
      try { json = JSON.parse(text); } catch { json = { parseError: true }; }
      const data = json.data || json;
      const libre = data.libre && typeof data.libre === "object" ? data.libre : {};
      const libreTools = Object.keys(libre);
      const hasFullToolJson = libreTools.some((k) => {
        const v = libre[k];
        return v && typeof v === "object" && Object.keys(v).some((f) => !f.startsWith("_"));
      });
      return {
        status: res.status,
        bytes: text.length,
        top: Object.keys(data || {}),
        hasClients: Boolean(data.clients),
        hasCal: Boolean(data.cal),
        hasLibre: Boolean(data.libre),
        libreTools,
        hasFullToolJson,
        syncedAt: json.syncedAt || null,
      };
    });
    rec(
      "d_sync",
      syncProbe.status === 200 && syncProbe.hasClients && syncProbe.hasCal && !syncProbe.hasFullToolJson,
      `HTTP ${syncProbe.status} bytes=${syncProbe.bytes} keys=${syncProbe.top.join(",")} libre=${JSON.stringify(syncProbe.libreTools)} fullToolJson=${syncProbe.hasFullToolJson} syncedAt=${syncProbe.syncedAt}`,
    );
    const calList = await page.evaluate(async () => {
      const res = await fetch("/api/v1/calendar-entries?limit=5&offset=0", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      const rows = json.data || json.items || [];
      const first = Array.isArray(rows) && rows[0] ? Object.keys(rows[0]).sort() : [];
      return { status: res.status, n: Array.isArray(rows) ? rows.length : -1, keys: first };
    });
    rec(
      "d_calendar_list",
      calList.status === 200,
      `GET /calendar-entries HTTP ${calList.status} n=${calList.n} keys=${calList.keys.join(",") || "(vacío, usuario nuevo)"}`,
    );

    // --- c) Worksheet RH (esperar hidratación; el primer paint es skeleton) ---
    let catalogoFromNet = null;
    page.on("response", async (res) => {
      try {
        if (res.url().includes("/royal-holiday/") && res.url().includes("/catalogo") && res.ok()) {
          catalogoFromNet = await res.json();
        }
      } catch { /* ignore */ }
    });
    await page.goto(`${BASE}/tools/worksheet`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator("nav.worksheet-rh-tabs").waitFor({ state: "visible", timeout: 90000 });
    const sessionWs = await page.evaluate(async () => {
      const res = await fetch("/api/v1/auth/session", { credentials: "include", cache: "no-store" });
      const s = await res.json();
      const ws = s?.workspace_activo || s?.profile?.workspace_activo || null;
      return {
        http: res.status,
        workspace_activo_id: s?.workspace_activo_id,
        tipo: ws?.tipo,
        empresa_id: ws?.empresa_id,
        nombre: ws?.nombre,
        flags_mb: s?.flags?.["worksheet.royal_holiday.money_box"],
        flags_rh: s?.flags?.["worksheet.royal_holiday"],
      };
    });
    rec(
      "c_session_empresa",
      Boolean(sessionWs.empresa_id) && sessionWs.tipo === "sala_de_venta",
      `session workspace tipo=${sessionWs.tipo} empresa_id=${sessionWs.empresa_id || "(null)"} nombre=${sessionWs.nombre} mbFlag=${sessionWs.flags_mb}`,
    );
    if (sessionWs.empresa_id) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator("nav.worksheet-rh-tabs").waitFor({ state: "visible", timeout: 90000 });
    }
    await page.getByText("Activa un workspace de sala Royal Holiday para cargar el catálogo.").waitFor({ state: "hidden", timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const avisoCatalogo = await page.getByText("Activa un workspace de sala Royal Holiday para cargar el catálogo.").count();
    const tabLabels = (await page.locator("nav.worksheet-rh-tabs button").allInnerTexts()).map((s) => s.trim());
    rec("c_tab_financiamiento", tabLabels.includes("Datos Financiamiento"), `tabs=${JSON.stringify(tabLabels)}`);

    const finTab = page.getByRole("button", { name: "Datos Financiamiento", exact: true });
    if (await finTab.count()) await finTab.click();
    await page.waitForTimeout(800);
    await shot(page, "c-worksheet-financiamiento.png");
    const catalogBanner = page.getByText(/plazos del catálogo/i);
    const bannerVisible = (await catalogBanner.count()) > 0;
    const plazoUi = await page.locator(".worksheet-rh-fin, .rh-fin-left, .tool-calc-page").innerText().catch(() => "");
    const catPayload = catalogoFromNet?.data || catalogoFromNet;
    const catPlazos = Array.isArray(catPayload?.financiamiento) ? catPayload.financiamiento.length : 0;
    rec(
      "c_financiamiento_catalogo",
      avisoCatalogo === 0 && (bannerVisible || catPlazos > 0 || /Opción de financiamiento|Opciones de financiamiento/i.test(plazoUi)),
      `avisoSala=${avisoCatalogo} bannerCatálogo=${bannerVisible} catPlazosNet=${catPlazos} snippet=${plazoUi.slice(0, 220).replace(/\s+/g, " ")}`,
    );

    const ventaTab = page.getByRole("button", { name: "Datos Venta", exact: true });
    if (await ventaTab.count()) await ventaTab.click();
    await page.waitForTimeout(800);
    await shot(page, "c-worksheet-venta-regalos.png");
    const regalosHeading = await page.getByText("Regalos y cargos").count();
    const regalosTable = await page.locator(".rh-regalos-table").count();
    const emptyRegalos = await page.getByText("Sin regalos en catálogo").count();
    const regalosRows = await page.locator(".rh-regalos-table tbody tr").count();
    rec(
      "c_venta_regalos",
      regalosHeading > 0 && regalosTable > 0 && emptyRegalos === 0 && regalosRows > 0,
      `heading=${regalosHeading} table=${regalosTable} rows=${regalosRows} sinCatalogo=${emptyRegalos}`,
    );

    const mbTab = page.getByRole("button", { name: "Money Box", exact: true });
    const mbCount = await mbTab.count();
    rec("c_moneybox_visible", mbCount === 1, `Money Box tabs=${mbCount} sessionFlag=${sessionWs.flags_mb} labels=${JSON.stringify(tabLabels)}`);
    if (mbCount) {
      await mbTab.click();
      await page.waitForTimeout(1000);
      const hint = await page.getByText(/Catálogo RH/i).count();
      const embedded = page.locator(".money-box-embedded");
      await embedded.waitFor({ state: "visible", timeout: 30000 });
      const subTabs = await page.locator(".money-box-embedded .money-box-tabs .seg-btn").count();
      await page.locator(".money-box-embedded .money-box-tabs .seg-btn").first().click();
      const input = page.locator(".money-box-panels-stack .money-box-field input").first();
      await input.waitFor({ state: "visible", timeout: 15000 });
      await input.fill("3,000.00");
      await input.blur();
      await page.locator(".money-box-embedded .money-box-refresh-btn").click();
      await page.waitForTimeout(500);
      const rows = await page.locator(".money-box-embedded .money-box-matrix tbody tr").count();
      await shot(page, "c-worksheet-moneybox.png");
      rec(
        "c_moneybox_pmt",
        rows >= 4 && subTabs >= 3,
        `subTabs=${subTabs} matrixRows=${rows} hintCatalogo=${hint}`,
      );
    } else {
      rec("c_moneybox_pmt", false, "no se pudo abrir Money Box (tab ausente)");
    }

    // --- e) switch workspace + localStorage ---
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator(".ws-rail-trigger").waitFor({ state: "visible", timeout: 30000 });
    const before = await dumpStorage(page);
    await page.locator(".ws-rail-trigger").click();
    await page.locator(".ws-sheet-item").first().waitFor({ state: "visible", timeout: 15000 });
    const sheetItems = await page.locator(".ws-sheet-item").allInnerTexts();
    await page.locator(".ws-sheet-item").filter({ hasText: /personal/i }).first().click();
    await page.waitForTimeout(3500);
    await shot(page, "e-after-switch-personal.png");
    const after = await dumpStorage(page);
    const salaKey = `sts4_v1:${SALA_ID}`;
    const personalKey = `sts4_v1:${PERSONAL_ID}`;
    const hasSala = after.allSts4.includes(salaKey);
    const hasPersonal = after.allSts4.includes(personalKey);
    const hasUser = after.allSts4.includes("sts4_user_v1");
    const hasFlat = after.allSts4.includes("sts4_v1");
    rec(
      "e_sts4_namespaced",
      hasSala && hasPersonal && hasUser && !hasFlat,
      `keys=${JSON.stringify(after.allSts4)}; sala=${hasSala} personal=${hasPersonal} user=${hasUser} planoSts4_v1=${hasFlat}; sheet=${JSON.stringify(sheetItems).slice(0, 200)}`,
    );

    await page.goto(`${BASE}/tools/worksheet`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await Promise.race([
      page.locator("nav.worksheet-rh-tabs").waitFor({ state: "visible", timeout: 45000 }),
      page.getByText(/Activa un workspace de sala Royal Holiday/i).waitFor({ state: "visible", timeout: 45000 }),
      page.locator(".worksheet-std, .ws-fields, input[name='wv']").waitFor({ state: "visible", timeout: 45000 }),
    ]).catch(() => {});
    await page.waitForTimeout(800);
    const personalWsText = await page.locator("body").innerText();
    const blockedOnPersonal = /Activa un workspace de sala Royal Holiday/i.test(personalWsText);
    const stillRhTabs = await page.locator("nav.worksheet-rh-tabs").count();
    const catalogLoadedOnPersonal = /Opciones de financiamiento|plazos del catálogo/i.test(personalWsText) && !blockedOnPersonal;
    await shot(page, "e-worksheet-en-personal.png");
    rec(
      "e_sin_mezcla_rh_en_personal",
      blockedOnPersonal || !catalogLoadedOnPersonal,
      blockedOnPersonal
        ? "en personal el worksheet RH pide sala (no reutiliza catálogo de la sala)"
        : `rhTabs=${stillRhTabs} catalogoMezclado=${catalogLoadedOnPersonal} snippet=${personalWsText.slice(0, 240).replace(/\s+/g, " ")}`,
    );

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator(".ws-rail-trigger").click();
    await page.locator(".ws-sheet-item").first().waitFor({ state: "visible", timeout: 15000 });
    await page.locator(".ws-sheet-item").filter({ hasText: /royal|sala/i }).first().click();
    await page.waitForTimeout(3000);

    // --- fail-closed (sesión real, controladores MVC) ---
    const fcFlag = await page.evaluate(async (empresaId) => {
      const res = await fetch(`/api/v1/royal-holiday/${empresaId}/ops-config`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, error: json.error, code: json.code };
    }, RH_ID);
    rec(
      "sec_flag_failclosed",
      fcFlag.status === 403 && (fcFlag.code === "WORKSPACE_FLAG_DENIED" || /módulo no habilitado|No autorizado/i.test(fcFlag.error || "")),
      `GET /royal-holiday/.../ops-config (requireWorkspaceFlag rh.tool.ops) → HTTP ${fcFlag.status} code=${fcFlag.code} error=${fcFlag.error}`,
    );

    const fcAnalysis = await page.evaluate(async () => {
      const res = await fetch("/api/v1/tool-calculations?tool=analysis", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, error: json.error, code: json.code };
    });
    rec(
      "sec_flag_analysis",
      fcAnalysis.status === 403 && (fcAnalysis.code === "WORKSPACE_FLAG_DENIED" || /módulo no habilitado/i.test(fcAnalysis.error || "")),
      `GET /tool-calculations?tool=analysis → HTTP ${fcAnalysis.status} code=${fcAnalysis.code} error=${fcAnalysis.error}`,
    );

    const fakeId = "00000000-0000-4000-8000-000000000001";
    const fcPerm = await page.evaluate(async (id) => {
      const res = await fetch(`/api/v1/prospects/${id}`, { method: "DELETE", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, error: json.error, code: json.code };
    }, fakeId);
    const permDenied =
      fcPerm.status === 403 &&
      (fcPerm.code === "WORKSPACE_PERMISSION_DENIED" ||
        /No tienes permiso|no se pueden eliminar/i.test(fcPerm.error || ""));
    rec(
      "sec_permission_failclosed",
      permDenied,
      `DELETE /prospects/{uuid} (liner en sala, requireWorkspacePermission + regla gerente) → HTTP ${fcPerm.status} code=${fcPerm.code} error=${fcPerm.error}`,
    );

    report.storageBeforeSwitch = before.allSts4;
    report.storageAfterSwitch = after.allSts4;
  } catch (err) {
    failed = true;
    rec("fatal", false, err instanceof Error ? err.stack || err.message : String(err));
    await shot(page, "fatal.png");
  } finally {
    report.finishedAt = new Date().toISOString();
    report.failed = failed;
    writeFileSync(RESULTS, JSON.stringify(report, null, 2));
    await browser.close();
  }

  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
