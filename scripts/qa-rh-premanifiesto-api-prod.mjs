#!/usr/bin/env node
/**
 * QA API Premanifiesto RH — prod VPS (usuarios ya creados por run-qa-rh-premanifiesto-e2e-prod.py).
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const RESULTS = resolve(__dir, ".qa-rh-pm-e2e-results.json");

const API_BASE = (process.env.API_BASE ?? "http://187.77.14.148").replace(/\/$/, "");
const RH_ID = process.env.RH_EMPRESA_ID ?? "0aee9ad0-5a5e-4532-8b86-95b801f8ee88";
const SALA_ID = process.env.RH_SALA_ID ?? "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815";
const FECHA = process.env.QA_PM_FECHA ?? new Date().toISOString().slice(0, 10);

const EMAILS = {
  marketing: process.env.QA_PM_EMAIL_MARKETING ?? "qa-rh-pm-marketing@saletse-test.com",
  opc: process.env.QA_PM_EMAIL_OPC ?? "qa-rh-pm-opc@saletse-test.com",
  noflag: process.env.QA_PM_EMAIL_NOFLAG ?? "qa-rh-pm-noflag@saletse-test.com",
  liner: process.env.QA_PM_EMAIL_LINER ?? "qa-rh-pm-liner@saletse-test.com",
  gerenteQa: process.env.QA_PM_EMAIL_GERENTE_QA ?? "qa-rh-pm-gerente@saletse-test.com",
  gerente: process.env.QA_PM_EMAIL_GERENTE ?? "eduardolalito99@hotmail.com",
};

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const results = [];
function record(id, ok, obs) {
  results.push({ id, ok: ok ? "PASS" : "FAIL", obs });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}: ${obs}`);
}

async function token(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`${email}: ${error.message}`);
  const { data: s, error: ve } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (ve) throw new Error(`${email} verify: ${ve.message}`);
  return s.session.access_token;
}

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json, err: json?.error || json?.message || text.slice(0, 200) };
}

function allEntradas(diaPayload) {
  const olas = diaPayload?.olas || diaPayload?.data?.olas || [];
  return olas.flatMap((o) => o.entradas || []);
}

async function main() {
  const olaConfigId = process.env.QA_PM_OLA_ID;
  if (!olaConfigId) throw new Error("QA_PM_OLA_ID requerido");

  const tMarketing = await token(EMAILS.marketing);
  const tOpc = await token(EMAILS.opc);
  const tNoflag = await token(EMAILS.noflag);
  const tLiner = await token(EMAILS.liner);
  const tGerenteQa = await token(EMAILS.gerenteQa);
  const tGerente = await token(EMAILS.gerente);

  const qs = `workspaceId=${SALA_ID}&fecha=${FECHA}`;

  // --- Escenario 1: Marketing GET dia ---
  const diaM = await api(`/royal-holiday/${RH_ID}/premanifiesto/dia?${qs}`, { token: tMarketing });
  const olasM = diaM.json?.data?.olas ?? diaM.json?.olas;
  const okMRead =
    diaM.status === 200
    && Array.isArray(olasM)
    && olasM.length >= 1
    && olasM.every((o) => o.ola_config_id && o.cupo_max != null);
  record(
    "1 Marketing GET /premanifiesto/dia",
    okMRead,
    `HTTP ${diaM.status}; olas=${olasM?.length ?? 0}`,
  );

  // Seed CSI probe via marketing (registro con notas_csi)
  const regCsi = await api(`/royal-holiday/${RH_ID}/premanifiesto/registrar`, {
    method: "POST",
    token: tMarketing,
    body: {
      empresa_id: RH_ID,
      workspace_id: SALA_ID,
      fecha: FECHA,
      ola_config_id: olaConfigId,
      origen: "marketing",
      prospect_nombre: `QA-CSI-${Date.now()}`,
      notas_csi: "QA-CSI-SECRETO-NO-DEBE-FILTRAR",
      notes: "nota operativa visible",
    },
  });
  const csiRowId = regCsi.json?.data?.id;
  record(
    "CSI setup marketing registra con notas_csi",
    regCsi.status === 201 && !!csiRowId,
    `HTTP ${regCsi.status}; id=${csiRowId?.slice(0, 8) ?? "—"}`,
  );

  // --- Escenario 2: OPC registrar + comercial bloqueado ---
  const regOpc = await api(`/royal-holiday/${RH_ID}/premanifiesto/registrar`, {
    method: "POST",
    token: tOpc,
    body: {
      empresa_id: RH_ID,
      workspace_id: SALA_ID,
      fecha: FECHA,
      ola_config_id: olaConfigId,
      origen: "opc",
      prospect_nombre: `QA-OPC-${Date.now()}`,
      notas_csi: "CSI lobby OPC",
      notes: "invitacion lobby",
    },
  });
  const opcRowId = regOpc.json?.data?.id;
  const opcComercialBlocked = regOpc.json?.data?.comercial_bloqueado === true;
  record(
    "2a OPC POST /registrar",
    regOpc.status === 201 && !!opcRowId && opcComercialBlocked,
    `HTTP ${regOpc.status}; id=${opcRowId?.slice(0, 8) ?? "—"}; comercial_bloqueado=${regOpc.json?.data?.comercial_bloqueado}`,
  );

  const patchOpcOwn = await api(`/royal-holiday/${RH_ID}/premanifiesto/${opcRowId}`, {
    method: "PATCH",
    token: tOpc,
    body: { workspace_id: SALA_ID, rate: 9999, total: 8888 },
  });
  record(
    "2b OPC PATCH comercial propio bloqueado",
    patchOpcOwn.status === 403,
    `HTTP ${patchOpcOwn.status}; ${patchOpcOwn.err}`,
  );

  const patchOpcOther = await api(`/royal-holiday/${RH_ID}/premanifiesto/${csiRowId}`, {
    method: "PATCH",
    token: tOpc,
    body: { workspace_id: SALA_ID, rate: 7777 },
  });
  record(
    "2c OPC PATCH comercial otro registro denegado",
    patchOpcOther.status === 403,
    `HTTP ${patchOpcOther.status}; ${patchOpcOther.err}`,
  );

  const diaOpc = await api(`/royal-holiday/${RH_ID}/premanifiesto/dia?${qs}`, { token: tOpc });
  const entradasOpc = allEntradas(diaOpc.json?.data ?? diaOpc.json);
  const marketingEntry = entradasOpc.find((e) => e.id === csiRowId);
  const opcSeesOtherCsi = marketingEntry && Object.prototype.hasOwnProperty.call(marketingEntry, "notas_csi");
  record(
    "2d OPC no ve notas_csi de registro ajeno",
    !opcSeesOtherCsi,
    opcSeesOtherCsi ? "FILTRACION notas_csi en entrada ajena" : "notas_csi ausente en ajeno OK",
  );

  // --- Escenario 3: Sin flags ---
  const diaNone = await api(`/royal-holiday/${RH_ID}/premanifiesto/dia?${qs}`, { token: tNoflag });
  record(
    "3a Sin flags GET /dia denegado",
    diaNone.status === 403,
    `HTTP ${diaNone.status}; ${diaNone.err}`,
  );
  const regNone = await api(`/royal-holiday/${RH_ID}/premanifiesto/registrar`, {
    method: "POST",
    token: tNoflag,
    body: {
      empresa_id: RH_ID,
      workspace_id: SALA_ID,
      fecha: FECHA,
      ola_config_id: olaConfigId,
      origen: "marketing",
      prospect_nombre: "QA-should-fail",
    },
  });
  record(
    "3b Sin flags POST /registrar denegado",
    regNone.status === 403,
    `HTTP ${regNone.status}; ${regNone.err}`,
  );

  // --- Escenario 4: Gerente solo lectura ---
  const diaG = await api(`/royal-holiday/${RH_ID}/premanifiesto/dia?${qs}`, { token: tGerente });
  const olasG = diaG.json?.data?.olas ?? diaG.json?.olas;
  record(
    "4a Gerente GET /dia (solo lectura)",
    diaG.status === 200 && Array.isArray(olasG) && olasG.length >= 1,
    `HTTP ${diaG.status}; olas=${olasG?.length ?? 0}`,
  );
  const regG = await api(`/royal-holiday/${RH_ID}/premanifiesto/registrar`, {
    method: "POST",
    token: tGerente,
    body: {
      empresa_id: RH_ID,
      workspace_id: SALA_ID,
      fecha: FECHA,
      ola_config_id: olaConfigId,
      origen: "marketing",
      prospect_nombre: "QA-gerente-should-fail",
    },
  });
  const gerenteIsSuper = regG.status === 201;
  record(
    "4b Gerente real POST /registrar (cuenta prod)",
    regG.status === 403 || gerenteIsSuper,
    gerenteIsSuper
      ? `HTTP ${regG.status} — cuenta prod es super_admin (bypass); ver 4c gerente QA sin super`
      : `HTTP ${regG.status}; ${regG.err}`,
  );

  const regGqa = await api(`/royal-holiday/${RH_ID}/premanifiesto/registrar`, {
    method: "POST",
    token: tGerenteQa,
    body: {
      empresa_id: RH_ID,
      workspace_id: SALA_ID,
      fecha: FECHA,
      ola_config_id: olaConfigId,
      origen: "marketing",
      prospect_nombre: "QA-gerente-qa-should-fail",
    },
  });
  record(
    "4c Gerente QA (no super) POST /registrar denegado",
    regGqa.status === 403,
    `HTTP ${regGqa.status}; ${regGqa.err}`,
  );

  // --- Escenario 5: CSI proyección real (liner: lee calendario, no CSI ajeno) ---
  const diaL = await api(`/royal-holiday/${RH_ID}/premanifiesto/dia?${qs}`, { token: tLiner });
  const entradasL = allEntradas(diaL.json?.data ?? diaL.json);
  const csiEntryL = entradasL.find((e) => e.id === csiRowId);
  const linerSeesCsi = csiEntryL && Object.prototype.hasOwnProperty.call(csiEntryL, "notas_csi");
  record(
    "5 Liner sin .csi no recibe notas_csi ajeno en API",
    diaL.status === 200 && !linerSeesCsi,
    `HTTP ${diaL.status}; entry=${csiEntryL ? "found" : "missing"}; notas_csi key=${linerSeesCsi}`,
  );

  // Marketing sí debe ver notas_csi en su propio registro
  const diaM2 = await api(`/royal-holiday/${RH_ID}/premanifiesto/dia?${qs}`, { token: tMarketing });
  const entradasM2 = allEntradas(diaM2.json?.data ?? diaM2.json);
  const csiEntryM = entradasM2.find((e) => e.id === csiRowId);
  record(
    "5b Marketing sí ve notas_csi (control positivo)",
    csiEntryM?.notas_csi === "QA-CSI-SECRETO-NO-DEBE-FILTRAR",
    csiEntryM?.notas_csi ? "notas_csi presente OK" : "notas_csi ausente FAIL",
  );

  writeFileSync(RESULTS, JSON.stringify({ results, ids: { csiRowId, opcRowId }, fecha: FECHA }, null, 2));
  const failed = results.filter((r) => r.ok === "FAIL").length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
