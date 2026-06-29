/**
 * Añade 10 expedientes demo al usuario eduardolalito99@hotmail.com
 * con datos en prospects, sales, calendar_entries, activities y tool_calculations.
 *
 * Uso: npm run seed:eduardo
 * No borra datos existentes; usa códigos EDU-001 … EDU-010 (omite los ya creados).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dir = dirname(fileURLToPath(import.meta.url));
const TARGET_EMAIL = "eduardolalito99@hotmail.com";
const CODE_PREFIX = "EDU-";

const WS_DEFAULTS = {
  wo1m: "60", wo1r: "12.99",
  wo2m: "48", wo2r: "8.90",
  wo3m: "12", wo3r: "0",
};

function loadEnvLocal() {
  const path = resolve(__dir, "../.env.local");
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i === -1) continue;
      const key = trimmed.slice(0, i).trim();
      let val = trimmed.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* ok */ }
}

function surveyData(overrides = {}) {
  return {
    nights: "5", total: "8500", hpct: "72", stype: "hotel", futureType: "real",
    svp_name1: "Roberto Mendoza",
    svp_country: "México", svp_occ1: "Ingeniero", svp_city: "Monterrey",
    sh1c: "Cancún", sh1y: "2023", sh1n: "5", sh1a: "7200",
    sh2c: "Los Cabos", sh2y: "2022", sh2n: "4", sh2a: "6800",
    sf1c: "Miami", sf1y: "2026", sf1n: "5", sf1a: "9000",
    ...overrides,
  };
}

function vacacionesData(overrides = {}) {
  return { vv: "2", vc: "4500", va: "18", vi: "7.5", ...overrides };
}

function worksheetData(overrides = {}) {
  return { wv: "28500", we: "30", wcc: "495", wob: "1200", ...WS_DEFAULTS, ...overrides };
}

