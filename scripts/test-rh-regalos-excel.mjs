/**
 * Valida motor de regalos RH vs reglas del Excel Saletse (sin DB).
 */
import {
  cantidadDefaultRegalo,
  costoUnitarioRegalo,
  deltaMontoVsBottomLine,
  evaluarRegaloWorksheet,
  lookupBottomLineByMonto,
  totalLineaRegalo,
  totalesRegalosAplicados,
  CARGA_REGALO_AMBOS,
  defaultSplitMontos,
  esRegaloFlyback,
  permiteCargaDualRegalo,
  resolverToggleCargaRegalo,
} from "../packages/shared/src/calculations/royal-holiday.js";
import { claveRegaloExcel } from "../packages/shared/src/calculations/royal-holiday-regalos-catalog.js";
import { RH_REGALOS_EXCEL } from "../packages/shared/src/calculations/royal-holiday-regalos-catalog.js";
import {
  DEFAULT_RH_FORM,
  mergeRhForm,
  rhFormFromBucket,
  rhFormToBucket,
} from "../apps/web/src/lib/calculations/worksheet-rh-bucket.js";

function fail(msg) {
  console.error("FAIL", msg);
  process.exit(1);
}

const byName = Object.fromEntries(RH_REGALOS_EXCEL.map((g, i) => [g.nombre, { ...g, id: String(i + 1) }]));
const bl = [
  { programa: "BRZ+", holiday_credits: 10000, precio_minimo_con_iva: 10681.51, cuota_anual_mfee: 700 },
  { programa: "GOLD", holiday_credits: 25000, precio_minimo_con_iva: 19167.58, cuota_anual_mfee: 1040 },
];

const goldByMonto = lookupBottomLineByMonto(bl, 19167.58);
if (goldByMonto?.programa !== "GOLD") fail("lookupBottomLineByMonto GOLD");

const d = deltaMontoVsBottomLine(20000, bl[1]);
if (Math.abs(d - (20000 - 19167.58)) > 0.01) fail("delta Tabla 1");

const priv = byName["Prevelige Member"];
const evPrivLow = evaluarRegaloWorksheet(priv, { holidayCredits: 10000, montoVenta: 20000 });
if (evPrivLow.estado !== "no_elegible") fail("privilege < 15k HC debe ser no_elegible");
const evPrivOk = evaluarRegaloWorksheet(priv, { holidayCredits: 15000, montoVenta: 20000 });
if (evPrivOk.estado !== "elegible" || !evPrivOk.permiteSinCosto) fail("privilege 15k HC");

const fly = byName.Flyback;
if (cantidadDefaultRegalo(fly) !== 2) fail("flyback qty default 2");
const evFlyLow = evaluarRegaloWorksheet(fly, { holidayCredits: 25000, montoVenta: 10000 });
if (evFlyLow.estado !== "no_elegible") fail("flyback venta < GOLD");
const evFlyOk = evaluarRegaloWorksheet(fly, { holidayCredits: 25000, montoVenta: 19167.58, qty: 2 });
if (evFlyOk.estado !== "elegible" || totalLineaRegalo(fly, { qty: 2 }) !== 3016) fail("flyback 2×1508");

const ai = byName["All inclusive"];
const vuelo = byName["Certificado de vuelo"];
const evCap = evaluarRegaloWorksheet(ai, {
  holidayCredits: 25000,
  montoVenta: 20000,
  qty: 800,
  grupoMontosOtros: { ai_vuelo: 800 },
});
if (!String(evCap.aviso || "").includes("1,500") && !String(evCap.aviso || "").includes("1500")) {
  fail("tope AI+vuelo aviso");
}

const bono = byName["Bono de creditos"];
const unitBono = costoUnitarioRegalo(bono, { cuotaAnual: 1040 });
if (unitBono !== 1040) fail("bono = M.Fee");
const evBono = evaluarRegaloWorksheet(bono, { holidayCredits: 25000, montoVenta: 20000, cuotaAnual: 1040, qty: 1 });
if (evBono.bonoHc !== 50000) fail(`bono HC extra esperado 50000, got ${evBono.bonoHc}`);

const move = byName["Move In"];
const form = {
  regalosElegidos: { [fly.id]: "venta", [move.id]: "closing_cost", [bono.id]: "venta" },
  regalosCantidad: { [fly.id]: 2, [move.id]: 1, [bono.id]: 1 },
};
const tot = totalesRegalosAplicados(Object.values(byName), form, {
  holidayCredits: 25000,
  montoVenta: 19167.58,
  cuotaAnual: 1040,
  mxnToUsd: (n) => n / 18,
});
const moveUsd = 4000 / 18;
if (Math.abs(tot.venta - (3016 + 1040)) > 0.05) fail(`venta regalos ${tot.venta}`);
if (Math.abs(tot.closing - moveUsd) > 0.05) fail(`closing regalos ${tot.closing}`);

const onlyClosing = totalesRegalosAplicados([move], {
  regalosElegidos: { [move.id]: "closing_cost" },
  regalosCantidad: { [move.id]: 1 },
}, { holidayCredits: 25000, montoVenta: 19167.58, mxnToUsd: (n) => n / 18 });
if (Math.abs(onlyClosing.closing - moveUsd) > 0.05) fail(`closing_cost no debe tratarse como sin_costo (${onlyClosing.closing})`);

const flySplit = defaultSplitMontos(3016);
if (flySplit.venta !== 1508 || flySplit.closing !== 1508) fail("default split Flyback 1508+1508");

