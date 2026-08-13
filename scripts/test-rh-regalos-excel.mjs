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
} from "../packages/shared/src/calculations/royal-holiday.js";
import { RH_REGALOS_EXCEL } from "../packages/shared/src/calculations/royal-holiday-regalos-catalog.js";

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

const tours = byName.Tours;
if (totalLineaRegalo(tours, { qty: 350 }) !== 350) fail("tours cantidad_es_monto");

console.log("✓ Regalos Excel RH validados", {
  privilege: evPrivOk.estado,
  flyback: totalLineaRegalo(fly, { qty: 2 }),
  bonoHc: evBono.bonoHc,
  venta: tot.venta,
  closing: tot.closing,
});