const PROSPECTS = [
  {
    code: "EDU-001",
    name: "Familia Mendoza",
    name1: "Roberto Mendoza", name2: "Laura Mendoza",
    occupation1: "Ingeniero civil", occupation2: "Contadora",
    city: "Monterrey", country: "México",
    phone: "+52 81 555 1001", email: "roberto.mendoza@email.test",
    contract: "EDU-2026-0001", status: "venta",
    tour_date: "2026-01-10", process_date: "2026-01-15", process_amount: 28500,
    note: "Cierre en sala Premier. Muy interesados en semanas platinum.",
    completed: true, quick_expedient: false,
    tools: { survey: surveyData(), vacaciones: vacacionesData(), worksheet: worksheetData() },
    sales: [{ sale_date: "2026-01-10", vol: 28500, tours: 1, contract: "EDU-2026-0001", status: "venta", process_date: "2026-01-15", note: "Cierre inicial" }],
  },
  {
    code: "EDU-002",
    name: "Carlos & Patricia Ruiz",
    name1: "Carlos Ruiz", name2: "Patricia Ruiz",
    occupation1: "Empresario", occupation2: "Diseñadora de interiores",
    city: "Guadalajara", country: "México",
    phone: "+52 33 555 1002", email: "c.ruiz@email.test",
    contract: "EDU-2026-0002", status: "venta",
    tour_date: "2026-02-14", process_date: null, process_amount: 0,
    note: "Pendiente comprobante de ingresos y referencias bancarias.",
    completed: false, quick_expedient: false,
    tools: {
      survey: surveyData({ svp_name1: "Carlos Ruiz", svp_city: "Guadalajara", total: "12000", futureType: "dream" }),
      vacaciones: vacacionesData({ vc: "5200", va: "20" }),
      worksheet: worksheetData({ wv: "32000", we: "25", wcc: "595" }),
    },
    sales: [{ sale_date: "2026-02-14", vol: 22000, tours: 1, contract: "EDU-2026-0002", status: "venta", note: "En revisión legal" }],
  },
  {
    code: "EDU-003",
    name: "James & Susan Miller",
    name1: "James Miller", name2: "Susan Miller",
    occupation1: "Retired executive", occupation2: "Teacher",
    city: "Dallas", country: "Estados Unidos",
    phone: "+1 214 555 1003", email: "jmiller@email.test",
    contract: null, status: "bback",
    tour_date: "2026-03-08", process_date: null, process_amount: 0,
    note: "B-back agendado para mediados de abril.",
    completed: false, quick_expedient: true,
    tools: {
      survey: surveyData({ svp_name1: "James Miller", svp_country: "Estados Unidos", stype: "cruise", nights: "7", total: "15000" }),
      worksheet: worksheetData({ wv: "45000", we: "35", wob: "0" }),
    },
    sales: [{ sale_date: "2026-03-08", vol: 18500, tours: 1, contract: "EDU-2026-0003", status: "bback", note: "Primera presentación" }],
  },
  {
    code: "EDU-004",
    name: "Fernando & Elena Vargas",
    name1: "Fernando Vargas", name2: "Elena Vargas",
    occupation1: "Médico cardiólogo", occupation2: "Enfermera jefe",
    city: "Ciudad de México", country: "México",
    phone: "+52 55 555 1004", email: "f.vargas@email.test",
    contract: "EDU-2026-0004", status: "procesado",
    tour_date: "2026-03-20", process_date: "2026-03-28", process_amount: 35000,
    note: "Expediente completo enviado a procesamiento.",
    completed: true, quick_expedient: false,
    tools: {
      survey: surveyData({ svp_name1: "Fernando Vargas", svp_city: "CDMX", total: "9500", hpct: "78" }),
      vacaciones: vacacionesData({ vc: "3800", va: "15" }),
      worksheet: worksheetData({ wv: "35000", we: "28" }),
    },
    sales: [
      { sale_date: "2026-03-20", vol: 35000, tours: 1, contract: "EDU-2026-0004", status: "procesado", process_date: "2026-03-28" },
      { sale_date: "2026-04-05", vol: 5500, tours: 0, contract: "EDU-2026-0004-A", status: "procesado", note: "Upgrade puntos" },
    ],
  },
  {
    code: "EDU-005",
    name: "Michael & Sarah Thompson",
    name1: "Michael Thompson", name2: "Sarah Thompson",
    occupation1: "Software engineer", occupation2: "Marketing director",
    city: "Austin", country: "Estados Unidos",
    phone: "+1 512 555 1005", email: "mthompson@email.test",
    contract: null, status: "pendiente",
    tour_date: "2026-04-02", process_date: null, process_amount: 0,
    note: "Crédito no aprobado. Recontactar en 6 meses.",
    completed: false, quick_expedient: false,
    tools: {
      survey: surveyData({ svp_name1: "Michael Thompson", svp_country: "Estados Unidos", stype: "airbnb", total: "11000" }),
      worksheet: worksheetData({ wv: "28000", we: "30", wob: "2500" }),
    },
    sales: [{ sale_date: "2026-04-02", vol: 12000, tours: 1, contract: "EDU-2026-0005", status: "pendiente", note: "No califica" }],
  },
  {
    code: "EDU-006",
    name: "Ricardo & Gloria Herrera",
    name1: "Ricardo Herrera", name2: "Gloria Herrera",
    occupation1: "Abogado corporativo", occupation2: "Arquitecta",
    city: "Querétaro", country: "México",
    phone: "+52 442 555 1006", email: "rherrera@email.test",
    contract: "EDU-2026-0006", status: "perdido",
    tour_date: "2026-04-18", process_date: null, process_amount: 0,
    note: "Posponen decisión 12 meses por mudanza internacional.",
    completed: false, quick_expedient: false,
    tools: {
      survey: surveyData({ svp_name1: "Ricardo Herrera", svp_city: "Querétaro", total: "8000" }),
      vacaciones: vacacionesData({ vv: "3", vc: "6000" }),
      worksheet: worksheetData({ wv: "40000", we: "32" }),
    },
    sales: [{ sale_date: "2026-04-18", vol: 16000, tours: 1, contract: "EDU-2026-0006", status: "perdido", note: "No cerró" }],
  },
  {
    code: "EDU-007",
    name: "David & Emma Wilson",
    name1: "David Wilson", name2: "Emma Wilson",
    occupation1: "Financial advisor", occupation2: "Real estate broker",
    city: "Phoenix", country: "Estados Unidos",
    phone: "+1 602 555 1007", email: "dwilson@email.test",
    contract: "EDU-2026-0007", status: "cerrado",
    tour_date: "2026-05-05", process_date: "2026-05-12", process_amount: 52000,
    note: "Operación cerrada. Cliente referirá a hermano en julio.",
    completed: true, quick_expedient: false,
    tools: {
      survey: surveyData({ svp_name1: "David Wilson", svp_country: "Estados Unidos", total: "14000", hpct: "80" }),
      worksheet: worksheetData({ wv: "52000", we: "35", wcc: "695", wob: "0" }),
    },
    sales: [{ sale_date: "2026-05-05", vol: 52000, tours: 1, contract: "EDU-2026-0007", status: "cerrado", process_date: "2026-05-12" }],
  },
  {
    code: "EDU-008",
    name: "Alejandro & Sofía Navarro",
    name1: "Alejandro Navarro", name2: "Sofía Navarro",
    occupation1: "Dueño de restaurante", occupation2: "Nutrióloga",
    city: "Puebla", country: "México",
    phone: "+52 222 555 1008", email: "a.navarro@email.test",
    contract: "EDU-2026-0008", status: "venta",
    tour_date: "2026-05-20", process_date: "2026-05-25", process_amount: 19800,
    note: "Interés en plan familiar 2+2. Prefieren pagos mensuales.",
    completed: false, quick_expedient: true,
    tools: {
      survey: surveyData({ svp_name1: "Alejandro Navarro", svp_city: "Puebla", stype: "resort", total: "6500" }),
      vacaciones: vacacionesData({ vc: "3200", va: "12", vi: "6.5" }),
      worksheet: worksheetData({ wv: "19800", we: "22", wcc: "395" }),
    },
    sales: [{ sale_date: "2026-05-20", vol: 19800, tours: 1, contract: "EDU-2026-0008", status: "venta", process_date: "2026-05-25" }],
  },
  {
    code: "EDU-009",
    name: "William & Linda Brooks",
    name1: "William Brooks", name2: "Linda Brooks",
    occupation1: "Contractor", occupation2: "Interior designer",
    city: "Denver", country: "Estados Unidos",
    phone: "+1 303 555 1009", email: "wbrooks@email.test",
    contract: null, status: "bback",
    tour_date: "2026-05-28", process_date: null, process_amount: 0,
    note: "Segunda visita programada. Traen referidos.",
    completed: false, quick_expedient: false,
    tools: {
      survey: surveyData({ svp_name1: "William Brooks", svp_country: "Estados Unidos", svp_city: "Denver", nights: "6" }),
      vacaciones: vacacionesData({ vv: "4", vc: "7200", va: "22" }),
      worksheet: worksheetData({ wv: "38000", we: "28", wcc: "550" }),
    },
    sales: [{ sale_date: "2026-05-28", vol: 24000, tours: 1, contract: "EDU-2026-0009", status: "bback" }],
  },
  {
    code: "EDU-010",
    name: "Jorge & Carmen Delgado",
    name1: "Jorge Delgado", name2: "Carmen Delgado",
    occupation1: "Contador público", occupation2: "Profesora universitaria",
    city: "León", country: "México",
    phone: "+52 477 555 1010", email: "j.delgado@email.test",
    contract: "EDU-2026-0010", status: "venta",
    tour_date: "2026-06-01", process_date: null, process_amount: 0,
    note: "Documentación casi completa. Falta acta matrimonio apostillada.",
    completed: false, quick_expedient: false,
    tools: {
      survey: surveyData({ svp_name1: "Jorge Delgado", svp_city: "León", total: "7800", hpct: "65" }),
      vacaciones: vacacionesData({ vc: "4100", va: "16", vi: "8" }),
      worksheet: worksheetData({ wv: "26500", we: "26", wcc: "480", wob: "800" }),
    },
    sales: [{ sale_date: "2026-06-01", vol: 26500, tours: 1, contract: "EDU-2026-0010", status: "venta", note: "Pendiente acta" }],
  },
];

