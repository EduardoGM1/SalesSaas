/**
 * Datos demo para probar el panel admin y la app completa.
 * Requiere SUPABASE_SERVICE_ROLE_KEY y NEXT_PUBLIC_SUPABASE_URL en .env.local
 *
 * Uso:
 *   npm run seed:demo
 *   npm run seed:demo -- --reset   (borra usuarios @demo.salesapp.test y recrea)
 *
 * Credenciales demo (todos los vendedores):
 *   Contraseña: Demo1234!
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dir = dirname(fileURLToPath(import.meta.url));
const DEMO_DOMAIN = "demo.salesapp.test";
const DEMO_PASSWORD = "Demo1234!";

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
  } catch {
    /* .env.local opcional si vars ya están en el entorno */
  }
}

function surveyData(overrides = {}) {
  return {
    nights: "5",
    total: "8500",
    hpct: "72",
    stype: "hotel",
    futureType: "real",
    svp_name1: "Roberto Mendoza",
    svp_country: "México",
    svp_occ1: "Ingeniero civil",
    svp_city: "Monterrey",
    sh1c: "Cancún", sh1y: "2023", sh1n: "5", sh1a: "7200",
    sh2c: "Los Cabos", sh2y: "2022", sh2n: "4", sh2a: "6800",
    sh3c: "Puerto Vallarta", sh3y: "2021", sh3n: "6", sh3a: "5400",
    sf1c: "Miami", sf1y: "2026", sf1n: "5", sf1a: "9000",
    sf2c: "Orlando", sf2y: "2027", sf2n: "4", sf2a: "7500",
    sf3c: "Las Vegas", sf3y: "2028", sf3n: "3", sf3a: "6200",
    ...overrides,
  };
}

function vacacionesData(overrides = {}) {
  return { vv: "2", vc: "4500", va: "18", vi: "7.5", ...overrides };
}

function worksheetData(overrides = {}) {
  return {
    wv: "28500", we: "30", wcc: "495", wob: "1200",
    ...WS_DEFAULTS,
    ...overrides,
  };
}

/** @type {import('@supabase/supabase-js').SupabaseClient} */
let sb;

async function findDemoUserIds() {
  const ids = [];
  let page = 1;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email?.endsWith(`@${DEMO_DOMAIN}`)) ids.push(u.id);
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return ids;
}

async function deleteDemoUsers() {
  const ids = await findDemoUserIds();
  for (const id of ids) {
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) console.warn(`  No se pudo borrar ${id}: ${error.message}`);
    else console.log(`  Borrado usuario demo ${id.slice(0, 8)}…`);
  }
}

async function ensureUser({ email, fullName, role, phone }) {
  const { data: listed } = await sb.auth.admin.listUsers({ perPage: 200 });
  const existing = listed?.users.find((u) => u.email === email);
  if (existing) {
    console.log(`  Usuario existente: ${email}`);
    await sb.from("profiles").update({ full_name: fullName, role, phone, email }).eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`Crear ${email}: ${error.message}`);

  await sb.from("profiles").update({ full_name: fullName, role, phone, email }).eq("id", data.user.id);
  console.log(`  Creado: ${email}`);
  return data.user.id;
}

async function clearVendorData(userId) {
  await sb.from("activities").delete().eq("user_id", userId);
  await sb.from("calendar_entries").delete().eq("user_id", userId);
  await sb.from("sales").delete().eq("user_id", userId);
  await sb.from("tool_calculations").delete().eq("user_id", userId);
  await sb.from("goals").delete().eq("user_id", userId);
  await sb.from("prospects").delete().eq("user_id", userId);
}

