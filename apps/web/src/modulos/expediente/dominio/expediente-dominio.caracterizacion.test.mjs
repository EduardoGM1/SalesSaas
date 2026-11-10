/**
 * Caracterización del dominio puro de expediente, antes de moverlo.
 * Mismos nombres y mismos resultados después del move.
 * Carga el módulo si ya existe; si no, los archivos legacy.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");

function firstExisting(paths) {
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  throw new Error(`no está el dominio: ${paths.join(" | ")}`);
}

async function loadTs(entry, outfile) {
  const aliasRoot = WEB_SRC.replace(/\\/g, "/");
  execSync(
    [
      "npx --yes esbuild",
      `"${entry.replace(/\\/g, "/")}"`,
      "--bundle",
      "--format=esm",
      "--platform=neutral",
      `--outfile="${outfile.replace(/\\/g, "/")}"`,
      `--alias:@=${aliasRoot}`,
      "--log-level=error",
    ].join(" "),
    { stdio: "pipe" },
  );
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
}

const identidadEntry = firstExisting([
  resolve(WEB_SRC, "modulos/expediente/dominio/identidad-prospecto.ts"),
  resolve(WEB_SRC, "lib/clients.ts"),
]);
const compartidoEntry = firstExisting([
  resolve(WEB_SRC, "modulos/expediente/dominio/prospecto-compartido.ts"),
  resolve(WEB_SRC, "lib/shared-prospect.ts"),
]);
const OUT_ID = resolve(HERE, ".tmp-identidad-prospecto.mjs");
const OUT_SH = resolve(HERE, ".tmp-prospecto-compartido.mjs");

let identidad;
let compartido;

test.before(async () => {
  identidad = await loadTs(identidadEntry, OUT_ID);
  compartido = await loadTs(compartidoEntry, OUT_SH);
});

test.after(() => {
  for (const f of [OUT_ID, OUT_SH]) {
    if (existsSync(f)) unlinkSync(f);
  }
});

test("ensureProspectIdentity completa id, prospectId y folio desde el id", () => {
  const row = identidad.ensureProspectIdentity({ id: "p123456789" });
  assert.equal(row.id, "p123456789");
  assert.equal(row.prospectId, "p123456789");
  assert.equal(row.prospectCode, "P-456789");
});

test("ensureProspectIdentity no pisa un folio ya presente", () => {
  const row = identidad.ensureProspectIdentity({
    id: "p123456789",
    prospectId: "propio",
    prospectCode: "P-111111",
  });
  assert.equal(row.prospectId, "propio");
  assert.equal(row.prospectCode, "P-111111");
});

test("clientDisplayName prefiere name1, luego name, luego Prospecto", () => {
  assert.equal(identidad.clientDisplayName({ name1: "Ana", name: "Ana López" }), "Ana");
  assert.equal(identidad.clientDisplayName({ name: "Ana López" }), "Ana López");
  assert.equal(identidad.clientDisplayName(undefined), "Prospecto");
  assert.equal(identidad.clientDisplayName({}), "Prospecto");
});

test("activeClients quita cerrado y perdido, ordena por alta y deja 10", () => {
  const clients = {};
  for (let i = 0; i < 12; i += 1) {
    clients[`c${i}`] = { id: `c${i}`, status: "venta", createdAt: i };
  }
  clients.cerrado = { id: "cerrado", status: "cerrado", createdAt: 100 };
  clients.perdido = { id: "perdido", status: "perdido", createdAt: 99 };
  const ids = identidad.activeClients(clients).map((c) => c.id);
  assert.deepEqual(ids, ["c11", "c10", "c9", "c8", "c7", "c6", "c5", "c4", "c3", "c2"]);
});

test("prospectRowToClient conserva la fila y el default de processing", () => {
  const client = compartido.prospectRowToClient(
    {
      id: "11111111-1111-4111-8111-111111111111",
      prospect_code: "P-000001",
      name1: "Ana",
      status: "venta",
      tour_date: "2026-11-09",
      created_at: "2026-11-09T12:00:00.000Z",
      quick_expedient: true,
      completed: false,
      tour_cuantificable: false,
      deleted_at: null,
    },
    {
      sales: [
        {
          id: "s1",
          sale_date: "2026-11-09",
          vol: 1500,
          tours: 0,
          status: "pendiente",
          created_at: "2026-11-09T12:00:00.000Z",
        },
        {
          id: "s2",
          sale_date: "2026-11-10",
          vol: 0,
          status: "venta",
          processing: "venta",
          created_at: "2026-11-10T12:00:00.000Z",
        },
      ],
      activities: [
        {
          id: "a1",
          type: "nota",
          created_at: "2026-11-09T12:00:00.000Z",
          note: "hola",
        },
      ],
      tools: { survey: { ok: true } },
    },
  );
  assert.equal(client.id, "11111111-1111-4111-8111-111111111111");
  assert.equal(client.prospectCode, "P-000001");
  assert.equal(client.name1, "Ana");
  assert.equal(client.tourDate, "2026-11-09");
  assert.equal(client.createdYmd, "2026-11-09");
  assert.equal(client.quickExpedient, true);
  assert.equal(client.completedExpedient, false);
  assert.equal(client.tour_cuantificable, false);
  assert.equal(client.deletedAt, null);
  assert.equal(client.createdAt, Date.parse("2026-11-09T12:00:00.000Z"));
  assert.equal(client.sales[0].processing, "pendiente");
  assert.equal(client.sales[0].tours, 1);
  assert.equal(client.sales[0].vol, 1500);
  assert.equal(client.sales[1].processing, "venta");
  assert.equal(client.sales[1].tours, 1);
  assert.equal(client.activities[0].note, "hola");
  assert.equal(client.activities[0].type, "nota");
  assert.deepEqual(client.data, { survey: { ok: true } });
});

test("permisos de expediente compartido", () => {
  for (const perm of ["owner", "edit", "workspace"]) {
    assert.equal(compartido.canEditShared(perm), true, perm);
  }
  assert.equal(compartido.canEditShared("view"), false);
  assert.equal(compartido.canEditShared("comment"), false);
  for (const perm of ["owner", "edit", "comment", "workspace"]) {
    assert.equal(compartido.canCommentShared(perm), true, perm);
  }
  assert.equal(compartido.canCommentShared("view"), false);
  assert.equal(compartido.canAddToWorkspace("edit"), true);
  assert.equal(compartido.canAddToWorkspace("workspace"), true);
  assert.equal(compartido.canAddToWorkspace("owner"), false);
  assert.equal(compartido.canAddToWorkspace(undefined), false);
});