const CALENDAR_EXTRA = [
  { type: "follow", entry_date: "2026-02-20", prospect_code: "EDU-002", note: "Llamada seguimiento documentos" },
  { type: "nota", entry_date: "2026-03-15", prospect_code: "EDU-003", note: "Cliente pidió brochure en inglés" },
  { type: "descanso", entry_date: "2026-04-10", note: "Día libre programado" },
  { type: "follow", entry_date: "2026-05-15", prospect_code: "EDU-007", note: "Confirmar entrega welcome kit" },
  { type: "nota", entry_date: "2026-06-03", note: "Revisión pipeline junio" },
];

const ACTIVITIES_EXTRA = [
  { type: "nota", activity_date: "2026-02-16", title: "Admin", note: "Revisión expedientes propios en panel" },
  { type: "follow", prospect_code: "EDU-003", activity_date: "2026-04-01", title: "B-back", note: "Confirmada fecha segunda visita" },
  { type: "nota", prospect_code: "EDU-005", activity_date: "2026-04-05", title: "Crédito", note: "Rechazado — archivo en espera" },
];

async function findUserIdByEmail(sb, email) {
  let page = 1;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) break;
    page += 1;
  }
  const { data: prof } = await sb.from("profiles").select("id").eq("email", email).maybeSingle();
  return prof?.id ?? null;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log(`\n=== Seed prospectos para ${TARGET_EMAIL} ===\n`);

  const userId = await findUserIdByEmail(sb, TARGET_EMAIL);
  if (!userId) {
    console.error(`No se encontró usuario con email ${TARGET_EMAIL}`);
    process.exit(1);
  }

  const { data: profile } = await sb.from("profiles").select("full_name, role").eq("id", userId).single();
  console.log(`Usuario: ${profile?.full_name ?? userId} (${profile?.role ?? "?"})`);

  const { data: existing } = await sb.from("prospects").select("prospect_code").eq("user_id", userId);
  const existingCodes = new Set((existing ?? []).map((r) => r.prospect_code));
  const toInsert = PROSPECTS.filter((p) => !existingCodes.has(p.code));

  if (!toInsert.length) {
    console.log("Los 10 expedientes EDU-001…EDU-010 ya existen. Nada que insertar.");
    return;
  }

  const prospectIds = [];
  const saleIdMap = new Map();

  for (const p of toInsert) {
    const prospectId = randomUUID();
    const { error: pErr } = await sb.from("prospects").insert({
      id: prospectId,
      user_id: userId,
      prospect_code: p.code,
      name: p.name,
      name1: p.name1,
      name2: p.name2,
      occupation1: p.occupation1,
      occupation2: p.occupation2,
      city: p.city,
      country: p.country,
      phone: p.phone,
      email: p.email,
      contract: p.contract,
      status: p.status,
      tour_date: p.tour_date,
      process_date: p.process_date,
      process_amount: p.process_amount,
      note: p.note,
      completed: p.completed ?? false,
      quick_expedient: p.quick_expedient ?? false,
    });
    if (pErr) throw new Error(`Prospect ${p.code}: ${pErr.message}`);
    prospectIds.push({ id: prospectId, code: p.code, meta: p });
    console.log(`  + expediente ${p.code} — ${p.name}`);

    for (const tool of ["survey", "vacaciones", "worksheet"]) {
      const data = p.tools?.[tool];
      if (!data) continue;
      const { error } = await sb.from("tool_calculations").insert({
        user_id: userId,
        prospect_id: prospectId,
        tool,
        data,
      });
      if (error) throw new Error(`Tool ${tool} ${p.code}: ${error.message}`);
    }

    for (const s of p.sales ?? []) {
      const saleId = randomUUID();
      const { error } = await sb.from("sales").insert({
        id: saleId,
        user_id: userId,
        prospect_id: prospectId,
        sale_date: s.sale_date,
        vol: s.vol,
        tours: s.tours,
        contract: s.contract,
        status: s.status,
        process_date: s.process_date ?? null,
        note: s.note ?? null,
      });
      if (error) throw new Error(`Sale ${p.code}: ${error.message}`);
      saleIdMap.set(`${p.code}:${s.sale_date}`, saleId);

      const { error: calErr } = await sb.from("calendar_entries").insert({
        id: randomUUID(),
        user_id: userId,
        prospect_id: prospectId,
        sale_id: saleId,
        type: "venta",
        entry_date: s.sale_date,
        note: s.note ?? `Tour ${p.name}`,
        vol: s.vol,
        tours: s.tours,
        contract: s.contract ?? null,
        source: "seed-eduardo",
      });
      if (calErr) throw new Error(`Cal venta ${p.code}: ${calErr.message}`);

      const { error: actErr } = await sb.from("activities").insert({
        id: randomUUID(),
        user_id: userId,
        prospect_id: prospectId,
        sale_id: saleId,
        type: "venta",
        title: `Venta — ${p.name}`,
        note: s.note ?? null,
        activity_date: s.sale_date,
        source: "seed-eduardo",
        vol: s.vol,
        tours: s.tours,
        contract: s.contract ?? null,
      });
      if (actErr) throw new Error(`Activity ${p.code}: ${actErr.message}`);
    }
  }

  const allCodes = new Map(prospectIds.map((x) => [x.code, x.id]));

  for (const c of CALENDAR_EXTRA) {
    const prospect = c.prospect_code ? allCodes.get(c.prospect_code) : null;
    if (c.prospect_code && !prospect) continue;
    const { error } = await sb.from("calendar_entries").insert({
      id: randomUUID(),
      user_id: userId,
      prospect_id: prospect ?? null,
      type: c.type,
      entry_date: c.entry_date,
      note: c.note ?? null,
      source: "seed-eduardo",
    });
    if (error) throw new Error(`Cal extra: ${error.message}`);
  }

  for (const a of ACTIVITIES_EXTRA) {
    const prospect = a.prospect_code ? allCodes.get(a.prospect_code) : null;
    if (a.prospect_code && !prospect) continue;
    const { error } = await sb.from("activities").insert({
      id: randomUUID(),
      user_id: userId,
      prospect_id: prospect ?? null,
      type: a.type,
      title: a.title ?? null,
      note: a.note ?? null,
      activity_date: a.activity_date,
      source: "seed-eduardo",
    });
    if (error) throw new Error(`Activity extra: ${error.message}`);
  }

  const year = 2026;
  for (const month of [0, 1, 2, 3, 4, 5]) {
    const { error } = await sb.from("goals").upsert({
      user_id: userId,
      year,
      month,
      vol: 50000 + month * 8000,
      tours: 6 + month,
      ventas: 2 + Math.floor(month / 2),
      dias: 18 + month,
      descansos: 3,
    }, { onConflict: "user_id,year,month" });
    if (error) throw new Error(`Goal ${month}: ${error.message}`);
  }

  console.log(`\n=== Listo: ${toInsert.length} expediente(s) nuevos ===`);
  console.log("Tablas pobladas: prospects, sales, calendar_entries, activities, tool_calculations, goals\n");
}

main().catch((err) => {
  console.error("\nError:", err.message ?? err);
  process.exit(1);
});
