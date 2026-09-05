#!/usr/bin/env node
/**
 * QA Money Box RH en prod: usuarios liner/cerrador, prueba DOM Playwright, limpieza.
 * Uso: node scripts/qa-rh-money-box-dom-prod.mjs
 */
import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const MANIFEST = resolve(__dir, ".qa-rh-moneybox-manifest.json");
const SHOTS = resolve(__dir, ".qa-rh-moneybox-shots");
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://187.77.14.148").replace(/\/$/, "");
const WORKSHEET_PATH = "/tools/worksheet";

const RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88";
const SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815";
const EMAIL_LINER = "qa-rh-mb-liner@saletse-test.com";
const EMAIL_CERRADOR = "qa-rh-mb-cerrador@saletse-test.com";

function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, ".env.local")) };
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_ANON = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = env.DATABASE_URL;

let admin;
let pgClient;
const manifest = { created_at: new Date().toISOString(), ids: {}, results: [] };

async function pgQ(sql, params = []) {
  return pgClient.query(sql, params);
}

async function ensureAuthUser(email, fullName) {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      user_metadata: { full_name: fullName },
      email_confirm: true,
    });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

async function magicLinkUrl(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(error.message);
  const link = data?.properties?.action_link;
  if (!link) throw new Error(`sin action_link para ${email}`);
  return link;
}

async function purgeUser(email) {
  const { rows } = await pgQ(`SELECT id FROM profiles WHERE email = $1`, [email]);
  const uid = rows[0]?.id;
  if (!uid) return;
  await pgQ(`DELETE FROM workspace_miembros WHERE usuario_id = $1`, [uid]);
  await pgQ(`DELETE FROM empresa_miembros WHERE usuario_id = $1`, [uid]);
  await pgQ(`DELETE FROM flag_reglas WHERE alcance = 'usuario' AND alcance_id = $1`, [uid]);
  await admin.auth.admin.deleteUser(uid).catch(() => {});
}