async function seedVendor(userId, vendor) {
  await clearVendorData(userId);
  const prospectIds = [];

  for (const p of vendor.prospects) {
    const prospectId = randomUUID();
    prospectIds.push({ id: prospectId, code: p.code, meta: p });

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
    const pid = prospectId;
    prospectIds[prospectIds.length - 1].id = pid;

    for (const tool of ["survey", "vacaciones", "worksheet"]) {
      const data = p.tools?.[tool];
      if (!data) continue;
      const { error } = await sb.from("tool_calculations").insert({
        user_id: userId,
        prospect_id: pid,
        tool,
        data,
      });
      if (error) throw new Error(`Tool ${tool} ${p.code}: ${error.message}`);
    }
  }

  const saleIdMap = new Map();
  for (const s of vendor.sales) {
    const prospect = prospectIds.find((x) => x.code === s.prospect_code);
    if (!prospect) continue;
    const saleId = randomUUID();
    const { error } = await sb.from("sales").insert({
      id: saleId,
      user_id: userId,
      prospect_id: prospect.id,
      sale_date: s.sale_date,
      vol: s.vol,
      tours: s.tours,
      contract: s.contract,
      status: s.status,
      process_date: s.process_date ?? null,
      note: s.note ?? null,
    });
    if (error) throw new Error(`Sale ${s.sale_date}: ${error.message}`);
    saleIdMap.set(`${s.prospect_code}:${s.sale_date}`, saleId);
  }

  for (const c of vendor.calendar) {
    const prospect = c.prospect_code
      ? prospectIds.find((x) => x.code === c.prospect_code)
      : null;
    const { error } = await sb.from("calendar_entries").insert({
      id: randomUUID(),
      user_id: userId,
      prospect_id: prospect?.id ?? null,
      sale_id: c.sale_key ? saleIdMap.get(c.sale_key) ?? null : null,
      type: c.type,
      entry_date: c.entry_date,
      note: c.note ?? null,
      vol: c.vol ?? null,
      tours: c.tours ?? null,
      contract: c.contract ?? null,
      source: c.source ?? "seed",
    });
    if (error) throw new Error(`Cal ${c.entry_date}: ${error.message}`);
  }

  for (const g of vendor.goals) {
    const { error } = await sb.from("goals").upsert({
      user_id: userId,
      year: g.year,
      month: g.month,
      vol: g.vol,
      tours: g.tours,
      ventas: g.ventas,
      dias: g.dias,
      descansos: g.descansos,
    }, { onConflict: "user_id,year,month" });
    if (error) throw new Error(`Goal ${g.year}-${g.month}: ${error.message}`);
  }

  for (const a of vendor.activities) {
    const prospect = a.prospect_code
      ? prospectIds.find((x) => x.code === a.prospect_code)
      : null;
    const { error } = await sb.from("activities").insert({
      id: randomUUID(),
      user_id: userId,
      prospect_id: prospect?.id ?? null,
      sale_id: a.sale_key ? saleIdMap.get(a.sale_key) ?? null : null,
      type: a.type,
      title: a.title ?? null,
      note: a.note ?? null,
      activity_date: a.activity_date,
      source: a.source ?? "seed",
      vol: a.vol ?? null,
      tours: a.tours ?? null,
      contract: a.contract ?? null,
    });
    if (error) throw new Error(`Activity ${a.activity_date}: ${error.message}`);
  }

  for (const tool of ["survey", "vacaciones", "worksheet"]) {
    const data = vendor.libre?.[tool];
    if (!data) continue;
    const { error } = await sb.from("tool_calculations").insert({
      user_id: userId,
      prospect_id: null,
      tool,
      data,
    });
    if (error) throw new Error(`Libre ${tool}: ${error.message}`);
  }
}

