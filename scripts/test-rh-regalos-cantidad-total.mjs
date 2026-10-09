/**
 * Verifica qty/unit/total de regalos RH en ambas tablas (Venta y Beneficios).
 * Para cantidad_es_monto: Total = Cantidad, unit null.
 * Resto: Total = Cantidad × costo (Bono = cuota anual).
 */
import {
  cantidadDefaultRegalo,
  cantidadRegalo,
  costoUnitarioRegalo,
  restriccionesRegalo,
  totalLineaRegalo,
} from "../packages/shared/src/calculations/royal-holiday.js";
import { RH_REGALOS_EXCEL } from "../packages/shared/src/calculations/royal-holiday-regalos-catalog.js";

const CUOTA_ANUAL = 990;
const QTYS = [1, 2, 3, 5];

function fail(msg) {
  console.error("FAIL", msg);
  process.exit(1);
}

function ok(msg) {
  console.log("OK", msg);
}

/** Misma semántica de display que worksheet-rh-venta-panel (fmtRegaloCosto). */
function displayVenta(regalo, qtyRaw) {
  const qty = cantidadRegalo(regalo, { [regalo.id]: qtyRaw });
  const unit = costoUnitarioRegalo(regalo, { cuotaAnual: CUOTA_ANUAL });
  const total = totalLineaRegalo(regalo, { qty, cuotaAnual: CUOTA_ANUAL });
  const unitLabel = unit == null ? "Monto" : unit;
  return { qty, unit, total, unitLabel };
}

/** Misma semántica post-fix que worksheet-rh-financing-panel (Beneficios incluidos). */
function displayBeneficios(regalo, qtyRaw) {
  const r = restriccionesRegalo(regalo);
  const esMonto = !!r.cantidad_es_monto;
  const qty = cantidadRegalo(regalo, { [regalo.id]: qtyRaw });
  const unit = costoUnitarioRegalo(regalo, { cuotaAnual: CUOTA_ANUAL });
  const total = totalLineaRegalo(regalo, { qty, cuotaAnual: CUOTA_ANUAL });
  const unitLabel = unit == null ? (esMonto ? "Monto" : "—") : unit;
  return { qty, unit, total, unitLabel };
}

const regalos = RH_REGALOS_EXCEL.map((g, i) => ({ ...g, id: `g${i + 1}` }));
if (regalos.length !== 9) fail(`esperados 9 regalos, got ${regalos.length}`);

for (const regalo of regalos) {
  const r = restriccionesRegalo(regalo);
  for (const q of QTYS) {
    const venta = displayVenta(regalo, q);
    const ben = displayBeneficios(regalo, q);
    if (venta.qty !== ben.qty || venta.unit !== ben.unit || venta.total !== ben.total) {
      fail(
        `${regalo.nombre} qty=${q}: tablas difieren `
        + `venta=${JSON.stringify(venta)} beneficios=${JSON.stringify(ben)}`,
      );
    }
    if (r.cantidad_es_monto) {
      if (venta.unit !== null) fail(`${regalo.nombre}: unit debe ser null`);
      if (venta.unitLabel !== "Monto" || ben.unitLabel !== "Monto") {
        fail(`${regalo.nombre}: unitLabel debe ser Monto`);
      }
      if (venta.total !== q) fail(`${regalo.nombre} qty=${q}: Total=${venta.total} != Cantidad`);
    } else {
      const unit = costoUnitarioRegalo(regalo, { cuotaAnual: CUOTA_ANUAL });
      const expected = (unit == null ? 0 : unit) * q;
      if (Math.abs(venta.total - expected) > 1e-9) {
        fail(`${regalo.nombre} qty=${q}: Total=${venta.total} != ${expected} (unit=${unit})`);
      }
    }
  }
  ok(`${regalo.nombre}: qtys ${QTYS.join(",")} consistentes`);
}

// Capturas reportadas
const byName = Object.fromEntries(regalos.map((g) => [g.nombre, g]));
const ai = byName["All inclusive"];
const vuelo = byName["Certificado de vuelo"];
const fly = byName.Flyback;

const ai3 = displayVenta(ai, 3);
if (ai3.total !== 3 || ai3.unit !== null) fail(`All inclusive 3 → ${JSON.stringify(ai3)}`);
ok("All inclusive 3 → USD 3");

const vuelo2 = displayVenta(vuelo, 2);
if (vuelo2.total !== 2 || vuelo2.unit !== null) fail(`Vuelo 2 → ${JSON.stringify(vuelo2)}`);
ok("Certificado de vuelo 2 → USD 2");

const fly1 = displayVenta(fly, 1);
if (fly1.total !== 1508 || fly1.unit !== 1508) fail(`Flyback 1 → ${JSON.stringify(fly1)}`);
ok("Flyback 1 → USD 1,508");

const aiEmpty = displayVenta(ai, "");
const defAi = cantidadDefaultRegalo(ai);
if (defAi !== 500) fail(`All inclusive default ${defAi}`);
if (aiEmpty.qty !== 500 || aiEmpty.total !== 500) {
  fail(`All inclusive vacío → ${JSON.stringify(aiEmpty)}`);
}
ok("cantidad vacía All inclusive → 500");

const bono = byName["Bono de creditos"];
const bono1 = displayVenta(bono, 1);
if (bono1.unit !== 990 || bono1.total !== 990) fail(`Bono cuota 990 → ${JSON.stringify(bono1)}`);
ok("Bono de creditos usa cuota anual 990");

console.log("PASS");
process.exit(0);
