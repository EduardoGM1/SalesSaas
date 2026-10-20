/**
 * Golden master — resolveEntryClientId (puro).
 * Pasa idéntico antes/después del move a modulos/agenda.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");
const MOD = resolve(HERE, "resolve-entry-client.ts");
const LEGACY = resolve(WEB_SRC, "lib/clients/resolve-entry-client.ts");
const OUT = resolve(HERE, ".tmp-resolve-entry.mjs");

async function load() {
  const entry = fs.existsSync(MOD) ? MOD : LEGACY;
  const aliasRoot = WEB_SRC.replace(/\\/g, "/");
  execSync(
    [
      "npx --yes esbuild",
      `"${entry.replace(/\\/g, "/")}"`,
      "--bundle",
      "--format=esm",
      "--platform=neutral",
      `--outfile="${OUT.replace(/\\/g, "/")}"`,
      `--alias:@=${aliasRoot}`,
      "--log-level=error",
    ].join(" "),
    { stdio: "pipe" },
  );
  return import(pathToFileURL(OUT).href + `?t=${Date.now()}`);
}

function dbFixture() {
  return {
    clients: {
      c1: { id: "c1", name: "Ana" },
      c2: { id: "c2", name: "Bob" },
      c3: { id: "c3", name: "ex", sales: [{ saleId: "s-orphan", clientId: "gone" }] },
    },
  };
}

test("null / vacío → null", async () => {
  const { resolveEntryClientId } = await load();
  const db = dbFixture();
  assert.equal(resolveEntryClientId(db, {}), null);
  assert.equal(resolveEntryClientId(db, { clientId: "" }), null);
  assert.equal(resolveEntryClientId(db, { clientId: "missing" }), null);
});

test("clientId directo gana", async () => {
  const { resolveEntryClientId } = await load();
  const db = dbFixture();
  assert.equal(resolveEntryClientId(db, { clientId: "c1", prospectId: "c2" }), "c1");
});

test("prospectId si no hay clientId válido", async () => {
  const { resolveEntryClientId } = await load();
  const db = dbFixture();
  assert.equal(resolveEntryClientId(db, { prospectId: "c2" }), "c2");
  assert.equal(resolveEntryClientId(db, { clientId: "x", prospectId: "c2" }), "c2");
});

test("saleId → findSaleById → clientId / formerClientId", async () => {
  const { resolveEntryClientId } = await load();
  const db = {
    clients: {
      owner: {
        id: "owner",
        sales: [{ saleId: "sale-1", clientId: "owner" }],
      },
      former: {
        id: "former",
        sales: [{ saleId: "sale-2", clientId: "gone", formerClientId: "former" }],
      },
    },
  };
  assert.equal(resolveEntryClientId(db, { saleId: "sale-1" }), "owner");
  assert.equal(resolveEntryClientId(db, { saleId: "sale-2" }), "former");
  assert.equal(resolveEntryClientId(db, { saleId: "nope" }), null);
});

test("clientId inválido + saleId válido", async () => {
  const { resolveEntryClientId } = await load();
  const db = {
    clients: {
      o: { id: "o", sales: [{ saleId: "s", clientId: "o" }] },
    },
  };
  assert.equal(resolveEntryClientId(db, { clientId: "x", saleId: "s" }), "o");
});