const VENDORS = [
  {
    email: `maria.garcia@${DEMO_DOMAIN}`,
    fullName: "María García",
    role: "vendedor",
    phone: "+52 81 1234 5601",
    prospects: [
      {
        code: "DEMO-MG-001",
        name: "Familia Mendoza",
        name1: "Roberto Mendoza",
        name2: "Laura Mendoza",
        occupation1: "Ingeniero civil",
        occupation2: "Contadora",
        city: "Monterrey",
        country: "México",
        phone: "+52 81 555 0101",
        email: "roberto.mendoza@email.test",
        contract: "MG-2026-0142",
        status: "venta",
        tour_date: "2026-01-15",
        process_date: "2026-01-20",
        process_amount: 28500,
        note: "Tour presencial. Interés alto en plan Premier.",
        completed: true,
        quick_expedient: false,
        tools: {
          survey: surveyData(),
          vacaciones: vacacionesData(),
          worksheet: worksheetData(),
        },
      },
      {
        code: "DEMO-MG-002",
        name: "Carlos & Patricia Ruiz",
        name1: "Carlos Ruiz",
        name2: "Patricia Ruiz",
        occupation1: "Empresario",
        occupation2: "Diseñadora",
        city: "Guadalajara",
        country: "México",
        phone: "+52 33 555 0202",
        email: "c.ruiz@email.test",
        contract: "MG-2026-0188",
        status: "procesable",
        tour_date: "2026-02-08",
        process_date: null,
        process_amount: 0,
        note: "Pendiente documentación de ingresos.",
        completed: false,
        quick_expedient: false,
        tools: {
          survey: surveyData({
            svp_name1: "Carlos Ruiz", 
            svp_city: "Guadalajara", total: "12000", hpct: "68",
            futureType: "dream",
          }),
          vacaciones: vacacionesData({ vc: "5200", va: "20", vi: "9" }),
          worksheet: worksheetData({ wv: "32000", we: "25", wcc: "595" }),
        },
      },
      {
        code: "DEMO-MG-003",
        name: "James & Susan Miller",
        name1: "James Miller",
        name2: "Susan Miller",
        occupation1: "Retired executive",
        occupation2: "Teacher",
        city: "Dallas",
        country: "Estados Unidos",
        phone: "+1 214 555 0303",
        email: "jmiller@email.test",
        contract: null,
        status: "bback",
        tour_date: "2026-03-22",
        process_date: null,
        process_amount: 0,
        note: "B-back programado para abril.",
        completed: false,
        quick_expedient: true,
        tools: {
          survey: surveyData({
            svp_name1: "James Miller", 
            svp_country: "Estados Unidos", svp_city: "Dallas",
            stype: "cruise", nights: "7", total: "15000",
          }),
          worksheet: worksheetData({ wv: "45000", we: "35", wob: "0" }),
        },
      },
    ],
    sales: [
      { prospect_code: "DEMO-MG-001", sale_date: "2026-01-15", vol: 28500, tours: 1, contract: "MG-2026-0142", status: "venta", process_date: "2026-01-20", note: "Cierre en sala" },
      { prospect_code: "DEMO-MG-001", sale_date: "2026-02-10", vol: 4200, tours: 0, contract: "MG-2026-0142-A", status: "procesado", note: "Upgrade habitación" },
      { prospect_code: "DEMO-MG-002", sale_date: "2026-02-08", vol: 22000, tours: 1, contract: "MG-2026-0188", status: "procesable", note: "En revisión legal" },
      { prospect_code: "DEMO-MG-003", sale_date: "2026-03-22", vol: 18500, tours: 1, contract: "MG-2026-0201", status: "bback", note: "Primera presentación" },
      { prospect_code: "DEMO-MG-001", sale_date: "2026-05-05", vol: 9800, tours: 0, contract: "MG-2026-0142-B", status: "cerrado", note: "Referido adicional" },
    ],
    calendar: [
      { type: "venta", entry_date: "2026-01-15", prospect_code: "DEMO-MG-001", vol: 28500, tours: 1, contract: "MG-2026-0142", sale_key: "DEMO-MG-001:2026-01-15", note: "Tour y cierre" },
      { type: "follow", entry_date: "2026-02-12", prospect_code: "DEMO-MG-002", note: "Llamada seguimiento documentos" },
      { type: "nota", entry_date: "2026-02-20", prospect_code: "DEMO-MG-002", note: "Cliente envió estados de cuenta parciales" },
      { type: "venta", entry_date: "2026-03-22", prospect_code: "DEMO-MG-003", vol: 18500, tours: 1, sale_key: "DEMO-MG-003:2026-03-22" },
      { type: "descanso", entry_date: "2026-04-01", note: "Día libre" },
      { type: "follow", entry_date: "2026-05-08", prospect_code: "DEMO-MG-003", note: "Confirmar fecha B-back" },
      { type: "venta", entry_date: "2026-05-05", prospect_code: "DEMO-MG-001", vol: 9800, sale_key: "DEMO-MG-001:2026-05-05" },
      { type: "nota", entry_date: "2026-06-02", note: "Reunión equipo ventas" },
    ],
    goals: [
      { year: 2026, month: 0, vol: 80000, tours: 12, ventas: 4, dias: 22, descansos: 4 },
      { year: 2026, month: 1, vol: 75000, tours: 10, ventas: 3, dias: 20, descansos: 3 },
      { year: 2026, month: 2, vol: 90000, tours: 14, ventas: 5, dias: 23, descansos: 2 },
      { year: 2026, month: 3, vol: 85000, tours: 11, ventas: 4, dias: 21, descansos: 3 },
      { year: 2026, month: 4, vol: 95000, tours: 15, ventas: 5, dias: 24, descansos: 2 },
      { year: 2026, month: 5, vol: 70000, tours: 9, ventas: 3, dias: 18, descansos: 4 },
    ],
    activities: [
      { type: "venta", prospect_code: "DEMO-MG-001", activity_date: "2026-01-15", title: "Venta cerrada", note: "Contrato MG-2026-0142 firmado", sale_key: "DEMO-MG-001:2026-01-15", vol: 28500, tours: 1, contract: "MG-2026-0142" },
      { type: "nota", prospect_code: "DEMO-MG-002", activity_date: "2026-02-09", title: "Nota", note: "Solicitar comprobante de domicilio" },
      { type: "follow", prospect_code: "DEMO-MG-002", activity_date: "2026-02-18", title: "Follow-up", note: "WhatsApp — documentos en trámite" },
      { type: "venta", prospect_code: "DEMO-MG-003", activity_date: "2026-03-22", title: "Primera venta", note: "B-back pendiente", sale_key: "DEMO-MG-003:2026-03-22", vol: 18500 },
      { type: "nota", activity_date: "2026-04-15", title: "Capacitación", note: "Sesión producto nuevo Premier Plus" },
      { type: "follow", prospect_code: "DEMO-MG-003", activity_date: "2026-05-10", title: "Follow-up B-back", note: "Agendado para 2026-06-12" },
    ],
    libre: {
      survey: surveyData({ svp_name1: "Calculadora libre", svp_city: "Monterrey", total: "5000" }),
      vacaciones: vacacionesData({ vv: "1", vc: "2500", va: "10" }),
      worksheet: worksheetData({ wv: "15000", we: "20", wcc: "350" }),
    },
  },
  {
    email: `carlos.lopez@${DEMO_DOMAIN}`,
    fullName: "Carlos López",
    role: "vendedor",
    phone: "+52 55 9876 4402",
    prospects: [
      {
        code: "DEMO-CL-001",
        name: "Fernando & Elena Vargas",
        name1: "Fernando Vargas",
        name2: "Elena Vargas",
        occupation1: "Médico",
        occupation2: "Enfermera",
        city: "Ciudad de México",
        country: "México",
        phone: "+52 55 555 1101",
        email: "f.vargas@email.test",
        contract: "CL-2026-0099",
        status: "venta",
        tour_date: "2026-02-20",
        process_date: "2026-02-25",
        process_amount: 35000,
        note: "Pareja joven, alta capacidad de pago.",
        completed: true,
        tools: {
          survey: surveyData({ svp_name1: "Fernando Vargas", svp_city: "Ciudad de México", total: "9500" }),
          vacaciones: vacacionesData({ vc: "3800", va: "15" }),
          worksheet: worksheetData({ wv: "35000", we: "28" }),
        },
      },
      {
        code: "DEMO-CL-002",
        name: "Michael Thompson",
        name1: "Michael Thompson",
        name2: "Sarah Thompson",
        occupation1: "Software engineer",
        occupation2: "Marketing manager",
        city: "Austin",
        country: "Estados Unidos",
        phone: "+1 512 555 2202",
        email: "mthompson@email.test",
        contract: null,
        status: "no-procesable",
        tour_date: "2026-04-10",
        process_date: null,
        process_amount: 0,
        note: "Crédito no aprobado — perdido por ahora.",
        completed: false,
        tools: {
          survey: surveyData({ svp_name1: "Michael Thompson", svp_country: "Estados Unidos", stype: "airbnb", total: "11000" }),
          worksheet: worksheetData({ wv: "28000", we: "30", wob: "2500" }),
        },
      },
    ],
    sales: [
      { prospect_code: "DEMO-CL-001", sale_date: "2026-02-20", vol: 35000, tours: 1, contract: "CL-2026-0099", status: "venta", process_date: "2026-02-25" },
      { prospect_code: "DEMO-CL-001", sale_date: "2026-04-02", vol: 5500, tours: 0, contract: "CL-2026-0099-A", status: "procesado", note: "Puntos extra" },
      { prospect_code: "DEMO-CL-002", sale_date: "2026-04-10", vol: 12000, tours: 1, contract: "CL-2026-0155", status: "no-procesable", note: "No califica" },
    ],
    calendar: [
      { type: "venta", entry_date: "2026-02-20", prospect_code: "DEMO-CL-001", vol: 35000, tours: 1, sale_key: "DEMO-CL-001:2026-02-20" },
      { type: "nota", entry_date: "2026-03-05", prospect_code: "DEMO-CL-001", note: "Entrega welcome kit" },
      { type: "venta", entry_date: "2026-04-10", prospect_code: "DEMO-CL-002", vol: 12000, tours: 1, sale_key: "DEMO-CL-002:2026-04-10" },
      { type: "descanso", entry_date: "2026-04-14", note: "Vacaciones personales" },
      { type: "follow", entry_date: "2026-05-20", prospect_code: "DEMO-CL-002", note: "Recontacto en 6 meses" },
    ],
    goals: [
      { year: 2026, month: 1, vol: 60000, tours: 8, ventas: 3, dias: 19, descansos: 3 },
      { year: 2026, month: 2, vol: 72000, tours: 10, ventas: 4, dias: 21, descansos: 2 },
      { year: 2026, month: 3, vol: 68000, tours: 9, ventas: 3, dias: 20, descansos: 3 },
      { year: 2026, month: 4, vol: 55000, tours: 7, ventas: 2, dias: 18, descansos: 4 },
      { year: 2026, month: 5, vol: 80000, tours: 11, ventas: 4, dias: 22, descansos: 2 },
    ],
    activities: [
      { type: "venta", prospect_code: "DEMO-CL-001", activity_date: "2026-02-20", title: "Venta", vol: 35000, sale_key: "DEMO-CL-001:2026-02-20", contract: "CL-2026-0099" },
      { type: "nota", prospect_code: "DEMO-CL-001", activity_date: "2026-03-01", title: "Post-venta", note: "Cliente satisfecho con presentación" },
      { type: "venta", prospect_code: "DEMO-CL-002", activity_date: "2026-04-10", title: "Tour sin cierre", vol: 12000, sale_key: "DEMO-CL-002:2026-04-10" },
      { type: "nota", activity_date: "2026-05-01", title: "Operaciones", note: "Actualización lista precios Q2" },
    ],
    libre: {
      worksheet: worksheetData({ wv: "22000", we: "25", wcc: "450" }),
    },
  },
  {
    email: `ana.martinez@${DEMO_DOMAIN}`,
    fullName: "Ana Martínez",
    role: "gerente",
    phone: "+52 33 4567 8803",
    prospects: [
      {
        code: "DEMO-AM-001",
        name: "Ricardo & Gloria Herrera",
        name1: "Ricardo Herrera",
        name2: "Gloria Herrera",
        occupation1: "Abogado",
        occupation2: "Arquitecta",
        city: "Querétaro",
        country: "México",
        phone: "+52 442 555 3301",
        email: "rherrera@email.test",
        contract: "AM-2026-0077",
        status: "perdido",
        tour_date: "2026-03-05",
        process_date: null,
        process_amount: 0,
        note: "Decidieron posponer compra 12 meses.",
        completed: false,
        tools: {
          survey: surveyData({ svp_name1: "Ricardo Herrera", svp_city: "Querétaro" }),
          vacaciones: vacacionesData(),
          worksheet: worksheetData({ wv: "40000", we: "32" }),
        },
      },
      {
        code: "DEMO-AM-002",
        name: "David & Emma Wilson",
        name1: "David Wilson",
        name2: "Emma Wilson",
        occupation1: "Financial advisor",
        occupation2: "Real estate agent",
        city: "Phoenix",
        country: "Estados Unidos",
        phone: "+1 602 555 4402",
        email: "dwilson@email.test",
        contract: "AM-2026-0110",
        status: "procesado",
        tour_date: "2026-05-18",
        process_date: "2026-05-25",
        process_amount: 52000,
        note: "Expediente completo en procesamiento.",
        completed: true,
        tools: {
          survey: surveyData({ svp_name1: "David Wilson", svp_country: "Estados Unidos", total: "14000", hpct: "80" }),
          worksheet: worksheetData({ wv: "52000", we: "35", wcc: "695", wob: "0" }),
        },
      },
    ],
    sales: [
      { prospect_code: "DEMO-AM-001", sale_date: "2026-03-05", vol: 16000, tours: 1, contract: "AM-2026-0077", status: "perdido", note: "No cerró" },
      { prospect_code: "DEMO-AM-002", sale_date: "2026-05-18", vol: 52000, tours: 1, contract: "AM-2026-0110", status: "procesado", process_date: "2026-05-25" },
    ],
    calendar: [
      { type: "venta", entry_date: "2026-03-05", prospect_code: "DEMO-AM-001", vol: 16000, tours: 1, sale_key: "DEMO-AM-001:2026-03-05" },
      { type: "nota", entry_date: "2026-04-01", note: "Revisión metas equipo Q1" },
      { type: "venta", entry_date: "2026-05-18", prospect_code: "DEMO-AM-002", vol: 52000, tours: 1, sale_key: "DEMO-AM-002:2026-05-18" },
      { type: "follow", entry_date: "2026-06-01", prospect_code: "DEMO-AM-002", note: "Seguimiento post-procesamiento" },
    ],
    goals: [
      { year: 2026, month: 2, vol: 50000, tours: 6, ventas: 2, dias: 15, descansos: 2 },
      { year: 2026, month: 3, vol: 45000, tours: 5, ventas: 2, dias: 14, descansos: 3 },
      { year: 2026, month: 4, vol: 55000, tours: 7, ventas: 3, dias: 16, descansos: 2 },
      { year: 2026, month: 5, vol: 65000, tours: 8, ventas: 3, dias: 17, descansos: 2 },
    ],
    activities: [
      { type: "venta", prospect_code: "DEMO-AM-001", activity_date: "2026-03-05", title: "Tour", vol: 16000, sale_key: "DEMO-AM-001:2026-03-05" },
      { type: "nota", activity_date: "2026-04-10", title: "Gerencia", note: "Coaching con María García" },
      { type: "venta", prospect_code: "DEMO-AM-002", activity_date: "2026-05-18", title: "Venta procesada", vol: 52000, sale_key: "DEMO-AM-002:2026-05-18", contract: "AM-2026-0110" },
    ],
    libre: {
      survey: surveyData({ total: "7000", svp_name1: "Ana — libre" }),
    },
  },
];

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const reset = process.argv.includes("--reset");

  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }

  sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log("\n=== Seed demo SalesApp ===\n");

  if (reset) {
    console.log("Modo --reset: eliminando usuarios demo…");
    await deleteDemoUsers();
  }

  for (const vendor of VENDORS) {
    console.log(`\n→ ${vendor.fullName} (${vendor.email})`);
    const userId = await ensureUser(vendor);
    await seedVendor(userId, vendor);
    console.log(`  Datos insertados: ${vendor.prospects.length} expedientes`);
  }

  console.log("\n=== Listo ===");
  console.log(`\nUsuarios demo (@${DEMO_DOMAIN}):`);
  console.log(`  Contraseña: ${DEMO_PASSWORD}`);
  for (const v of VENDORS) {
    console.log(`  • ${v.email} — ${v.role}`);
  }
  console.log("\nInicia sesión con cualquiera para ver sus datos, o entra como admin a /admin.\n");
}

main().catch((err) => {
  console.error("\nError:", err.message ?? err);
  process.exit(1);
});
