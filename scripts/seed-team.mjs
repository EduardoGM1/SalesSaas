/**
 * Seed SOLO DESARROLLO/STAGING — NUNCA ejecutar contra producción sin confirmación.
 *
 * Crea 10 vendedores + 1 gerente + 1 grupo + expedientes mínimos + chat grupal.
 * Usa Admin API (createUser), no inserts directos en auth.users.
 *
 * Requiere en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso:
 *   npm run seed:team
 *   npm run seed:team -- --reset   (borra usuarios @test.saletse.com y recrea)
 *
 * Contraseña común de prueba: TeamTest1234!
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dir = dirname(fileURLToPath(import.meta.url));
const TEAM_DOMAIN = "test.saletse.com";
const TEAM_PASSWORD = "TeamTest1234!";
const DEFAULT_ORG_ID = "b0000000-0000-4000-8000-000000000001";
const ROLE_VENDEDOR = "a0000000-0000-4000-8000-000000000003";
const ROLE_GERENTE = "a0000000-0000-4000-8000-000000000005";
const GROUP_NAME = "Equipo Demo Norte";

/** @type {import('@supabase/supabase-js').SupabaseClient} */
let sb;

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
    /* opcional */
  }
}

async function findTeamUserIds() {
  const ids = [];
  let page = 1;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email?.endsWith(`@${TEAM_DOMAIN}`)) ids.push(u.id);
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return ids;
}

async function deleteTeamUsers() {
  const ids = await findTeamUserIds();
  for (const id of ids) {
    await sb.from("grupo_miembros").delete().eq("usuario_id", id);
    await sb.from("grupos").delete().eq("gerente_id", id);
    await sb.from("activities").delete().eq("user_id", id);
    await sb.from("calendar_entries").delete().eq("user_id", id);
    await sb.from("sales").delete().eq("user_id", id);
    await sb.from("tool_calculations").delete().eq("user_id", id);
    await sb.from("goals").delete().eq("user_id", id);
    await sb.from("prospects").delete().eq("user_id", id);
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) console.warn(`  No se pudo borrar ${id}: ${error.message}`);
    else console.log(`  Borrado ${id.slice(0, 8)}…`);
  }
  // Limpiar grupo huérfano por nombre
  await sb.from("grupos").delete().eq("nombre", GROUP_NAME);
}

async function ensureUser({ email, fullName, roleSlug, phone }) {
  const roleId = roleSlug === "gerente" ? ROLE_GERENTE : ROLE_VENDEDOR;
  // profiles.role legacy sigue vendedor/admin; RBAC real va en role_id
  const legacyRole = roleSlug === "admin" ? "admin" : "vendedor";

  let page = 1;
  let existing = null;
  while (!existing) {
    const { data: listed } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    existing = listed?.users.find((u) => u.email === email) || null;
    if (!listed?.users?.length || listed.users.length < 200) break;
    page += 1;
  }

  if (existing) {
    console.log(`  Usuario existente: ${email}`);
    await sb.from("profiles").update({
      full_name: fullName,
      role: legacyRole,
      role_id: roleId,
      phone,
      email,
    }).eq("id", existing.id);
    try {
      await sb.rpc("sync_profile_legacy_permissions", { p_user_id: existing.id });
    } catch { /* opcional */ }
    return existing.id;
  }

  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: TEAM_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`Crear ${email}: ${error.message}`);

  await sb.from("profiles").update({
    full_name: fullName,
    role: legacyRole,
    role_id: roleId,
    phone,
    email,
  }).eq("id", data.user.id);
  try {
    await sb.rpc("sync_profile_legacy_permissions", { p_user_id: data.user.id });
  } catch { /* opcional */ }
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

function isoDay(offsetDays) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function seedMinimalProspects(userId, vendorIndex) {
  await clearVendorData(userId);
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;

  const prospects = [
    {
      code: `TEAM-V${String(vendorIndex).padStart(2, "0")}-A`,
      name: `Cliente A Vendedor ${vendorIndex}`,
      name1: `Prospecto ${vendorIndex}A`,
      status: "venta",
      tour_date: isoDay(-3 - vendorIndex),
      vol: 18000 + vendorIndex * 1500,
      tours: 1,
    },
    {
      code: `TEAM-V${String(vendorIndex).padStart(2, "0")}-B`,
      name: `Cliente B Vendedor ${vendorIndex}`,
      name1: `Prospecto ${vendorIndex}B`,
      status: "bback",
      tour_date: isoDay(-1),
      vol: 9000 + vendorIndex * 400,
      tours: 1,
    },
  ];

  for (const p of prospects) {
    const id = randomUUID();
    const { error: pErr } = await sb.from("prospects").insert({
      id,
      user_id: userId,
      prospect_code: p.code,
      name: p.name,
      name1: p.name1,
      city: "Cancún",
      country: "México",
      status: p.status,
      tour_date: p.tour_date,
      completed: p.status === "venta",
      quick_expedient: false,
    });
    if (pErr) throw new Error(`Prospect ${p.code}: ${pErr.message}`);

    const { error: sErr } = await sb.from("sales").insert({
      id: randomUUID(),
      user_id: userId,
      prospect_id: id,
      sale_date: p.tour_date < monthStart ? monthStart : p.tour_date,
      vol: p.vol,
      tours: p.tours,
      contract: p.code,
      status: p.status === "venta" ? "venta" : "bback",
    });
    if (sErr) throw new Error(`Sale ${p.code}: ${sErr.message}`);
  }

  await sb.from("goals").upsert({
    user_id: userId,
    year: y,
    month: m,
    vol: 80000,
    tours: 10,
    ventas: 4,
    dias: 20,
    descansos: 2,
  }, { onConflict: "user_id,year,month" });
}

