/**
 * Suite Money Box — Casos 1–3 (unitario) + guía Caso 4 (UI manual).
 *
 * Usa las funciones reales de apps/web/src/lib/calculations/money-box.ts
 * y las mismas variables/fórmulas del SDD:
 *
 *   A) balanceFinanciado = mensualidadPerfecta / factorFinanciero
 *      ventaTotal        = balanceFinanciado / porcentajeFinanciado
 *      enganche          = ventaTotal * porcentajeEnganche
 *
 *   B) ventaTotal        = engancheDisponible / porcentajeEnganche
 *      balanceFinanciado = ventaTotal * porcentajeFinanciado
 *      mensualidad       = balanceFinanciado * factorFinanciero
 *
 * Regla: precisión completa en internos; round2 SOLO en `display`.
 *
 * Uso: npm run test:money-box
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
    annuityFactor,
    toCents,
    roundSaleDown,
    selectThree,
    buildPlanMatrix,
    generateDownProposals,
    generateMonthlyProposals,
    generateCombinedProposals,
    defaultPolicyConfig,
    mensualidadPara,
    calcularVentaPorMensualidadPerfecta,
    calcularVentaPorEnganchePerfecto,
    generateByMonthly,
    generateByDownPayment,
    termsFromWorksheetConfig,
  } = await import(pathToFileURL(out).href);

  // ═══════════════════════════════════════════════════════════════════════
  // CASO 1 — Venta por mensualidad perfecta
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== CASO 1 — Venta por mensualidad perfecta ===");
  {
    // Nuestras variables (mismas del SDD / money-box.ts)
    const mensualidadPerfecta = 263.92;
    const factorFinanciero = 0.02270191483;
    const porcentajeEnganche = 0.3;
    const porcentajeFinanciado = 0.7;

    // Referencia de precisión completa — recalculada aquí, no copiada de un doc
    const balanceFinanciadoRef = mensualidadPerfecta / factorFinanciero;
    const ventaTotalRef = balanceFinanciadoRef / porcentajeFinanciado;
    const engancheRef = ventaTotalRef * porcentajeEnganche;

    console.log("  Paso 1  balanceFinanciado = mensualidadPerfecta / factorFinanciero");
    console.log(`         ${mensualidadPerfecta} / ${factorFinanciero} = ${balanceFinanciadoRef}`);
    console.log("  Paso 2  ventaTotal = balanceFinanciado / porcentajeFinanciado");
    console.log(`         ${balanceFinanciadoRef} / ${porcentajeFinanciado} = ${ventaTotalRef}`);
    console.log("  Paso 3  enganche = ventaTotal * porcentajeEnganche");
    console.log(`         ${ventaTotalRef} * ${porcentajeEnganche} = ${engancheRef}`);

    const r = calcularVentaPorMensualidadPerfecta({
      mensualidadPerfecta,
      factorFinanciero,
      porcentajeEnganche,
      porcentajeFinanciado,
    });

    // Pasos 1–3: el código debe coincidir con la fórmula (internos sin redondear)
    assertNear(r.balanceFinanciado, balanceFinanciadoRef, "1. balanceFinanciado");
    assertNear(r.ventaTotal, ventaTotalRef, "2. ventaTotal");
    assertNear(r.enganche, engancheRef, "3. enganche");

    // Internos conservan más de 2 decimales (al menos uno)
    assert(
      Math.abs(r.balanceFinanciado - round2(r.balanceFinanciado)) > 1e-12
        || Math.abs(r.ventaTotal - round2(r.ventaTotal)) > 1e-12,
      "internos deben conservar precisión más allá de 2 decimales",
    );

    // Paso 4: ventaTotal - enganche === balanceFinanciado (no el redondeado)
    assertNear(
      r.ventaTotal - r.enganche,
      r.balanceFinanciado,
      "4. ventaTotal - enganche === balanceFinanciado",
    );

    // Paso 5: balanceFinanciado * factorFinanciero → mensualidadPerfecta
    assertNear(
      r.balanceFinanciado * factorFinanciero,
      mensualidadPerfecta,
      "5. balanceFinanciado * factorFinanciero === mensualidadPerfecta",
    );

    // Paso 6: display = round2(interno)
    assert(r.display.ventaTotal === round2(ventaTotalRef), `6. display.ventaTotal=${r.display.ventaTotal}`);
    assert(r.display.enganche === round2(engancheRef), `6. display.enganche=${r.display.enganche}`);
    assert(
      r.display.balanceFinanciado === round2(balanceFinanciadoRef),
      `6. display.balanceFinanciado=${r.display.balanceFinanciado}`,
    );
    assert(r.display.mensualidad === round2(mensualidadPerfecta), `6. display.mensualidad=${r.display.mensualidad}`);

    console.log("  display:", r.display);
    console.log("✓ CASO 1 OK");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CASO 2 — Venta por enganche perfecto (discrepancia 167.75 vs 167.76)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== CASO 2 — Venta por enganche perfecto ===");
  let caso2 = null;
  {
    const engancheDisponible = 3167;
    const factorFinanciero = 0.02270191483;
    const porcentajeEnganche = 0.3;
    const porcentajeFinanciado = 0.7;

    const ventaTotalRef = engancheDisponible / porcentajeEnganche;
    const balanceFinanciadoRef = ventaTotalRef * porcentajeFinanciado;
    const mensualidadRef = balanceFinanciadoRef * factorFinanciero;

    console.log("  Paso 1  ventaTotal = engancheDisponible / porcentajeEnganche");
    console.log(`         ${engancheDisponible} / ${porcentajeEnganche} = ${ventaTotalRef}`);
    console.log("  Paso 2  balanceFinanciado = ventaTotal * porcentajeFinanciado");
    console.log(`         ${ventaTotalRef} * ${porcentajeFinanciado} = ${balanceFinanciadoRef}`);
    console.log("  Paso 3  mensualidad = balanceFinanciado * factorFinanciero");
    console.log(`         ${balanceFinanciadoRef} * ${factorFinanciero} = ${mensualidadRef}`);

    const r = calcularVentaPorEnganchePerfecto({
      engancheDisponible,
      factorFinanciero,
      porcentajeEnganche,
      porcentajeFinanciado,
    });

    assertNear(r.ventaTotal, ventaTotalRef, "1. ventaTotal");
    assertNear(r.balanceFinanciado, balanceFinanciadoRef, "2. balanceFinanciado");
    assertNear(r.mensualidad, mensualidadRef, "3. mensualidad (precisión completa)");

    assertNear(
      r.ventaTotal - engancheDisponible,
      r.balanceFinanciado,
      "4. ventaTotal - engancheDisponible === balanceFinanciado",
    );

    const displayMensualidad = round2(r.mensualidad);
    caso2 = {
      exacta: r.mensualidad,
      seisDec: r.mensualidad.toFixed(6),
      diezDec: r.mensualidad.toFixed(10),
      display: displayMensualidad,
      correcto167_76: displayMensualidad === 167.76,
      correcto167_75: displayMensualidad === 167.75,
    };

    assert(r.display.ventaTotal === round2(ventaTotalRef), `display.ventaTotal=${r.display.ventaTotal}`);
    assert(r.display.balanceFinanciado === round2(balanceFinanciadoRef), `display.balance=${r.display.balanceFinanciado}`);
    assert(r.display.mensualidad === displayMensualidad, `display.mensualidad=${r.display.mensualidad}`);
    assert(r.display.enganche === round2(engancheDisponible), `display.enganche=${r.display.enganche}`);

    console.log("  mensualidad exacta:", caso2.exacta);
    console.log("  mensualidad (≥6 dec):", caso2.seisDec);
    console.log("  display (round2):", caso2.display);
    console.log(
      caso2.correcto167_76
        ? "  RESOLUCIÓN: correcto es 167.76 — 167.75 es incorrecto (redondeo prematuro / error de doc)"
        : caso2.correcto167_75
          ? "  RESOLUCIÓN: correcto es 167.75"
          : `  RESOLUCIÓN: display=${caso2.display} (ni 167.75 ni 167.76)`,
    );
    console.log("  display:", r.display);
    console.log("✓ CASO 2 OK");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CASO 3 — Consistencia entre plazos (regresión factor fijo 12 meses)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== CASO 3 — Consistencia entre plazos (WS_DEFAULTS) ===");
  {
    // Plazos reales de Worksheet (constants): 60/12.99, 48/8.90, 12/0
    const terms = termsFromWorksheetConfig(null);
    assert(terms.length === 3, `3 plazos Worksheet, obtuvo ${terms.length}`);
    assert(terms[0].months === 60 && terms[1].months === 48, "plazos 60 y 48 presentes");

    const factor60 = factorFor(terms[0].months, terms[0].annualRate);
    const factor48 = factorFor(terms[1].months, terms[1].annualRate);
    const factor12 = factorFor(terms[2].months, terms[2].annualRate);

    console.log(`  factor 60m/${terms[0].annualRate}% = ${factor60}`);
    console.log(`  factor 48m/${terms[1].annualRate}% = ${factor48}`);
    console.log(`  factor 12m/${terms[2].annualRate}% = ${factor12}`);

    assert(factor60 > 0 && factor48 > 0 && factor12 > 0, "factores > 0");
    assert(!nearlyEqual(factor60, factor48, 1e-12), "factores 60 vs 48 deben diferir");
    assert(!nearlyEqual(factor48, factor12, 1e-12), "factores 48 vs 12 deben diferir");

    const mensualidadPerfecta = 263.92;
    const engancheDisponible = 3167;
    const porcentajeEnganche = 0.3;
    const porcentajeFinanciado = 0.7;

    // CASO 1 por cada factor propio (algoritmo A)
    for (const [label, factor] of [["60m", factor60], ["48m", factor48]]) {
      const r = calcularVentaPorMensualidadPerfecta({
        mensualidadPerfecta,
        factorFinanciero: factor,
        porcentajeEnganche,
        porcentajeFinanciado,
      });
      const balanceFinanciado = mensualidadPerfecta / factor;
      const ventaTotal = balanceFinanciado / porcentajeFinanciado;
      assertNear(r.ventaTotal, ventaTotal, `A/${label} ventaTotal usa su factor`);
      console.log(`  A/${label} display.ventaTotal=${r.display.ventaTotal}`);
    }

    const a60 = calcularVentaPorMensualidadPerfecta({
      mensualidadPerfecta,
      factorFinanciero: factor60,
      porcentajeEnganche,
      porcentajeFinanciado,
    });
    const a48 = calcularVentaPorMensualidadPerfecta({
      mensualidadPerfecta,
      factorFinanciero: factor48,
      porcentajeEnganche,
      porcentajeFinanciado,
    });
    assert(
      !nearlyEqual(a60.ventaTotal, a48.ventaTotal, 1e-6),
      `BUG REGRESIÓN: misma ventaTotal en 60 vs 48 → ${a60.ventaTotal}`,
    );

    // generateByMonthly (UI) debe usar factor por columna
    const byMonth = generateByMonthly(mensualidadPerfecta, porcentajeEnganche, porcentajeFinanciado, terms);
    assert(byMonth.length === 3, "generateByMonthly → 3 opciones");
    assert(!nearlyEqual(byMonth[0].sale, byMonth[1].sale, 1e-6), "UI mensualidad: opciones 1≠2");
    assert(!nearlyEqual(byMonth[1].sale, byMonth[2].sale, 1e-6), "UI mensualidad: opciones 2≠3");

    for (let i = 0; i < terms.length; i++) {
      const factor = factorFor(terms[i].months, terms[i].annualRate);
      const calc = calcularVentaPorMensualidadPerfecta({
        mensualidadPerfecta,
        factorFinanciero: factor,
        porcentajeEnganche,
        porcentajeFinanciado,
      });
      assertNear(byMonth[i].sale, calc.ventaTotal, `generateByMonthly col ${i + 1} = factor propio`);
    }

    // CASO 2 por cada factor (algoritmo B) — venta igual; mensualidad distinta
    const b60 = calcularVentaPorEnganchePerfecto({
      engancheDisponible,
      factorFinanciero: factor60,
      porcentajeEnganche,
      porcentajeFinanciado,
    });
    const b48 = calcularVentaPorEnganchePerfecto({
      engancheDisponible,
      factorFinanciero: factor48,
      porcentajeEnganche,
      porcentajeFinanciado,
    });
    assertNear(b60.ventaTotal, b48.ventaTotal, "B: ventaTotal no depende del factor");
    assert(
      !nearlyEqual(b60.mensualidad, b48.mensualidad, 1e-6),
      `B: mensualidad debe diferir 60 vs 48 → ${b60.mensualidad} vs ${b48.mensualidad}`,
    );
    console.log(`  B/60m display.mensualidad=${b60.display.mensualidad}`);
    console.log(`  B/48m display.mensualidad=${b48.display.mensualidad}`);

    const byDown = generateByDownPayment(engancheDisponible, porcentajeEnganche, porcentajeFinanciado, terms);
    assertNear(byDown[0].sale, byDown[1].sale, "generateByDownPayment: venta igual entre plazos");
    assertNear(byDown[0].downPayment, engancheDisponible, "generateByDownPayment: enganche = input");

    console.log("✓ CASO 3 OK");
  }

  // round2 sanity (regla de display)
  assert(round2(167.75958328875666) === 167.76, "round2(167.75958…) === 167.76");
  assert(round2(16607.787239618126) === 16607.79, "round2 venta caso 1");

  // ═══════════════════════════════════════════════════════════════════════
  // CASO 5 — Algoritmo 3 paneles (centavos + Worksheet terms)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== CASO 5 — 3 paneles / matriz / selectThree ===");
  {
    const term = { months: 12, annualRate: 5.9, label: "12m", id: "t12" };
    const af = annuityFactor(term);
    const ff = factorFor(term.months, term.annualRate);
    assertNear(af * ff, 1, "annuityFactor * factorFor ≈ 1", 1e-9);

    const saleCents = toCents(10000);
    const downCents = toCents(3000);
    const m = mensualidadPara(saleCents, downCents, 0, term);
    assert(m === Math.round((saleCents - downCents) * ff), "mensualidadPara = financed * factorFor");

    assert(roundSaleDown(123456, 50000) === 100000, "roundSaleDown a $500");
    assert(roundSaleDown(123456, 1) === 123456, "roundSaleDown exacto");

    const candidates = [
      { saleCents: 100000, downCents: 30000, downPct: 0.3, totalTodayCents: 30000, originPlanId: null },
      { saleCents: 90000, downCents: 27000, downPct: 0.3, totalTodayCents: 27000, originPlanId: null },
      { saleCents: 80000, downCents: 24000, downPct: 0.3, totalTodayCents: 24000, originPlanId: null },
      { saleCents: 70000, downCents: 21000, downPct: 0.3, totalTodayCents: 21000, originPlanId: null },
      { saleCents: 60000, downCents: 18000, downPct: 0.3, totalTodayCents: 18000, originPlanId: null },
    ];
    const s0 = selectThree(candidates, 0, 0.1);
    const s1 = selectThree(candidates, 1, 0.1);
    assert(s0.length === 3, "selectThree → 3");
    assert(s0[0].saleCents >= s0[1].saleCents && s0[1].saleCents >= s0[2].saleCents, "curva descendente");
    assert(
      s0.map((x) => x.saleCents).join(",") !== s1.map((x) => x.saleCents).join(","),
      "refreshIndex cambia el set",
    );

    const wsTerms = termsFromWorksheetConfig({
      wo1m: "12", wo1r: "5.9",
      wo2m: "24", wo2r: "7.9",
      wo3m: "48", wo3r: "8.9",
    });
    const config = defaultPolicyConfig({
      minDownPct: 0.3,
      maxDownPct: 0.5,
      maxSaleCents: toCents(150000),
      roundStepCents: 1,
    });
    const downs = generateDownProposals(toCents(2000), 0, config, wsTerms, 0);
    assert(downs.length > 0 && downs.length <= 3, "generateDownProposals ≤3");
    assert(downs[0].plans.length === wsTerms.length, "matriz: todos los plazos Worksheet");
    assert(downs[0].plans.every((p) => typeof p.feasible === "boolean"), "cada plan tiene feasible");

    const configRound = defaultPolicyConfig({
      ...config,
      roundStepCents: 50000,
    });
    const downsR = generateDownProposals(toCents(2000), 0, configRound, wsTerms, 0);
    for (const p of downsR) {
      assert(p.saleCents % 50000 === 0, `venta múltiplo de $500: ${p.saleCents}`);
    }

    const monthly = generateMonthlyProposals(toCents(210), 0, config, wsTerms, 0);
    assert(monthly.length <= 3, "generateMonthlyProposals ≤3");
    const combined = generateCombinedProposals(toCents(2000), toCents(210), config, wsTerms, 0);
    assert(combined.length <= 3, "generateCombinedProposals ≤3");

    // Plan incumplidor sigue en matriz (mensualidad cap baja)
    const matrix = buildPlanMatrix({
      saleCents: toCents(50000),
      downCents: toCents(15000),
      originPlanId: null,
      monthlyCapCents: 50,
      cashCapCents: 0,
      config,
      terms: wsTerms,
    });
    assert(matrix.length === wsTerms.length, "matriz no oculta planes");
    assert(matrix.some((p) => !p.feasible && p.reason.includes("mensualidad")), "motivo supera mensualidad");

    console.log("✓ CASO 5 OK");
  }

  console.log("\n══════════════════════════════════════");
  console.log(`RESULTADO: ${passed} aserciones OK, ${failed} fallos`);
  console.log("══════════════════════════════════════");
  console.log("\n📌 RESOLUCIÓN CASO 2 (mensualidad):");
  console.log(`   Exacta:     ${caso2.exacta}`);
  console.log(`   ≥6 dec:     ${caso2.seisDec}`);
  console.log(`   10 dec:     ${caso2.diezDec}`);
  console.log(`   display:    ${caso2.display}`);
  console.log(
    caso2.correcto167_76
      ? "   → Correcto para UI: 167.76. El 167.75 de la otra referencia es incorrecto."
      : `   → display=${caso2.display}`,
  );
  console.log("\n📌 CASO 4 — Checklist UI manual (Money Box):");
  console.log("   Panel Mensualidad → input 263.92, enganche 30%:");
  console.log("     Con factor ≈ 0.02270191483 → display venta 16,607.79 | enganche 4,982.34");
  console.log("     Las 3 opciones Worksheet deben mostrar ventas distintas (no el bug del factor 12m).");
  console.log("   Panel Enganche → input 3,167, enganche 30%:");
  console.log(`     Mensualidad en el plazo con factor doc → display ${caso2.display} (no 167.75).`);
  console.log("✓ Suite Money Box completada");
} finally {
  if (fs.existsSync(out)) fs.unlinkSync(out);
}
