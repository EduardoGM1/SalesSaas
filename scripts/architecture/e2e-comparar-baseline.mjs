#!/usr/bin/env node
/**
 * Compara fallos de un run Playwright contra la baseline conocida.
 *
 * Uso:
 *   node scripts/architecture/e2e-comparar-baseline.mjs <report.json|log.txt>
 *   node scripts/architecture/e2e-comparar-baseline.mjs --strict-missing <file>
 *
 * Exit 1 si hay fallos NUEVOS (fuera de la lista).
 * Con --strict-missing: también exit 1 si falta algún fallido de la baseline.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASELINE_PATH = path.join(
  ROOT,
  "scripts/architecture/e2e-baseline-failures.json",
);

function normPath(p) {
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
}

function keyOf(file, line, title) {
  const t = String(title || "")
    .replace(/\s+/g, " ")
    .trim();
  return `${normPath(file)}:${Number(line)} › ${t}`;
}

function loadBaseline() {
  const raw = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const keys = new Set(
    (raw.failures || []).map((f) => keyOf(f.file, f.line, f.title)),
  );
  return { keys, raw };
}

/** Playwright JSON reporter (array of suites) or { suites } */
function fromJsonReport(data) {
  const out = [];
  const suites = Array.isArray(data) ? data : data.suites || [];
  // spec.file viene relativo a testDir (config.rootDir); la baseline usa rutas desde la raíz del repo.
  const testDir = data.config?.rootDir;
  const repoPath = (f) =>
    normPath(testDir ? path.relative(ROOT, path.resolve(testDir, f)) : f);
  // La suite raíz es el archivo; las anidadas son los describe del título.
  const walk = (suite, describes) => {
    for (const s of suite.suites || []) walk(s, [...describes, s.title]);
    for (const spec of suite.specs || []) {
      // Un test que pasa en el retry es flaky, no fallo.
      const failed = (spec.tests || []).some(
        (t) => t.status === "unexpected",
      );
      if (!failed) continue;
      const file = repoPath(spec.file || suite.file || "");
      const line = spec.line || 0;
      const title = [...describes, spec.title].filter(Boolean).join(" › ");
      out.push(keyOf(file, line, title));
    }
  };
  for (const s of suites) walk(s, []);

  // Alternate: list reporter dump as { failures: [{ file, line, title }] }
  if (!out.length && Array.isArray(data.failures)) {
    for (const f of data.failures) {
      out.push(keyOf(f.file, f.line, f.title));
    }
  }
  return out;
}

/** Texto: "e2e\foo.spec.js:108:7 › Title" (reporter github/list, a veces tras title=) */
function fromTextLog(text) {
  const out = [];
  const decoded = text.replace(/%0A/g, "\n");
  // Título hasta fin de línea / anotación github (::) / siguiente file=
  const re =
    /((?:e2e[/\\])[\w./\\-]+\.spec\.js):(\d+):\d+\s*[›>]\s*([^\n]+?)(?=\s*(?:%0A|::|,line=|\s+e2e[/\\]|$))/g;
  let m;
  while ((m = re.exec(decoded))) {
    let title = m[3]
      .replace(/\s+/g, " ")
      .replace(/\s*::\s*\d+\).*$/i, "")
      .trim();
    if (!title || /^\d+\)/.test(title)) continue;
    out.push(keyOf(m[1], m[2], title));
  }
  return out;
}

function unique(arr) {
  return [...new Set(arr)];
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const strictMissing = process.argv.includes("--strict-missing");
  const file = args[0];
  if (!file) {
    console.error(
      "uso: node scripts/architecture/e2e-comparar-baseline.mjs [--strict-missing] <report.json|log.txt>",
    );
    process.exit(2);
  }
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!fs.existsSync(abs)) {
    console.error(`no existe: ${abs}`);
    process.exit(2);
  }

  const { keys: baseline } = loadBaseline();
  const buf = fs.readFileSync(abs);
  // Tee-Object (PowerShell) escribe UTF-16 LE con BOM FF FE.
  const raw =
    buf[0] === 0xff && buf[1] === 0xfe
      ? buf.toString("utf16le")
      : buf[0] === 0xfe && buf[1] === 0xff
        ? buf.swap16().toString("utf16le")
        : buf.toString("utf8");
  let actual = [];
  let parsedJsonReport = false;
  if (abs.endsWith(".json")) {
    try {
      const data = JSON.parse(raw);
      actual = fromJsonReport(data);
      parsedJsonReport = Array.isArray(data) || Array.isArray(data.suites);
    } catch {
      actual = fromTextLog(raw);
    }
  } else {
    actual = fromTextLog(raw);
  }
  actual = unique(actual);

  // Un reporte JSON válido sin fallos es un resultado legítimo; un log sin coincidencias no.
  if (!actual.length && !parsedJsonReport) {
    console.error(
      "No se extrajeron fallos del input. Usa reporter=json o un log con líneas file:line:col › título.",
    );
    process.exit(2);
  }

  const unexpected = actual.filter((k) => !baseline.has(k));
  const missing = [...baseline].filter((k) => !actual.includes(k));

  console.log(`Baseline: ${baseline.size}  Actual fallidos: ${actual.length}`);
  if (unexpected.length) {
    console.error("\nFALLOS NUEVOS (bloquean deploy):");
    for (const k of unexpected) console.error(`  + ${k}`);
  }
  if (missing.length) {
    console.log(
      `\nAusentes vs baseline (${missing.length})${strictMissing ? " — strict" : " — informativo"}:`,
    );
    for (const k of missing) console.log(`  - ${k}`);
  }

  if (unexpected.length) {
    process.exit(1);
  }
  if (strictMissing && missing.length) {
    process.exit(1);
  }
  console.log("\nOK: sin fallos nuevos fuera de la baseline.");
}

main();
