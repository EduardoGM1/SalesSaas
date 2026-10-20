/**
 * Golden master de ventas (lógica pura).
 * Mismos nombres y resultados antes y después del move a modulos/ventas.
 * No unifica isSaleCountable con isProcessableSale. No ejecuta db-store.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");
const FACHADA = resolve(HERE, "../fachada-node.js");
const ENTRY = resolve(HERE, ".tmp-ventas-entry.mjs");
const OUT = resolve(HERE, ".tmp-ventas-calculo.mjs");
const DB_STORE = resolve(WEB_SRC, "stores/db-store.ts");

const LEGACY_ENTRY = `export {
  isSaleCancelled,
  isSaleCountable,
  isSaleTourCountable,
  isActiveAgendaSale,
  isCancelledAgendaSale,
  collectSalesForMonth,
  collectCountableSalesForMonth,
} from "@/lib/sales/agenda-sales.ts";
export { resolveSaleProcessDate, isSaleFormValid } from "@/lib/sales/form-valid.ts";
export { collectAllSales, filterSales, countAllSales, findSaleById } from "@/lib/sales/collect.ts";
export { buildSaleSnapshot, withSaleSnapshot } from "@/lib/sales/snapshot.ts";
`;

function bundle(entry) {
  const aliasRoot = WEB_SRC.replace(/\\/g, "/");
  execSync(
    [
      "npx --yes esbuild",
      `"${entry.replace(/\\/g, "/")}"`,
      "--bundle",
      "--format=esm",
      "--platform=neutral",
      `--outfile="${OUT.replace(/\\/g, "/")}"`,
      `--alias:@=${aliasRoot}`,
      "--log-level=error",
    ].join(" "),
    { stdio: "pipe" },
  );
  return import(pathToFileURL(OUT).href + `?t=${Date.now()}`);
}

let pending;
function load() {
  if (!pending) {
    pending = (async () => {
      if (fs.existsSync(FACHADA)) return bundle(FACHADA);
      fs.writeFileSync(ENTRY, LEGACY_ENTRY);
      return bundle(ENTRY);
    })();
  }
  return pending;
}

/** Copia de isProcessableSale en db-store. No mira tourCuantificable. */
function isProcessableSale(sale) {
  if (String(sale?.status || "") === "cancelada") return false;
  return String(sale?.status || "venta") !== "pendiente"
    && String(sale?.processing || "venta") !== "pendiente";
}

function nombreCliente(client) {
  return client?.name1 || client?.name || "Prospecto";
}

/**
 * Forma de la fila de agenda que nace al registrar una venta (registerClientSale
 * + ensureSaleInClientAndAgenda). No sustituye al store.
 */
function filaAgendaLocal(sale, client, ahora) {
  const status = sale.status || "venta";
  const pendiente = status === "pendiente";
  const normalizada = {
    ...sale,
    status,
    processing: pendiente ? "pendiente" : "venta",
    processDate: pendiente ? (sale.processDate || "") : "",
    addProcessingFollowup: pendiente && !!sale.addProcessingFollowup,
  };
  const clientId = client.id;
  const prospectId = client.prospectId || clientId;
  const clientName = nombreCliente(client);
  const conservar = isProcessableSale(normalizada) || status === "cancelada";
  if (conservar) {
    return {
      t: "venta",
      saleId: normalizada.saleId,
      vol: normalizada.vol,
      tours: normalizada.tours,
      note: [clientName, normalizada.contract ? `Folio ${normalizada.contract}` : "", normalizada.note].filter(Boolean).join(" · "),
      contract: normalizada.contract,
      status: normalizada.status,
      processing: normalizada.processing,
      processDate: normalizada.processDate,
      clientId,
      prospectId,
      clientName,
      ts: normalizada.ts,
      source: "client",
    };
  }
  if (normalizada.addProcessingFollowup && normalizada.processDate) {
    return {
      t: "follow",
      saleId: normalizada.saleId,
      note: `Procesar venta pendiente - Cliente ${clientName}${normalizada.contract ? ` - Folio ${normalizada.contract}` : ""}`,
      status: normalizada.status,
      processing: "pendiente",
      processDate: normalizada.processDate,
      clientId,
      prospectId,
      clientName,
      ts: ahora,
      source: "client-sale-processing",
      kind: "procesamiento-venta",
      completed: false,
    };
  }
  return null;
}

function fila(mod, sale, client, ahora) {
  const fn = mod.filaAgendaDeVenta || filaAgendaLocal;
  return fn(sale, client, ahora);
}

const cliente = { id: "c1", prospectId: "p1", name1: "Ana" };

test("isSaleCountable: venta cuenta; cancelada, pendiente y processing pendiente no", async () => {
  const { isSaleCountable, isSaleCancelled } = await load();
  assert.equal(isSaleCountable({ status: "venta" }), true);
  assert.equal(isSaleCountable({}), true);
  assert.equal(isSaleCancelled({ status: "cancelada" }), true);
  assert.equal(isSaleCountable({ status: "cancelada" }), false);
  assert.equal(isSaleCountable({ status: "pendiente" }), false);
  assert.equal(isSaleCountable({ status: "venta", processing: "pendiente" }), false);
  assert.equal(isSaleCountable({ status: "perdido" }), true);
  assert.equal(isSaleCountable({ status: "cerrado" }), true);
  assert.equal(isSaleCountable({ status: "bback" }), true);
});

