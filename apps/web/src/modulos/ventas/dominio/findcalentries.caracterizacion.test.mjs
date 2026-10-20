/**
 * findCalEntries debe usar la clave de mes tal cual.
 * calKey ya guardó el mes de calendario (octubre = "2026-10").
 * En main, antes de la corrección, octubre sale como 2026-11-20 y diciembre como 2026-13-20.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");
const SRC = resolve(WEB_SRC, "lib/cloud-persist.js");
const OUT = resolve(tmpdir(), `saletse-findcal-${process.pid}.mjs`);

function load() {
  const aliasRoot = WEB_SRC.replace(/\\/g, "/");
  execSync(
    [
      "npx --yes esbuild",
      `"${SRC.replace(/\\/g, "/")}"`,
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

test("findCalEntries: clave 2026-10 y 2026-12 conservan el mes", async () => {
  const { findCalEntries } = await load();
  const db = {
    cal: {
      "2026-10": { days: { "20": [{ id: "a", saleId: "s-oct", t: "venta" }] } },
      "2026-12": { days: { "20": [{ id: "b", saleId: "s-dec", t: "venta" }] } },
    },
  };
  assert.equal(findCalEntries(db, { saleId: "s-oct" })[0].entryDate, "2026-10-20");
  assert.equal(findCalEntries(db, { saleId: "s-dec" })[0].entryDate, "2026-12-20");
  try { unlinkSync(OUT); } catch { /* el bundle temporal ya no hace falta */ }
});