async function ensureGroup(gerenteId, memberIds) {
  const { data: existing } = await sb
    .from("grupos")
    .select("id")
    .eq("nombre", GROUP_NAME)
    .eq("gerente_id", gerenteId)
    .maybeSingle();

  let groupId = existing?.id;
  if (!groupId) {
    const { data, error } = await sb.from("grupos").insert({
      organizacion_id: DEFAULT_ORG_ID,
      nombre: GROUP_NAME,
      gerente_id: gerenteId,
    }).select("id").single();
    if (error) throw new Error(`Crear grupo: ${error.message}`);
    groupId = data.id;
    console.log(`  Grupo creado: ${GROUP_NAME} (${groupId})`);
  } else {
    console.log(`  Grupo existente: ${GROUP_NAME}`);
    await sb.from("grupo_miembros").delete().eq("grupo_id", groupId);
  }

  const rows = memberIds.map((usuario_id) => ({ grupo_id: groupId, usuario_id }));
  const { error: mErr } = await sb.from("grupo_miembros").insert(rows);
  if (mErr) throw new Error(`Miembros: ${mErr.message}`);

  const { data: convId, error: syncErr } = await sb.rpc("sync_grupo_chat", { p_grupo_id: groupId });
  if (!syncErr && convId) {
    console.log(`  Chat grupal sincronizado: ${convId}`);
    return groupId;
  }

  console.warn(`  Aviso sync_grupo_chat: ${syncErr?.message || "sin RPC"} — creando chat vía Admin API…`);
  // Fallback si 0052 aún no está en el remoto
  let conversationId = null;
  const { data: existingConv } = await sb
    .from("chat_conversations")
    .select("id")
    .eq("grupo_id", groupId)
    .maybeSingle();
  if (existingConv?.id) {
    conversationId = existingConv.id;
    await sb.from("chat_conversations").update({ name: GROUP_NAME }).eq("id", conversationId);
  } else {
    const { data: created, error: cErr } = await sb.from("chat_conversations").insert({
      kind: "group",
      name: GROUP_NAME,
      grupo_id: groupId,
      created_by: gerenteId,
    }).select("id").single();
    if (cErr) {
      console.warn(`  No se pudo crear chat_conversations (aplica migración 0052): ${cErr.message}`);
      return groupId;
    }
    conversationId = created.id;
  }
  const participantIds = [gerenteId, ...memberIds];
  await sb.from("chat_participants").delete().eq("conversation_id", conversationId);
  const { error: pErr } = await sb.from("chat_participants").insert(
    participantIds.map((user_id) => ({ conversation_id: conversationId, user_id })),
  );
  if (pErr) console.warn(`  Participantes chat: ${pErr.message}`);
  else console.log(`  Chat grupal creado: ${conversationId}`);
  return groupId;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const reset = process.argv.includes("--reset");

  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }

  console.log("\n⚠️  seed:team — SOLO desarrollo/staging. No usar en producción.\n");

  sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  if (reset) {
    console.log("Modo --reset: eliminando usuarios @test.saletse.com…");
    await deleteTeamUsers();
  }

  const gerente = {
    email: `gerente01@${TEAM_DOMAIN}`,
    fullName: "Gerente Demo Norte",
    roleSlug: "gerente",
    phone: "+52 998 555 0100",
  };

  console.log(`\n→ Gerente (${gerente.email})`);
  const gerenteId = await ensureUser(gerente);
  await seedMinimalProspects(gerenteId, 0);

  const vendorIds = [];
  for (let i = 1; i <= 10; i += 1) {
    const email = `vendedor${String(i).padStart(2, "0")}@${TEAM_DOMAIN}`;
    console.log(`\n→ Vendedor ${i} (${email})`);
    const id = await ensureUser({
      email,
      fullName: `Vendedor Demo ${String(i).padStart(2, "0")}`,
      roleSlug: "vendedor",
      phone: `+52 998 555 ${String(100 + i).padStart(4, "0")}`,
    });
    vendorIds.push(id);
    await seedMinimalProspects(id, i);
  }

  console.log(`\n→ Grupo ${GROUP_NAME}`);
  await ensureGroup(gerenteId, vendorIds);

  console.log("\n=== Listo (dev/staging) ===");
  console.log(`\nContraseña de todos: ${TEAM_PASSWORD}`);
  console.log(`  Gerente:  ${gerente.email}`);
  console.log(`  Vendedor ejemplo: vendedor01@${TEAM_DOMAIN}`);
  console.log("\nPrueba: inicia sesión como gerente → /team y Mensajes (chat de equipo).\n");
}

main().catch((err) => {
  console.error("\nError:", err.message ?? err);
  process.exit(1);
});
