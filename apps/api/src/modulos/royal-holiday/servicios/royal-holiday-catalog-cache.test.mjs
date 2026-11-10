import assert from "node:assert/strict";
import test from "node:test";
import {
  getCatalogoVigente,
  invalidateCatalogoVigenteCache,
  previewCalculo,
} from "./royal-holiday-service.js";

const EMPRESA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CAT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function mockCatalogClient() {
  let fromCalls = 0;
  const cat = {
    id: CAT_ID,
    empresa_id: EMPRESA,
    version: 1,
    vigente_hasta: null,
  };
  const financiamiento = [
    { plazo_meses: 12, enganche_pct: 20, nacionalidad: "mexicano", tasa_anual: 18, mensualidad_factor: 0.1 },
    { plazo_meses: 24, enganche_pct: 20, nacionalidad: "mexicano", tasa_anual: 16, mensualidad_factor: 0.05 },
    { plazo_meses: 36, enganche_pct: 20, nacionalidad: "mexicano", tasa_anual: 14, mensualidad_factor: 0.04 },
  ];
  const comisiones = [
    {
      down_payment_pct: 20,
      hc_rango_min: 0,
      hc_rango_max: 9999,
      posicion: "liner",
      porcentaje: 5,
      ftb: 8,
      liner_closer: 8,
    },
  ];
  const client = {
    get fromCalls() {
      return fromCalls;
    },
    from(table) {
      fromCalls += 1;
      const payload = async () => {
        if (table === "catalogo_configuracion") return { data: cat, error: null };
        if (table === "rh_bottom_line") {
          return { data: [{ holiday_credits: 100, monto_usd: 20000 }], error: null };
        }
        if (table === "rh_financiamiento") return { data: financiamiento, error: null };
        if (table === "rh_comisiones") return { data: comisiones, error: null };
        if (table === "rh_regalos") return { data: [{ nombre: "iPad", costo_unitario: 400 }], error: null };
        if (table === "rh_costo_administrativo") {
          return { data: [{ enganche_pct_min: 0, enganche_pct_max: 100, monto_usd: 1500 }], error: null };
        }
        if (table === "rh_parametros_generales") return { data: { max_extra_dp: 3 }, error: null };
        return { data: null, error: { message: `unexpected ${table}` } };
      };
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        is() { return chain; },
        order() { return chain; },
        single: payload,
        maybeSingle: payload,
        then(resolve, reject) { return payload().then(resolve, reject); },
      };
      return chain;
    },
  };
  return client;
}

test("catálogo vigente: segundo get y preview reusan cache (sin repetir las 8 queries)", async () => {
  invalidateCatalogoVigenteCache();
  const client = mockCatalogClient();
  const first = await getCatalogoVigente(client, EMPRESA);
  const afterFirst = client.fromCalls;
  assert.ok(afterFirst >= 7, `carga inicial debe pegar las tablas, got ${afterFirst}`);

  const second = await getCatalogoVigente(client, EMPRESA);
  assert.equal(client.fromCalls, afterFirst, "segundo getCatalogo no debe ir a DB");
  assert.equal(second.catalogo.id, first.catalogo.id);
  assert.equal(second.regalos[0].nombre, "iPad");

  const previewA = await previewCalculo(client, EMPRESA, {
    holiday_credits: 100,
    monto_venta: 25000,
    enganche_pct: 20,
    posicion: "liner",
    nacionalidad: "mexicano",
    plazo_meses: 36,
  });
  const previewB = await previewCalculo(client, EMPRESA, {
    holiday_credits: 100,
    monto_venta: 26000,
    enganche_pct: 20,
    posicion: "liner",
    nacionalidad: "mexicano",
    plazo_meses: 24,
  });
  assert.equal(client.fromCalls, afterFirst, "previews no deben recargar catálogo");
  assert.equal(previewA.catalogo_configuracion_id, CAT_ID);
  assert.equal(previewB.catalogo_configuracion_id, CAT_ID);
  assert.notEqual(previewA.totales.enganche, previewB.totales.enganche);
});

test("invalidateCatalogoVigenteCache fuerza recarga", async () => {
  invalidateCatalogoVigenteCache();
  const client = mockCatalogClient();
  await getCatalogoVigente(client, EMPRESA);
  const afterFirst = client.fromCalls;
  invalidateCatalogoVigenteCache(EMPRESA);
  await getCatalogoVigente(client, EMPRESA);
  assert.equal(client.fromCalls, afterFirst * 2);
});