const dualForm = {
  regalosElegidos: { [fly.id]: CARGA_REGALO_AMBOS },
  regalosCantidad: { [fly.id]: 2 },
  regalosSplit: { [fly.id]: { venta: 1508, closing: 1508 } },
};
const dualTot = totalesRegalosAplicados([fly], dualForm, {
  holidayCredits: 25000,
  montoVenta: 19167.58,
});
if (Math.abs(dualTot.venta - 1508) > 0.01 || Math.abs(dualTot.closing - 1508) > 0.01) {
  fail(`Flyback dual 1508/1508 got venta=${dualTot.venta} closing=${dualTot.closing}`);
}
if (Math.abs(dualTot.total - 3016) > 0.01) fail(`Flyback dual total ${dualTot.total}`);

const dualInvalid = totalesRegalosAplicados([fly], {
  regalosElegidos: { [fly.id]: CARGA_REGALO_AMBOS },
  regalosCantidad: { [fly.id]: 2 },
  regalosSplit: { [fly.id]: { venta: 1000, closing: 1000 } },
}, { holidayCredits: 25000, montoVenta: 19167.58 });
if (dualInvalid.venta !== 0 || dualInvalid.closing !== 0) {
  fail("Flyback split inválido no debe aplicar");
}

const flyVentaOnly = totalesRegalosAplicados([fly], {
  regalosElegidos: { [fly.id]: "venta" },
  regalosCantidad: { [fly.id]: 2 },
}, { holidayCredits: 25000, montoVenta: 19167.58 });
if (Math.abs(flyVentaOnly.venta - 3016) > 0.01 || flyVentaOnly.closing !== 0) {
  fail("Flyback una casilla venta debe ir íntegro");
}

const flyClosingOnly = totalesRegalosAplicados([fly], {
  regalosElegidos: { [fly.id]: "closing_cost" },
  regalosCantidad: { [fly.id]: 2 },
}, { holidayCredits: 25000, montoVenta: 19167.58 });
if (flyClosingOnly.venta !== 0 || Math.abs(flyClosingOnly.closing - 3016) > 0.01) {
  fail("Flyback una casilla closing debe ir íntegro");
}

const flyOff = totalesRegalosAplicados([fly], {
  regalosElegidos: { [fly.id]: "" },
  regalosCantidad: { [fly.id]: 2 },
}, { holidayCredits: 25000, montoVenta: 19167.58 });
if (flyOff.venta !== 0 || flyOff.closing !== 0) fail("Flyback sin casillas no suma");

const bonoDualIgnored = totalesRegalosAplicados([bono], {
  regalosElegidos: { [bono.id]: CARGA_REGALO_AMBOS },
  regalosCantidad: { [bono.id]: 1 },
  regalosSplit: { [bono.id]: { venta: 520, closing: 520 } },
}, { holidayCredits: 25000, montoVenta: 19167.58, cuotaAnual: 1040 });
if (bonoDualIgnored.venta !== 0 || bonoDualIgnored.closing !== 0) {
  fail("Bono no admite carga dual aunque el form diga ambos");
}

const persisted = rhFormFromBucket(rhFormToBucket(mergeRhForm(DEFAULT_RH_FORM, dualForm), "venta"));
if (persisted.form.regalosElegidos[fly.id] !== CARGA_REGALO_AMBOS) fail("persist carga ambos");
if (persisted.form.regalosSplit[fly.id].venta !== 1508 || persisted.form.regalosSplit[fly.id].closing !== 1508) {
  fail("persist split Flyback");
}

if (claveRegaloExcel("Fly Back") !== "flyback") fail("clave Fly Back");
if (claveRegaloExcel("FLY-BACK") !== "flyback") fail("clave FLY-BACK");
if (!esRegaloFlyback({ nombre: "Fly Back", cargas_permitidas: ["venta", "closing_cost"] })) {
  fail("esRegaloFlyback Fly Back");
}
if (!esRegaloFlyback({
  nombre: "Incentivo sala",
  cargas_permitidas: ["closing_cost", "venta"],
  restricciones: { venta_minima_usd: 19167.58, cantidad_default: 2 },
})) fail("esRegaloFlyback huella Excel sin nombre");
if (permiteCargaDualRegalo(bono)) fail("Bono no debe ser dual");

const t1 = resolverToggleCargaRegalo({ dual: true, current: "", column: "venta", checked: true, lineTotal: 3016 });
if (t1.carga !== "venta") fail("toggle flyback primera casilla venta");
const t2 = resolverToggleCargaRegalo({ dual: true, current: t1.carga, column: "closing", checked: true, lineTotal: 3016 });
if (t2.carga !== CARGA_REGALO_AMBOS) fail(`toggle flyback ambas, got ${t2.carga}`);
if (!t2.split || t2.split.venta !== 1508 || t2.split.closing !== 1508) fail("toggle flyback split default");
const t3 = resolverToggleCargaRegalo({ dual: true, current: CARGA_REGALO_AMBOS, column: "venta", checked: false, lineTotal: 3016 });
if (t3.carga !== "closing_cost") fail("desmarcar venta deja closing íntegro");
const t4 = resolverToggleCargaRegalo({ dual: true, current: "closing_cost", column: "closing", checked: false, lineTotal: 3016 });
if (t4.carga !== "") fail("desmarcar ambas limpia Flyback");

const b1 = resolverToggleCargaRegalo({ dual: false, current: "venta", column: "closing", checked: true });
if (b1.carga !== "closing_cost") fail("bono/resto sigue excluyente");

const tours = byName.Tours;
if (totalLineaRegalo(tours, { qty: 350 }) !== 350) fail("tours cantidad_es_monto");

console.log("✓ Regalos Excel RH validados", {
  privilege: evPrivOk.estado,
  flyback: totalLineaRegalo(fly, { qty: 2 }),
  bonoHc: evBono.bonoHc,
  venta: tot.venta,
  closing: tot.closing,
});