test("isSaleCountable y isProcessableSale no se unifican: tourCuantificable solo cuenta en la primera", async () => {
  const { isSaleCountable } = await load();
  const venta = { status: "venta", processing: "venta", tourCuantificable: false };
  assert.equal(isSaleCountable(venta), false);
  assert.equal(isProcessableSale(venta), true);
  const pendiente = { status: "pendiente", tourCuantificable: true };
  assert.equal(isSaleCountable(pendiente), false);
  assert.equal(isProcessableSale(pendiente), false);
  const src = fs.readFileSync(DB_STORE, "utf8");
  const cuerpo = src.match(/function isProcessableSale[\s\S]*?\n\}/);
  assert.ok(cuerpo, "isProcessableSale sigue en db-store");
  assert.equal(cuerpo[0].includes("tourCuantificable"), false);
  assert.match(cuerpo[0], /!== "pendiente"/);
});

test("isSaleTourCountable incluye pendiente y excluye tour no cuantificable", async () => {
  const { isSaleTourCountable } = await load();
  assert.equal(isSaleTourCountable({ status: "pendiente" }), true);
  assert.equal(isSaleTourCountable({ tourCuantificable: false }), false);
  assert.equal(isSaleTourCountable({}), true);
});

test("isActiveAgendaSale: venta y cancelada sí; pendiente, sin saleId y completed no", async () => {
  const { isActiveAgendaSale, isCancelledAgendaSale } = await load();
  const db = {
    clients: {
      c1: {
        id: "c1",
        sales: [
          { saleId: "ok", status: "venta", processing: "venta" },
          { saleId: "caida", status: "perdido", processing: "venta" },
          { saleId: "canc", status: "cancelada" },
          { saleId: "pend", status: "pendiente", processing: "pendiente" },
          { saleId: "tour", status: "venta", processing: "venta", tourCuantificable: false },
        ],
      },
    },
  };
  assert.equal(isActiveAgendaSale(db, { t: "venta", saleId: "ok" }), true);
  assert.equal(isCancelledAgendaSale(db, { t: "venta", saleId: "ok" }), false);
  assert.equal(isActiveAgendaSale(db, { t: "venta", saleId: "caida" }), true);
  assert.equal(isActiveAgendaSale(db, { t: "venta", saleId: "canc" }), true);
  assert.equal(isCancelledAgendaSale(db, { t: "venta", saleId: "canc" }), true);
  assert.equal(isActiveAgendaSale(db, { t: "venta", saleId: "pend" }), false);
  assert.equal(isActiveAgendaSale(db, { t: "venta", saleId: "tour" }), false);
  assert.equal(isActiveAgendaSale(db, { t: "venta", saleId: "ausente" }), false);
  assert.equal(isActiveAgendaSale(db, { t: "venta", completed: true, saleId: "ok" }), false);
  assert.equal(isActiveAgendaSale(db, { t: "nota", saleId: "ok" }), false);
});

test("form-valid: montos 0, decimales y negativos; fecha de proceso", async () => {
  const { isSaleFormValid, resolveSaleProcessDate } = await load();
  assert.equal(isSaleFormValid({ vol: "0", contract: "F", status: "venta", date: "2026-10-20" }), false);
  assert.equal(isSaleFormValid({ vol: "-12.5", contract: "F", status: "venta", date: "2026-10-20" }), false);
  assert.equal(isSaleFormValid({ vol: "1500.50", contract: "F", status: "venta", date: "2026-10-20" }), true);
  assert.equal(isSaleFormValid({ vol: "1,250.75", contract: "F", status: "venta", date: "2026-10-20" }), true);
  assert.equal(isSaleFormValid({ vol: "10", contract: "  ", status: "venta" }), false);
  assert.equal(isSaleFormValid({ vol: "10", contract: "F", status: "pendiente", date: "", processDate: "" }), false);
  assert.equal(
    resolveSaleProcessDate({ status: "pendiente", processDate: "", date: "2026-10-20" }),
    "2026-10-20",
  );
  assert.equal(
    resolveSaleProcessDate({ status: "venta", processDate: "2026-11-01", date: "2026-10-20" }),
    "2026-11-01",
  );
  assert.equal(
    resolveSaleProcessDate({ status: "pendiente", processDate: "2026-10-21", date: "2026-10-20" }),
    "2026-10-21",
  );
});

