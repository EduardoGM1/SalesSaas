/**
 * Contrato del cliente web de /api/v1/notifications/* (paths, métodos y cuerpos sin cambio).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { notificationsApi } from "../../../lib/notifications-api.js";

function conFetch(respuesta) {
  const llamadas = [];
  globalThis.fetch = async (url, opts = {}) => {
    llamadas.push({ url, ...opts });
    return respuesta;
  };
  return llamadas;
}

const ok = (body) => ({ ok: true, json: async () => body });

test("endpoints, métodos y cuerpos", async () => {
  const llamadas = conFetch(ok({ data: { v: 1 } }));
  assert.deepEqual(await notificationsApi.config(), { v: 1 });
  await notificationsApi.status();
  await notificationsApi.pushDiagnostics();
  await notificationsApi.registerDevice("sub-1");
  await notificationsApi.digestReminders({ timezone_offset_minutes: 360 });
  await notificationsApi.digestReminders();
  await notificationsApi.scheduleReminder({ type: "follow", send_at: "2026-10-19T16:30:00.000Z" });
  await notificationsApi.flushReminders();

  const json = { "Content-Type": "application/json" };
  assert.deepEqual(llamadas, [
    { url: "/api/v1/notifications/config", credentials: "include" },
    { url: "/api/v1/notifications/status", credentials: "include" },
    { url: "/api/v1/notifications/push-diagnostics", credentials: "include" },
    { url: "/api/v1/notifications/device", credentials: "include", method: "POST", headers: json, body: '{"subscription_id":"sub-1"}' },
    { url: "/api/v1/notifications/digest-reminders", credentials: "include", method: "POST", headers: json, body: '{"timezone_offset_minutes":360}' },
    { url: "/api/v1/notifications/digest-reminders", credentials: "include", method: "POST", headers: json, body: "{}" },
    { url: "/api/v1/notifications/schedule-reminder", credentials: "include", method: "POST", headers: json, body: '{"type":"follow","send_at":"2026-10-19T16:30:00.000Z"}' },
    { url: "/api/v1/notifications/flush-reminders", credentials: "include", method: "POST", headers: json, body: "{}" },
  ]);
});

test("respuesta sin data, error HTTP y cuerpo no JSON", async () => {
  conFetch(ok({ skipped: "prefs_off" }));
  assert.deepEqual(await notificationsApi.flushReminders(), { skipped: "prefs_off" });

  conFetch({ ok: false, json: async () => ({ error: "No autorizado." }) });
  await assert.rejects(notificationsApi.status(), /No autorizado\./);

  conFetch({ ok: false, json: async () => { throw new Error("no json"); } });
  await assert.rejects(notificationsApi.config(), /Error de red\./);

  conFetch({ ok: true, json: async () => { throw new Error("no json"); } });
  assert.deepEqual(await notificationsApi.config(), {});
});
