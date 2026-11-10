/**
 * Tours del día en agenda — misma regla que dashboard (tourDate + tipo_tour).
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");
const ENTRY = resolve(HERE, "tours-del-dia.ts");
const OUT = resolve(HERE, ".tmp-tours-del-dia.mjs");

const aliasRoot = WEB_SRC.replace(/\\/g, "/");
execSync(
  [
    "npx --yes esbuild",
    `"${ENTRY.replace(/\\/g, "/")}"`,
    "--bundle",
    "--format=esm",
    "--platform=neutral",
    `--alias:@=${aliasRoot}`,
    `--outfile="${OUT.replace(/\\/g, "/")}"`,
  ].join(" "),
  { stdio: "pipe", cwd: resolve(HERE, "../../../../..") },
);

const { tourClientsForDay, tourDaysInMonth } = await import(pathToFileURL(OUT).href);

const clients = {
  a: { id: "a", tipo_tour: "OP", tourDate: "2026-11-10", name: "Ana" },
  b: { id: "b", tipo_tour: "OP", tourDate: "2026-11-11", name: "Bob" },
  c: { id: "c", tipo_tour: "", tourDate: "2026-11-10", name: "Sin tipo" },
  d: { id: "d", tipo_tour: "OP", createdYmd: "2026-11-10", name: "Sin tourDate" },
  e: { id: "e", tipo_tour: "OP", tourDate: "2026-10-10", name: "Otro mes" },
};

{
  const day10 = tourClientsForDay(clients, 2026, 10, 10);
  assert.equal(day10.length, 2);
  assert.deepEqual(day10.map((c) => c.id).sort(), ["a", "d"]);
}

{
  const day11 = tourClientsForDay(clients, 2026, 10, 11);
  assert.equal(day11.length, 1);
  assert.equal(day11[0].id, "b");
}

{
  const days = tourDaysInMonth(clients, 2026, 10);
  assert.deepEqual([...days].sort((x, y) => x - y), [10, 11]);
}

fs.unlinkSync(OUT);
console.log("tours-del-dia.test.mjs: ok");
