/**
 * Diagnóstico de roles duplicados visibles en Admin → Roles.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
function loadEnvLocal() {
  for (const line of readFileSync(resolve(__dir, "../.env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
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
    const { rows } = await client.query(`
      select r.slug, r.nombre, r.es_sistema, r.scope,
        case when r.empresa_id is null then 'plataforma' else 'tenant' end as capa,
        r.empresa_id, e.nombre as empresa, r.id
      from public.roles r
      left join public.empresas e on e.id = r.empresa_id
      where r.slug in ('liner','cerrador','gerente','vendedor','admin','superadmin','soporte','recepcion')
      order by r.slug, r.empresa_id nulls first, r.nombre
    `);
    console.log("Total filas:", rows.length);
    for (const r of rows) {
      console.log(`${r.capa.padEnd(10)} ${r.slug.padEnd(12)} ${String(r.nombre).padEnd(16)} es_sistema=${r.es_sistema} empresa=${r.empresa || "-"}`);
    }
    const { rows: allAdmin } = await client.query(`
      select count(*)::int as n from public.roles
    `);
    const { rows: platform } = await client.query(`
      select count(*)::int as n from public.roles where empresa_id is null
    `);
    console.log("\nroles totales:", allAdmin[0].n, "| plataforma (empresa_id null):", platform[0].n);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
