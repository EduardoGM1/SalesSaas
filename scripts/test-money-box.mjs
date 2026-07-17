/**
 * Pruebas Money Box — algoritmos A/B con precisión completa (sin redondeo intermedio).
 * Uso: node scripts/test-money-box.mjs
 *
 * Regla: redondeo SOLO en `display` (round2). Internos se asertan con tolerancia float.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "scripts", ".tmp-money-box.mjs");
const entry = path.join(root, "apps/web/src/lib/calculations/money-box.ts");

const EPS = 1e-9;
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error(`✗ ${msg}`);
    throw new Error(msg);
  }
  passed += 1;
}

function nearlyEqual(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

function assertNear(actual, expected, label, eps = EPS) {
  assert(
    nearlyEqual(actual, expected, eps),
    `${label}: esperado ${expected}, obtuvo ${actual} (Δ=${Math.abs(actual - expected)})`,
  );
}

try {
  execSync(
    [
      "npx --yes esbuild",
      `"${entry}"`,
      "--bundle",
      "--format=esm",
      "--platform=neutral",
      `--outfile="${out}"`,
      `--alias:@=${path.join(root, "apps/web/src").replace(/\\/g, "/")}`,
    ].join(" "),
    { cwd: root, stdio: "pipe" },
  );

  const {
    round2,
    factorFor,
    calcularVentaPorMensualidadPerfecta,
    calcularVentaPorEnganchePerfecto,
    generateByMonthly,
    generateByDownPayment,
    termsFromWorksheetConfig,
  } = await import(pathToFileURL(out).href);

  // ─── CASO 1 — Venta por mensualidad perfecta ───────────────────────────
  console.log("\n=== CASO 1 — Venta por mensualidad perfecta ===");
  {
    const mensualidadPerfecta = 263.92;
    const factorFinanciero = 0.02270191483;
    const porcentajeEnganche = 0.3;
    const porcentajeFinanciado = 0.7;

    // Referencia de precisión completa (misma aritmética, no valores copiados a ciegas)
    const expectedBalance = mensualidadPerfecta / factorFinanciero;
    const expectedVenta = expectedBalance / porcentajeFinanciado;
    const expectedEnganche = expectedVenta * porcentajeEnganche;

    const r = calcularVentaPorMensualidadPerfecta({
      mensualidadPerfecta,
      factorFinanciero,
      porcentajeEnganche,
      porcentajeFinanciado,
    });

    // Paso 1–3: internos sin redondear
    assertNear(r.balanceFinanciado, expectedBalance, "1. balanceFinanciado (precisión completa)");
    assertNear(r.ventaTotal, expectedVenta, "2. ventaTotal (precisión completa)");
    assertNear(r.enganche, expectedEnganche, "3. enganche (precisión completa)");

    // Internos NO deben ser ya round2 (salvo coincidencia accidental)
    assert(
      Math.abs(r.balanceFinanciado - round2(r.balanceFinanciado)) > 1e-12
        || Math.abs(r.ventaTotal - round2(r.ventaTotal)) > 1e-12,
      "internos deben conservar fracción más allá de 2 decimales (al menos uno)",
    );

    // Paso 4: venta - enganche === balance (float)
    assertNear(
      r.ventaTotal - r.enganche,
      r.balanceFinanciado,
      "4. ventaTotal - enganche === balanceFinanciado",
    );

    // Paso 5: balance * factor → mensualidad
    assertNear(
      r.balanceFinanciado * factorFinanciero,
      mensualidadPerfecta,
      "5. balanceFinanciado * factor === mensualidadPerfecta",
    );

    // Paso 6: display redondeado
    assert(r.display.ventaTotal === round2(expectedVenta), `6. display.ventaTotal=${r.display.ventaTotal}`);
    assert(r.display.enganche === round2(expectedEnganche), `6. display.enganche=${r.display.enganche}`);
    assert(
      r.display.balanceFinanciado === round2(expectedBalance),
      `6. display.balanceFinanciado=${r.display.balanceFinanciado}`,
    );
    assert(r.display.mensualidad === 263.92, `6. display.mensualidad=${r.display.mensualidad}`);

    console.log("  balanceFinanciado interno:", r.balanceFinanciado);
    console.log("  ventaTotal interno:", r.ventaTotal);
    console.log("  enganche interno:", r.enganche);
    console.log("  display:", r.display);
    console.log("✓ CASO 1 OK");
  }

  // ─── CASO 2 — Venta por enganche perfecto (discrepancia 167.75 vs 167.76) ─
  console.log("\n=== CASO 2 — Venta por enganche perfecto ===");
  let caso2Resolucion = null;
  {
    const engancheDisponible = 3167;
    const factorFinanciero = 0.02270191483;
    const porcentajeEnganche = 0.3;
    const porcentajeFinanciado = 0.7;

    const expectedVenta = engancheDisponible / porcentajeEnganche;
    const expectedBalance = expectedVenta * porcentajeFinanciado;
    const expectedMensualidad = expectedBalance * factorFinanciero;

    const r = calcularVentaPorEnganchePerfecto({
      engancheDisponible,
      factorFinanciero,
      porcentajeEnganche,
      porcentajeFinanciado,
    });

    assertNear(r.ventaTotal, expectedVenta, "1. ventaTotal (precisión completa)");
    assertNear(r.balanceFinanciado, expectedBalance, "2. balanceFinanciado (precisión completa)");
    assertNear(r.mensualidad, expectedMensualidad, "3. mensualidad (precisión completa)");

    assertNear(
      r.ventaTotal - engancheDisponible,
      r.balanceFinanciado,
      "4. ventaTotal - engancheDisponible === balanceFinanciado",
    );

    const displayMensualidad = round2(r.mensualidad);
    caso2Resolucion = {
      mensualidadExacta: r.mensualidad,
      mensualidad6dec: r.mensualidad.toFixed(6),
      display: displayMensualidad,
      es167_75: displayMensualidad === 167.75,
      es167_76: displayMensualidad === 167.76,
    };

    assert(r.display.ventaTotal === round2(expectedVenta), `display.ventaTotal=${r.display.ventaTotal}`);
    assert(r.display.balanceFinanciado === round2(expectedBalance), `display.balance=${r.display.balanceFinanciado}`);
    assert(r.display.mensualidad === displayMensualidad, `display.mensualidad=${r.display.mensualidad}`);

    console.log("  ventaTotal interno:", r.ventaTotal);
    console.log("  balanceFinanciado interno:", r.balanceFinanciado);
    console.log("  mensualidad (precisión completa):", r.mensualidad);
    console.log("  mensualidad (≥6 decimales):", r.mensualidad.toFixed(10));
    console.log("  display.mensualidad (round2):", displayMensualidad);
    console.log(
      "  RESOLUCIÓN DISCREPANCIA:",
      displayMensualidad === 167.76
        ? "CORRECTO es 167.76 (167.75 es incorrecto — redondeo prematuro o error de doc)"
        : displayMensualidad === 167.75
          ? "CORRECTO es 167.75"
          : `ni 167.75 ni 167.76 → ${displayMensualidad}`,
    );
    console.log("  display:", r.display);
    console.log("✓ CASO 2 OK");
  }

  // ─── CASO 3 — Consistencia entre plazos (regresión factor fijo) ─────────
  console.log("\n=== CASO 3 — Consistencia entre plazos (Worksheet defaults) ===");
  {
    const terms = termsFromWorksheetConfig(null);
    // Defaults: 60/12.99, 48/8.90, 12/0
    assert(terms.length === 3, `esperaba 3 plazos, obtuvo ${terms.length}`);
    assert(terms[0].months === 60 && terms[1].months === 48, "plazos 60 y 48 presentes");

    const f60 = factorFor(terms[0].months, terms[0].annualRate);
    const f48 = factorFor(terms[1].months, terms[1].annualRate);
    const f12 = factorFor(terms[2].months, terms[2].annualRate);

    assert(f60 > 0 && f48 > 0 && f12 > 0, "factores positivos");
    assert(!nearlyEqual(f60, f48, 1e-12), `factores 60 vs 48 deben diferir: ${f60} vs ${f48}`);
    assert(!nearlyEqual(f48, f12, 1e-12), `factores 48 vs 12 deben diferir: ${f48} vs ${f12}`);

    console.log("  factor 60m:", f60);
    console.log("  factor 48m:", f48);
    console.log("  factor 12m:", f12);

    const mensualidad = 263.92;
    const enganche = 3167;
    const dp = 0.3;
    const fin = 0.7;

    const byMonth = generateByMonthly(mensualidad, dp, fin, terms);
    assert(byMonth.length === 3, "generateByMonthly → 3 opciones");
    assert(
      !nearlyEqual(byMonth[0].sale, byMonth[1].sale, 1e-6),
      `BUG REGRESIÓN: misma ventaTotal en plazos distintos (mensualidad): ${byMonth[0].sale} === ${byMonth[1].sale}`,
    );
    assert(
      !nearlyEqual(byMonth[1].sale, byMonth[2].sale, 1e-6),
      `BUG REGRESIÓN: misma ventaTotal plazo 48 vs 12: ${byMonth[1].sale} === ${byMonth[2].sale}`,
    );

    // Cada opción debe coincidir con el algoritmo usando el factor de ESE plazo
    for (let i = 0; i < terms.length; i++) {
      const factor = factorFor(terms[i].months, terms[i].annualRate);
      const calc = calcularVentaPorMensualidadPerfecta({
        mensualidadPerfecta: mensualidad,
        factorFinanciero: factor,
        porcentajeEnganche: dp,
        porcentajeFinanciado: fin,
      });
      assertNear(byMonth[i].sale, calc.ventaTotal, `opción ${i + 1} venta = calc(factor propio)`);
      assertNear(byMonth[i].downPayment, calc.enganche, `opción ${i + 1} enganche = calc(factor propio)`);
    }

    const byDown = generateByDownPayment(enganche, dp, fin, terms);
    // Venta/enganche por enganche no dependen del factor → iguales entre opciones
    assertNear(byDown[0].sale, byDown[1].sale, "por enganche: ventaTotal igual entre plazos");
    assertNear(byDown[0].downPayment, enganche, "por enganche: downPayment = input");

    // Pero la mensualidad implícita (sale * fin * factor) SÍ debe diferir por plazo
    const m60 = byDown[0].sale * fin * f60;
    const m48 = byDown[0].sale * fin * f48;
    assert(
      !nearlyEqual(m60, m48, 1e-6),
      `mensualidades por plazo deben diferir: ${m60} vs ${m48}`,
    );

    // Contra CASO 2 con factor de referencia del doc (si coincide ~60m)
    const calcRef = calcularVentaPorEnganchePerfecto({
      engancheDisponible: enganche,
      factorFinanciero: 0.02270191483,
      porcentajeEnganche: dp,
      porcentajeFinanciado: fin,
    });
    console.log("  generateByMonthly ventas:", byMonth.map((x) => round2(x.sale)));
    console.log("  mensualidad implícita 60/48 (enganche):", round2(m60), round2(m48));
    console.log("  calc ref factor doc mensualidad display:", calcRef.display.mensualidad);
    console.log("✓ CASO 3 OK");
  }

  // ─── round2 sanity ─────────────────────────────────────────────────────
  {
    assert(round2(167.75958328875666) === 167.76, "round2(167.75958…) === 167.76");
    assert(round2(167.754) === 167.75, "round2(167.754) === 167.75");
    assert(round2(16607.787239618126) === 16607.79, "round2 venta caso 1");
  }

  console.log("\n══════════════════════════════════════");
  console.log(`RESULTADO: ${passed} aserciones OK, ${failed} fallos`);
  console.log("══════════════════════════════════════");
  console.log("\n📌 RESOLUCIÓN CASO 2 (mensualidad):");
  console.log(`   Valor exacto: ${caso2Resolucion.mensualidadExacta}`);
  console.log(`   ≥6 decimales: ${caso2Resolucion.mensualidad6dec}`);
  console.log(`   display (Math.round a 2 dec): ${caso2Resolucion.display}`);
  console.log(
    caso2Resolucion.es167_76
      ? "   → El valor correcto para UI es 167.76. El 167.75 de la otra referencia es incorrecto."
      : `   → display=${caso2Resolucion.display}`,
  );
  console.log("\n📌 CASO 4 (UI manual): ingresar en Money Box:");
  console.log("   Mensualidad=263.92, Enganche%=30 → Opción con factor≈0.02270191483");
  console.log("   debe mostrar venta≈16,607.79 | enganche≈4,982.34");
  console.log("   Enganche=$3,167 → mensualidad display debe ser 167.76 (no 167.75)");
  console.log("✓ Suite Money Box completada");
} finally {
  if (fs.existsSync(out)) fs.unlinkSync(out);
}
