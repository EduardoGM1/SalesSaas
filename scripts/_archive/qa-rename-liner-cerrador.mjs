/**
 * QA: renombrar Liner/Cerrador sin perder módulos ni asignaciones.
 * Uso: node scripts/qa-rename-liner-cerrador.mjs
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const path = resolve(__dir, "../.env.local");
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
}

async function flagsForRole(client, roleId) {
  const { rows } = await client.query(
    `
    select f.clave
    from public.roles r
    join public.paquete_flags pf on pf.paquete_id = r.paquete_id and pf.activo = true
    join public.flags f on f.id = pf.flag_id
    where r.id = $1
    order by f.clave
    `,
    [roleId],
  );
  return rows.map((r) => r.clave);
}

async function membersForRole(client, roleId) {
  const { rows } = await client.query(
    `
    select workspace_id, usuario_id
    from public.workspace_miembros
    where role_id = $1
    order by workspace_id, usuario_id
    `,
    [roleId],
  );
  return rows.map((r) => `${r.workspace_id}:${r.usuario_id}`);
}

async function renameAndCheck(client, slug, newName) {
  const { rows: roles } = await client.query(
    `
    select r.id, r.nombre, r.slug, r.paquete_id, r.empresa_id, e.nombre as empresa
    from public.roles r
    join public.empresas e on e.id = r.empresa_id
    where r.slug = $1 and r.es_sistema = true
    order by e.nombre
    limit 1
    `,
    [slug],
  );
  if (!roles.length) {
    return { ok: false, reason: `No hay rol ${slug} de sistema en DB` };
  }
  const role = roles[0];
  const beforeFlags = await flagsForRole(client, role.id);
  const beforeMembers = await membersForRole(client, role.id);
  const beforeSlug = role.slug;
  const beforePaquete = role.paquete_id;
  const oldName = role.nombre;

  console.log(`\n=== ${slug} @ ${role.empresa} ===`);
  console.log("antes:", { id: role.id, nombre: oldName, slug: beforeSlug, flags: beforeFlags.length, members: beforeMembers.length });
  console.log("flags:", beforeFlags.join(", ") || "(ninguno)");

  // Simula el UPDATE parcial que debería hacer el PATCH de solo nombre
  await client.query(`update public.roles set nombre = $1 where id = $2`, [newName, role.id]);

  const { rows: afterRows } = await client.query(
    `select id, nombre, slug, paquete_id from public.roles where id = $1`,
    [role.id],
  );
  const after = afterRows[0];
  const afterFlags = await flagsForRole(client, role.id);
  const afterMembers = await membersForRole(client, role.id);

  const slugOk = after.slug === beforeSlug;
  const paqueteOk = after.paquete_id === beforePaquete;
  const flagsOk = JSON.stringify(afterFlags) === JSON.stringify(beforeFlags);
  const membersOk = JSON.stringify(afterMembers) === JSON.stringify(beforeMembers);
  const nameOk = after.nombre === newName;

  // Restaurar nombre original para no dejar basura (salvo que quieras dejarlo)
  await client.query(`update public.roles set nombre = $1 where id = $2`, [oldName, role.id]);

  const ok = slugOk && paqueteOk && flagsOk && membersOk && nameOk;
  console.log("después (antes de restaurar):", {
    nombre: after.nombre,
    slug: after.slug,
    flags: afterFlags.length,
    members: afterMembers.length,
  });
  console.log("checks:", { nameOk, slugOk, paqueteOk, flagsOk, membersOk, ok: ok ? "✅" : "❌" });

  return {
    ok,
    roleId: role.id,
    empresa: role.empresa,
    beforeFlags,
    afterFlags,
    slugOk,
    paqueteOk,
    flagsOk,
    membersOk,
    nameOk,
  };
}

/** Simula el bug UI: PATCH con flag_keys vacíos (si el form no hidrata bien). */
async function simulateBuggyUiRename(client, slug) {
  const { rows } = await client.query(
    `
    select r.id, r.nombre, r.slug, r.paquete_id, r.empresa_id
    from public.roles r
    where r.slug = $1 and r.es_sistema = true
    limit 1
    `,
    [slug],
  );
  if (!rows.length) return { ok: true, skipped: true };
  const role = rows[0];
  const before = await flagsForRole(client, role.id);

  // Igual que replacePackageFlags con lista vacía
  await client.query("begin");
  try {
    await client.query(`update public.roles set nombre = $1 where id = $2`, [`QA-TMP-${slug}`, role.id]);
    await client.query(`delete from public.paquete_flags where paquete_id = $1`, [role.paquete_id]);
    const afterWipe = await flagsForRole(client, role.id);
    await client.query("rollback");
    return {
      ok: afterWipe.length === 0 && before.length > 0,
      wouldWipe: afterWipe.length === 0 && before.length > 0,
      beforeCount: before.length,
      message: afterWipe.length === 0 && before.length > 0
        ? "❌ BUG CONFIRMADO: enviar flag_keys=[] al renombrar BORRA los módulos"
        : "✅ wipe vacío no aplica (sin flags previos)",
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

async function main() {
  loadEnvLocal();
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const liner = await renameAndCheck(client, "liner", "Asesor Inicial QA");
    const cerrador = await renameAndCheck(client, "cerrador", "Closer QA");
    const wipeRisk = await simulateBuggyUiRename(client, "liner");

    // Simular PATCH seguro: solo nombre (como UI corregida) — flags intactos
    const { rows: linerRow } = await client.query(
      `select id, nombre, paquete_id from public.roles where slug='liner' and es_sistema limit 1`,
    );
    if (linerRow[0]) {
      const before = await flagsForRole(client, linerRow[0].id);
      await client.query(`update public.roles set nombre = $1 where id = $2`, ["Asesor Inicial", linerRow[0].id]);
      const after = await flagsForRole(client, linerRow[0].id);
      const safeOk = JSON.stringify(before) === JSON.stringify(after);
      console.log("\nPATCH seguro (solo nombre → Asesor Inicial):", safeOk ? "✅ flags intactos" : "❌");
      // dejar nombre de prueba visible en UNA empresa para UI; restaurar luego
      await client.query(`update public.roles set nombre = $1 where id = $2`, [linerRow[0].nombre, linerRow[0].id]);
    }

    console.log("\n========== RESUMEN ==========");
    console.log("Rename parcial (solo nombre) Liner:", liner.ok ? "✅" : "❌", liner.reason || "");
    console.log("Rename parcial (solo nombre) Cerrador:", cerrador.ok ? "✅" : "❌", cerrador.reason || "");
    console.log("Riesgo UI flag_keys=[] (antes del fix):", wipeRisk.message || wipeRisk);
    console.log("Mitigación: UI omite flag_keys si no cambian; API ignora sets iguales y rechaza [] en sistema.");

    // Listar cómo se vería flag_keys en listTenantRoles (join actual)
    const { rows: sample } = await client.query(`
      select r.slug, r.nombre,
        coalesce(array_agg(f.clave order by f.clave) filter (where pf.activo = true), '{}') as flag_keys
      from public.roles r
      left join public.paquete_flags pf on pf.paquete_id = r.paquete_id
      left join public.flags f on f.id = pf.flag_id
      where r.slug in ('liner','cerrador') and r.es_sistema
      group by r.id, r.slug, r.nombre
      order by r.slug, r.nombre
      limit 6
    `);
    console.log("\nflag_keys actuales (muestra):");
    for (const row of sample) {
      console.log(`- ${row.slug} "${row.nombre}": ${row.flag_keys.length} → ${row.flag_keys.join(", ")}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
