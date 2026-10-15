/**
 * Caracterización catálogo i18n Discovery (5b.4).
 * No renombra claves ni valores; fingerprint SHA-256 de claves+valores ES/EN.
 * Verifica que el script de build regenera el mismo catálogo.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../../../..");
const CATALOG = resolve(HERE, "catalogo-discovery.js");
const BUILD = resolve(HERE, "build-catalogo-discovery.mjs");
const LEGACY_CATALOG = resolve(ROOT, "apps/web/src/lib/i18n-survey-discovery-catalog.js");
const LEGACY_BUILD = resolve(ROOT, "scripts/build-survey-discovery-i18n.mjs");

/** Fingerprints congelados pre-5b.4 (main @ ed6b3b0). */
const ES_HASH = "cc5430af0cf017f5bc6ca787846050ee3f4e034e08269245371aa5f02e729da8";
const EN_HASH = "832b0e153c578faa67980ea05778f236747e6a5821829429ad42e917e8e70137";
const KEY_COUNT = 310;

function catalogPath() {
  return existsSync(CATALOG) ? CATALOG : LEGACY_CATALOG;
}

function buildPath() {
  return existsSync(BUILD) ? BUILD : LEGACY_BUILD;
}

function fingerprint(obj) {
  const keys = Object.keys(obj).sort();
  const payload = keys.map((k) => `${k}\0${obj[k]}`).join("\n");
  return {
    count: keys.length,
    keys,
    hash: createHash("sha256").update(payload, "utf8").digest("hex"),
  };
}

async function loadCatalog(path) {
  const mod = await import(pathToFileURL(path).href + `?t=${Date.now()}`);
  assert.ok(mod.ES_SURVEY_DISC && mod.EN_SURVEY_DISC, "exporta ES_SURVEY_DISC y EN_SURVEY_DISC");
  return mod;
}

test("catálogo Discovery: conjunto de claves y valores (fingerprint) intacto", async () => {
  const { ES_SURVEY_DISC, EN_SURVEY_DISC } = await loadCatalog(catalogPath());
  const es = fingerprint(ES_SURVEY_DISC);
  const en = fingerprint(EN_SURVEY_DISC);
  assert.equal(es.count, KEY_COUNT);
  assert.equal(en.count, KEY_COUNT);
  assert.deepEqual(es.keys, en.keys, "mismo conjunto de claves ES/EN");
  assert.equal(es.hash, ES_HASH, "fingerprint ES");
  assert.equal(en.hash, EN_HASH, "fingerprint EN");
});

test("build Discovery regenera el mismo catálogo (claves+valores)", async () => {
  const path = catalogPath();
  const beforeMod = await loadCatalog(path);
  const esBefore = fingerprint(beforeMod.ES_SURVEY_DISC);
  const enBefore = fingerprint(beforeMod.EN_SURVEY_DISC);
  const fileBefore = readFileSync(path, "utf8");

  const r = spawnSync(process.execPath, [buildPath()], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(r.status, 0, `build falló: ${(r.stderr || r.stdout || "").slice(0, 500)}`);

  const afterMod = await loadCatalog(path);
  const esAfter = fingerprint(afterMod.ES_SURVEY_DISC);
  const enAfter = fingerprint(afterMod.EN_SURVEY_DISC);
  assert.deepEqual(esAfter.keys, esBefore.keys);
  assert.deepEqual(enAfter.keys, enBefore.keys);
  assert.equal(esAfter.hash, esBefore.hash);
  assert.equal(enAfter.hash, enBefore.hash);
  assert.equal(esAfter.hash, ES_HASH);
  assert.equal(enAfter.hash, EN_HASH);
  // Normalizar EOL: el generador puede reescribir LF/CRLF sin cambiar claves/valores.
  const norm = (s) => s.replace(/\r\n/g, "\n");
  assert.equal(norm(readFileSync(path, "utf8")), norm(fileBefore), "catálogo idéntico tras build (EOL-normalizado)");
});
