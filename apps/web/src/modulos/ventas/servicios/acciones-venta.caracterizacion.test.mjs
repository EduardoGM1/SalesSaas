/**
 * Caracterización del Tramo A, antes de mover la UI.
 * La acción no escribe la fila: llama al store. El store (fuera de este tramo)
 * es quien persiste la venta y la agenda.
 *
 * E2E de UI de /sales: no hay spec en e2e/. El egress sigue apuntando al
 * repositorio de API y no se toca aquí.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");
const LEGACY_ACTIONS = resolve(WEB_SRC, "actions/sales.js");
const MOVED_ACTIONS = resolve(HERE, "acciones-venta.js");
const LEGACY_HOOK = resolve(WEB_SRC, "hooks/use-sale-actions.js");
const MOVED_HOOK = resolve(HERE, "../hooks/use-sale-actions.js");
const FACHADA = resolve(HERE, "../fachada-node.js");

function actionsPath() {
  return existsSync(MOVED_ACTIONS) ? MOVED_ACTIONS : LEGACY_ACTIONS;
}
function hookPath() {
  return existsSync(MOVED_HOOK) ? MOVED_HOOK : LEGACY_HOOK;
}

test("superficie: validateSaleForm y saveClientSale delegan en el store", () => {
  const src = readFileSync(actionsPath(), "utf8");
  assert.match(src, /export function validateSaleForm/);
  assert.match(src, /export function saveClientSale/);
  assert.match(src, /store\.registerClientSale\(clientId, payload\)/);
  assert.match(src, /store\.updateClientSale\(clientId, editingSaleId, payload\)/);
  assert.match(src, /scheduleReminderPush\(/);
  assert.match(src, /type: "follow-up"/);
  assert.match(src, /entryKey: `sale-proc-/);
  assert.equal(src.includes("ensureSaleInClientAndAgenda"), false);
  assert.equal(src.includes("findCalEntries"), false);
});

test("hook: useSaleActions solo reexpone saveSale", () => {
  const src = readFileSync(hookPath(), "utf8");
  assert.match(src, /export function useSaleActions/);
  assert.match(src, /saveClientSale\(clientId, saleForm, editingSaleId\)/);
  assert.match(src, /return \{ saveSale \}/);
});

function bundleActions() {
  const dir = resolve(tmpdir(), `saletse-venta-accion-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const toast = resolve(dir, "toast.mjs");
  const i18n = resolve(dir, "i18n.mjs");
  const db = resolve(dir, "db.mjs");
  const notif = resolve(dir, "notif.mjs");
  const out = resolve(dir, "out.mjs");
  writeFileSync(toast, `globalThis.__saleToasts = [];
export const toast = {
  error(m) { globalThis.__saleToasts.push(["error", m]); },
  success(m) { globalThis.__saleToasts.push(["success", m]); },
};
`);
  writeFileSync(i18n, `export function translate(k) { return k; }\n`);
  writeFileSync(db, `globalThis.__saleCalls = [];
export const useDbStore = {
  getState() {
    return {
      registerClientSale(clientId, sale) {
        globalThis.__saleCalls.push({ op: "register", clientId, sale });
      },
      updateClientSale(clientId, saleId, sale) {
        globalThis.__saleCalls.push({ op: "update", clientId, saleId, sale });
      },
    };
  },
};
`);
  writeFileSync(notif, `globalThis.__saleReminders = [];
export function scheduleReminderPush(job) { globalThis.__saleReminders.push(job); }
`);
  const aliasRoot = WEB_SRC.replace(/\\/g, "/");
  execSync(
    [
      "npx --yes esbuild",
      `"${actionsPath().replace(/\\/g, "/")}"`,
      "--bundle",
      "--format=esm",
      "--platform=neutral",
      `--outfile="${out.replace(/\\/g, "/")}"`,
      `--alias:@=${aliasRoot}`,
      `--alias:@/lib/toast=${toast.replace(/\\/g, "/")}`,
      `--alias:@/lib/i18n.js=${i18n.replace(/\\/g, "/")}`,
      `--alias:@/stores/db-store=${db.replace(/\\/g, "/")}`,
      `--alias:@/modulos/notificaciones=${notif.replace(/\\/g, "/")}`,
      `--alias:@/modulos/ventas=${FACHADA.replace(/\\/g, "/")}`,
      "--log-level=error",
    ].join(" "),
    { stdio: "pipe" },
  );
  return {
    mod: import(pathToFileURL(out).href + `?t=${Date.now()}`),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("validateSaleForm: venta válida, rechazos y pendiente", async () => {
  const bundled = bundleActions();
  try {
    const { validateSaleForm } = await bundled.mod;
    globalThis.__saleToasts = [];
    assert.equal(validateSaleForm({ vol: "0", contract: "F", date: "2026-10-20", status: "venta" }), null);
    assert.equal(validateSaleForm({ vol: "1500", contract: "  ", date: "2026-10-20", status: "venta" }), null);

    const venta = validateSaleForm({
      vol: "1,500.50",
      tours: "2",
      contract: "VB1",
      date: "2026-10-20",
      status: "venta",
      processDate: "2026-11-02",
      note: "nota",
      addProcessingFollowup: true,
    });
    assert.deepEqual(venta, {
      date: "2026-10-20",
      vol: 1500.5,
      tours: 2,
      contract: "VB1",
      status: "venta",
      processDate: "",
      note: "nota",
      addProcessingFollowup: true,
    });

    assert.equal(validateSaleForm({
      vol: "1500",
      contract: "VB1",
      date: "",
      status: "pendiente",
      processDate: "",
    }), null);

    const pendiente = validateSaleForm({
      vol: "1500",
      contract: "VB1",
      date: "2026-10-20",
      status: "pendiente",
      processDate: "",
      note: "",
      addProcessingFollowup: false,
    });
    assert.equal(pendiente.processDate, "2026-10-20");
    assert.equal(pendiente.status, "pendiente");
  } finally {
    bundled.cleanup();
  }
});

test("saveClientSale: alta, edición y recordatorio de pendiente", async () => {
  const bundled = bundleActions();
  try {
    const { saveClientSale } = await bundled.mod;
    globalThis.__saleCalls = [];
    globalThis.__saleReminders = [];
    globalThis.__saleToasts = [];

    const created = saveClientSale("c1", {
      vol: "1500",
      contract: "VB1",
      date: "2026-12-20",
      status: "venta",
      tours: "1",
      note: "",
      addProcessingFollowup: false,
    });
    assert.equal(created.ok, true);
    assert.equal(globalThis.__saleCalls.length, 1);
    assert.equal(globalThis.__saleCalls[0].op, "register");
    assert.equal(globalThis.__saleCalls[0].clientId, "c1");
    assert.equal(globalThis.__saleCalls[0].sale.date, "2026-12-20");
    assert.equal(globalThis.__saleCalls[0].sale.vol, 1500);
    assert.equal(globalThis.__saleCalls[0].sale.processDate, "");
    assert.equal(globalThis.__saleReminders.length, 0);

    globalThis.__saleCalls = [];
    const edited = saveClientSale("c1", {
      vol: "1500",
      contract: "VB1",
      date: "2026-12-20",
      status: "venta",
      tours: "1",
      note: "editada",
    }, "sale-1");
    assert.equal(edited.ok, true);
    assert.equal(globalThis.__saleCalls[0].op, "update");
    assert.equal(globalThis.__saleCalls[0].saleId, "sale-1");
    assert.equal(globalThis.__saleCalls[0].sale.note, "editada");

    globalThis.__saleCalls = [];
    globalThis.__saleReminders = [];
    const pending = saveClientSale("c1", {
      vol: "1500",
      contract: "VB1",
      date: "2026-12-20",
      status: "pendiente",
      processDate: "2026-12-21",
      addProcessingFollowup: true,
      tours: "1",
      note: "",
    });
    assert.equal(pending.ok, true);
    assert.equal(globalThis.__saleCalls[0].op, "register");
    assert.equal(globalThis.__saleCalls[0].sale.processDate, "2026-12-21");
    assert.equal(globalThis.__saleReminders.length, 1);
    assert.equal(globalThis.__saleReminders[0].type, "follow-up");
    assert.equal(globalThis.__saleReminders[0].date, "2026-12-21");
    assert.match(globalThis.__saleReminders[0].entryKey, /^sale-proc-c1-2026-12-21-VB1$/);
  } finally {
    bundled.cleanup();
  }
});