test("America/Cancun: la fecha YMD no se corre de día (el dominio no usa Date)", async () => {
  const { collectSalesForMonth, collectCountableSalesForMonth } = await load();
  const clients = {
    c1: {
      id: "c1",
      name1: "Ana",
      tour_cuantificable: true,
      sales: [
        { saleId: "d20", date: "2026-10-20", vol: 10, tours: 2, ts: 1, status: "venta" },
        { saleId: "d01", date: "2026-10-01", vol: 1, tours: 1, ts: 2, status: "pendiente" },
        { saleId: "sep", date: "2026-09-30", vol: 9, tours: 1, ts: 3, status: "venta" },
      ],
    },
  };
  const mes = collectSalesForMonth(clients, 2026, 9);
  assert.deepEqual(mes.map((s) => s.day), [20, 1]);
  assert.equal(mes[0].date, "2026-10-20");
  assert.equal(mes[0].vol, 10);
  const contables = collectCountableSalesForMonth(clients, 2026, 9);
  assert.deepEqual(contables.map((s) => s.saleId), ["d20"]);
});

test("collect, filter y snapshot", async () => {
  const { collectAllSales, filterSales, countAllSales, findSaleById, buildSaleSnapshot, withSaleSnapshot } = await load();
  const client = {
    id: "c1",
    name1: "Ana",
    prospectCode: "P1",
    name: "Ana López",
    contract: "C-9",
    data: { survey: { stype: "hotel" }, worksheet: {}, vacaciones: { nights: 3 } },
    sales: [
      { saleId: "s1", date: "2026-10-20", vol: 10, tours: 1, ts: 5, status: "venta" },
      { saleId: "s0", date: "2026-10-20", vol: 1, tours: 1, ts: 1, status: "cancelada" },
    ],
  };
  const db = {
    clients: { c1: client },
    sales: {
      sArch: { saleId: "sArch", date: "2026-08-01", vol: 4, tours: 1, ts: 9, clientName: "Archivo" },
    },
  };
  assert.equal(countAllSales(db), 3);
  const all = collectAllSales(db);
  assert.deepEqual(all.map((s) => s.saleId), ["s1", "s0", "sArch"]);
  assert.equal(all[0].clientName, "Ana");
  assert.equal(all[0].prospectCode, "P1");
  const soloCancelada = filterSales(all, { status: "cancelada", from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(soloCancelada.map((s) => s.saleId), ["s0"]);
  const hallada = findSaleById(db, "s1");
  assert.equal(hallada.clientId, "c1");
  assert.equal(hallada.snapshot.tools.survey.stype, "hotel");
  assert.equal(hallada.snapshot.tools.worksheet, undefined);
  assert.equal(hallada.snapshot.tools.vacaciones.nights, 3);
  const snap = buildSaleSnapshot(client);
  client.data.survey.stype = "otro";
  assert.equal(snap.tools.survey.stype, "hotel");
  const con = withSaleSnapshot(client, { saleId: "s9", date: "2026-10-20", vol: 1, tours: 1, ts: 1 });
  assert.equal(con.clientName, "Ana");
  assert.equal(con.snapshot.prospectSummary.contract, "C-9");
  assert.equal(findSaleById(db, "no"), undefined);
});

test("fila de agenda: venta sin processDate; follow con procesamiento-venta; caída perdido sigue como venta", async () => {
  const mod = await load();
  const base = { saleId: "s1", date: "2026-10-20", vol: 1500.5, tours: 1, contract: "F-1", note: "ok", ts: 1000 };
  const venta = fila(mod, { ...base, status: "venta", processDate: "2026-11-02" }, cliente, 2000);
  assert.equal(venta.t, "venta");
  assert.equal(venta.processDate, "");
  assert.equal(venta.kind, undefined);
  assert.equal(venta.source, "client");
  assert.equal(venta.note, "Ana · Folio F-1 · ok");
  assert.equal(venta.vol, 1500.5);
  assert.equal(venta.ts, 1000);
  assert.equal(venta.prospectId, "p1");

  const cancelada = fila(mod, { ...base, status: "cancelada", processDate: "2026-11-02" }, cliente, 2000);
  assert.equal(cancelada.t, "venta");
  assert.equal(cancelada.status, "cancelada");
  assert.equal(cancelada.processDate, "");
  assert.equal(cancelada.processing, "venta");

  const caida = fila(mod, { ...base, status: "perdido", vol: -3 }, cliente, 2000);
  assert.equal(caida.t, "venta");
  assert.equal(caida.status, "perdido");
  assert.equal(caida.vol, -3);

  const follow = fila(mod, {
    ...base,
    status: "pendiente",
    processDate: "2026-10-21",
    addProcessingFollowup: true,
  }, cliente, 2000);
  assert.deepEqual(follow, {
    t: "follow",
    saleId: "s1",
    note: "Procesar venta pendiente - Cliente Ana - Folio F-1",
    status: "pendiente",
    processing: "pendiente",
    processDate: "2026-10-21",
    clientId: "c1",
    prospectId: "p1",
    clientName: "Ana",
    ts: 2000,
    source: "client-sale-processing",
    kind: "procesamiento-venta",
    completed: false,
  });

  assert.equal(fila(mod, { ...base, status: "pendiente", processDate: "2026-10-21" }, cliente, 2000), null);

  const src = fs.readFileSync(DB_STORE, "utf8");
  assert.match(src, /t: "venta"/);
  assert.match(src, /kind: "procesamiento-venta"/);
  assert.match(src, /source: "client-sale-processing"/);
  assert.match(src, /processDate: status === "pendiente" \? sale\.processDate : ""/);
});
