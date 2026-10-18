import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { fromTextLog } from "./e2e-comparar-baseline.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "e2e-comparar-baseline.mjs");
// Anotación "Playwright Run Summary" del check-run de CI, tal cual (varias líneas).
const SUMMARY_18 = readFileSync(path.join(HERE, "fixtures/ci-playwright-summary-68003a1.txt"), "utf8");
const SUMMARY_1 = readFileSync(path.join(HERE, "fixtures/ci-playwright-summary-8b59907.txt"), "utf8");
const MONEY_BOX_KEY =
  "e2e/money-box-routing.spec.js:48 › Money Box — expediente y rutas › sala RH: pestaña Money Box en worksheet embebido";

test("resumen real de CI con 18 fallos: extrae los 18, uno por línea", () => {
  const keys = fromTextLog(SUMMARY_18);
  assert.equal(new Set(keys).size, 18);
  assert.ok(keys.includes(MONEY_BOX_KEY));
  assert.ok(keys.includes("e2e/rh-tables-mobile.spec.js:187 › RH tablas móviles › Membresías y escenarios @ tablet (768px)"));
  assert.ok(keys.every((k) => !/\d+ (skipped|passed)/.test(k)), "el título no arrastra la línea siguiente");
});

test("resumen real de CI con 1 fallo seguido de más líneas", () => {
  assert.deepEqual(fromTextLog(SUMMARY_1), [MONEY_BOX_KEY]);
});

test("CRLF da el mismo resultado que LF", () => {
  assert.deepEqual(fromTextLog(SUMMARY_18.replace(/\n/g, "\r\n")), fromTextLog(SUMMARY_18));
});

test("CLI: resumen en UTF-16 LE (Tee-Object) y reporte JSON sin fallos", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "saletse-e2e-cmp-"));
  try {
    const utf16 = path.join(dir, "summary.txt");
    writeFileSync(utf16, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(SUMMARY_1, "utf16le")]));
    const baseline = JSON.parse(readFileSync(path.join(HERE, "e2e-baseline-failures.json"), "utf8"));
    const listed = (baseline.failures || []).some((f) => f.file === "e2e/money-box-routing.spec.js" && f.line === 48);
    const r = spawnSync(process.execPath, [SCRIPT, utf16], { encoding: "utf8" });
    assert.match(r.stdout, /Actual fallidos: 1/);
    assert.equal(r.status, listed ? 0 : 1, r.stderr);

    const json = path.join(dir, "report.json");
    writeFileSync(json, JSON.stringify({ suites: [] }));
    const ok = spawnSync(process.execPath, [SCRIPT, json], { encoding: "utf8" });
    assert.match(ok.stdout, /Actual fallidos: 0/);
    assert.equal(ok.status, 0, ok.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
