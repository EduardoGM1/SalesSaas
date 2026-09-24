import assert from "node:assert/strict";
import test from "node:test";
import { lookupBottomLine, lookupBottomLineByMonto } from "@salesapp/shared/calculations/royal-holiday.js";
import {
  ANEXO_A_MANTENIMIENTOS,
  RH_MANTENIMIENTO_2027_DESDE,
  catalogoParaFecha,
  filasBottomLine2027,
} from "@salesapp/shared/calculations/royal-holiday-bottom-line-2027.js";

const filas = filasBottomLine2027([
  { holiday_credits: 10000, precio_minimo_sin_iva: 9208.2, precio_minimo_con_iva: 10681.51 },
  { holiday_credits: 200000, precio_minimo_sin_iva: 88665, precio_minimo_con_iva: 102851.4 },
]);

test("Anexo A son 61 rangos y el último termina en 940,000", () => {
  assert.equal(ANEXO_A_MANTENIMIENTOS.length, 61);
  assert.equal(filas.length, 61);
  assert.equal(filas[0].holiday_credits, 0);
  assert.equal(filas.at(-1).holiday_credits, 920001);
  assert.equal(Math.max(...filas.map((row) => row.holiday_credits)), 920001);
  assert.equal(ANEXO_A_MANTENIMIENTOS.at(-1).hcMax, 940000);
});

test("criterios SDD-03: 3000, 105000 y 930000 HC", () => {
  const brz = lookupBottomLine(filas, 3000);
  assert.equal(brz.programa, "BRZ");
  assert.equal(brz.cuota_anual_mfee, 615);

  const royl = lookupBottomLine(filas, 105000);
  assert.equal(royl.programa, "ROYL");
  assert.equal(royl.cuota_anual_mfee, 3120);
  assert.equal(royl.holiday_credits, 100001);

  const alto = lookupBottomLine(filas, 930000);
  assert.equal(alto.programa, "ROYL");
  assert.equal(alto.cuota_anual_mfee, 20645);
  assert.equal(alto.holiday_credits, 920001);
});

test("el precio de board se copia solo cuando el rango ya existía", () => {
  const brz = filas.find((row) => row.holiday_credits === 0);
  assert.equal(brz.precio_minimo_con_iva, 0);
  const brzPlus = filas.find((row) => row.holiday_credits === 5001);
  assert.equal(brzPlus.precio_minimo_con_iva, 10681.51);
  const alto = filas.find((row) => row.holiday_credits === 920001);
  assert.equal(alto.precio_minimo_con_iva, 0);
});

test("una fila sin precio de board no gana la búsqueda por monto", () => {
  const match = lookupBottomLineByMonto(filas, 5000);
  assert.equal(match, null);
  const gold = lookupBottomLineByMonto(
    [
      { programa: "FANTASMA", holiday_credits: 900000, precio_minimo_con_iva: 0, cuota_anual_mfee: 1 },
      { programa: "GOLD", holiday_credits: 20001, precio_minimo_con_iva: 19167.58, cuota_anual_mfee: 1090 },
    ],
    19167.58,
  );
  assert.equal(gold.programa, "GOLD");
});

test("el corte del 23-sep-2026 separa 2026 y 2027", () => {
  const versions = [
    { id: "v6", version: 6, vigente_desde: "2026-08-12T02:39:34.509Z", vigente_hasta: "2026-09-23T06:00:00.000Z" },
    { id: "v7", version: 7, vigente_desde: "2026-09-23T06:00:00.000Z", vigente_hasta: null },
  ];
  assert.equal(catalogoParaFecha(versions, "2026-09-22").id, "v6");
  assert.equal(catalogoParaFecha(versions, RH_MANTENIMIENTO_2027_DESDE).id, "v7");
  assert.equal(catalogoParaFecha(versions, "2026-09-24").id, "v7");
});