async function setupUsers() {
  console.log("=== SETUP usuarios QA liner / cerrador ===\n");
  await purgeUser(EMAIL_LINER);
  await purgeUser(EMAIL_CERRADOR);

  const linerRole = (await pgQ(`SELECT id, paquete_id FROM roles WHERE empresa_id = $1 AND slug = 'liner'`, [RH_ID])).rows[0];
  const cerradorRole = (await pgQ(`SELECT id, paquete_id FROM roles WHERE empresa_id = $1 AND slug = 'cerrador'`, [RH_ID])).rows[0];
  if (!linerRole?.id || !cerradorRole?.id) throw new Error("roles liner/cerrador no encontrados");

  manifest.ids.liner_role_id = linerRole.id;
  manifest.ids.cerrador_role_id = cerradorRole.id;
  manifest.ids.liner_paquete_id = linerRole.paquete_id;
  manifest.ids.cerrador_paquete_id = cerradorRole.paquete_id;

  manifest.ids.liner_user_id = await ensureAuthUser(EMAIL_LINER, "QA MB Liner");
  manifest.ids.cerrador_user_id = await ensureAuthUser(EMAIL_CERRADOR, "QA MB Cerrador");

  for (const [uid, roleId] of [
    [manifest.ids.liner_user_id, linerRole.id],
    [manifest.ids.cerrador_user_id, cerradorRole.id],
  ]) {
    await pgQ(
      `INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
       VALUES ($1, $2, false, 'activo') ON CONFLICT (empresa_id, usuario_id) DO UPDATE SET es_admin = false`,
      [RH_ID, uid],
    );
    await pgQ(
      `INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
       VALUES ($1, $2, 'vendedor', $3)
       ON CONFLICT (usuario_id, workspace_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
      [uid, SALA_RH_ID, roleId],
    );
    await pgQ(
      `UPDATE profiles SET workspace_activo_id = $1, is_super_admin = false WHERE id = $2`,
      [SALA_RH_ID, uid],
    );
  }

  const flagMb = (await pgQ(
    `SELECT id FROM flags WHERE clave = 'worksheet.royal_holiday.money_box' AND empresa_id = $1`,
    [RH_ID],
  )).rows[0]?.id;
  manifest.ids.flag_mb_id = flagMb;

  // Restaurar paquete liner ON
  await pgQ(
    `UPDATE paquete_flags SET activo = true WHERE paquete_id = $1 AND flag_id = $2`,
    [linerRole.paquete_id, flagMb],
  );

  const resolved = await pgQ(
    `SELECT
      resolver_workspace_flag('worksheet.royal_holiday.money_box', $1, $3) AS liner_mb,
      resolver_workspace_flag('worksheet.royal_holiday.money_box', $2, $3) AS cerrador_mb,
      (SELECT is_super_admin FROM profiles WHERE id = $1) AS liner_super,
      (SELECT is_super_admin FROM profiles WHERE id = $2) AS cerrador_super
    `,
    [manifest.ids.liner_user_id, manifest.ids.cerrador_user_id, SALA_RH_ID],
  );
  manifest.resolved = resolved.rows[0];
  console.log("Flags resueltos:", manifest.resolved);
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}

async function login(page, email) {
  const url = await magicLinkUrl(email);
  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1500);
}

async function assertMoneyBoxTab(page, expectVisible, label) {
  const nav = page.locator('nav.worksheet-rh-tabs[aria-label="Pestañas worksheet"]');
  await nav.waitFor({ state: "visible", timeout: 60000 });
  const tab = nav.getByRole("button", { name: "Money Box", exact: true });
  const count = await tab.count();
  const visible = count > 0;
  const ok = visible === expectVisible;
  manifest.results.push({ label, expectVisible, domCount: count, ok });
  console.log(`  ${ok ? "OK" : "FAIL"} ${label}: esperado=${expectVisible ? "visible" : "ausente"}, dom=${count}`);
  return { ok, tab, nav };
}

async function openWorksheet(page) {
  await page.goto(`${BASE}${WORKSHEET_PATH}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector(".worksheet-rh-tabs, .worksheet-rh", { timeout: 90000 });
}

async function runDomTests() {
  console.log("\n=== PRUEBA DOM Playwright ===\n");
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  // Liner — flag ON (paquete liner)
  {
    const page = await context.newPage();
    await login(page, EMAIL_LINER);
    await openWorksheet(page);
    const { ok } = await assertMoneyBoxTab(page, true, "liner — flag ON");
    await page.screenshot({ path: resolve(SHOTS, "liner-flag-on.png"), fullPage: false });
    if (!ok) throw new Error("liner debería ver Money Box");
    await page.close();
  }

  // Cerrador — flag ON (paquete cierre)
  {
    const page = await context.newPage();
    await login(page, EMAIL_CERRADOR);
    await openWorksheet(page);
    const { ok } = await assertMoneyBoxTab(page, true, "cerrador — flag ON");
    await page.screenshot({ path: resolve(SHOTS, "cerrador-flag-on.png"), fullPage: false });
    if (!ok) throw new Error("cerrador debería ver Money Box");
    await page.close();
  }

  // Negativo: apagar flag en paquete liner (solo afecta liner)
  console.log("\n--- Toggle negativo: paquete liner money_box OFF ---");
  await pgQ(
    `UPDATE paquete_flags SET activo = false WHERE paquete_id = $1 AND flag_id = $2`,
    [manifest.ids.liner_paquete_id, manifest.ids.flag_mb_id],
  );
  manifest.liner_paquete_flag_toggled_off = true;

  {
    const page = await context.newPage();
    await login(page, EMAIL_LINER);
    await openWorksheet(page);
    const { ok } = await assertMoneyBoxTab(page, false, "liner — flag OFF (paquete liner)");
    await page.screenshot({ path: resolve(SHOTS, "liner-flag-off.png"), fullPage: false });
    if (!ok) throw new Error("liner NO debería ver Money Box tras apagar paquete");
    await page.close();
  }

  {
    const page = await context.newPage();
    await login(page, EMAIL_CERRADOR);
    await openWorksheet(page);
    const { ok } = await assertMoneyBoxTab(page, true, "cerrador — sin cambio tras OFF liner");
    await page.screenshot({ path: resolve(SHOTS, "cerrador-still-on.png"), fullPage: false });
    if (!ok) throw new Error("cerrador debería seguir viendo Money Box");
    await page.close();
  }

  // Restaurar paquete liner
  await pgQ(
    `UPDATE paquete_flags SET activo = true WHERE paquete_id = $1 AND flag_id = $2`,
    [manifest.ids.liner_paquete_id, manifest.ids.flag_mb_id],
  );
  manifest.liner_paquete_flag_toggled_off = false;

  await browser.close();
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}

async function cleanup() {
  console.log("\n=== LIMPIEZA ===\n");
  if (manifest.liner_paquete_flag_toggled_off && manifest.ids.liner_paquete_id && manifest.ids.flag_mb_id) {
    await pgQ(
      `UPDATE paquete_flags SET activo = true WHERE paquete_id = $1 AND flag_id = $2`,
      [manifest.ids.liner_paquete_id, manifest.ids.flag_mb_id],
    );
  }
  for (const email of [EMAIL_LINER, EMAIL_CERRADOR]) {
    await purgeUser(email);
    console.log(`  eliminado ${email}`);
  }
  const { rows } = await pgQ(
    `SELECT email FROM profiles WHERE email = ANY($1::text[])`,
    [[EMAIL_LINER, EMAIL_CERRADOR]],
  );
  console.log(`  perfiles restantes: ${rows.length}`);
  if (existsSync(MANIFEST)) unlinkSync(MANIFEST);
}

async function main() {
  if (!DATABASE_URL || !SERVICE_KEY || !SUPABASE_URL || !SUPABASE_ANON) {
    console.error("Faltan DATABASE_URL / SUPABASE_* en .env.local");
    process.exit(1);
  }

  admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  pgClient = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pgClient.connect();

  let failed = false;
  try {
    await setupUsers();
    await runDomTests();
  } catch (err) {
    failed = true;
    console.error("\nERROR:", err.message);
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  } finally {
    try {
      await cleanup();
    } catch (e) {
      console.error("Limpieza parcial:", e.message);
      failed = true;
    }
    await pgClient.end();
  }

  console.log("\n=== RESUMEN DOM ===");
  console.log("| Caso | Esperado | DOM | OK |");
  console.log("|---|---|---|---|");
  for (const r of manifest.results) {
    console.log(`| ${r.label} | ${r.expectVisible ? "visible" : "ausente"} | ${r.domCount} | ${r.ok ? "✅" : "❌"} |`);
  }
  console.log(`\nCapturas: ${SHOTS}`);

  if (failed || manifest.results.some((r) => !r.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
