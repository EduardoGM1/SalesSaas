/**
 * Caracterización Tramo B: construirRecordatorios / deep links / prefs / trabajo push.
 * Snapshots de salidas — deben ser idénticos byte a byte tras la extracción.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  extraerHoraRecordatorio,
  construirRecordatorios,
  normalizarPreferenciasNotificacion,
  digestOmitidoPorPrefs,
  omitirPorPrefsRecordatorio,
  resolverRutaPushDesdePayload,
  PushType,
  clasificarTipoRecordatorio,
  fechaRecordatorioValida,
  normalizarHoraRecordatorio,
  evaluarSendAt,
  construirCamposTrabajoPush,
} from "../index.js";
import { extractReminderTime, collectReminders } from "../../../lib/reminders.js";

const TODAY = "2026-10-17";

const DB_FIXTURE = {
  cal: {
    "2026-10": {
      days: {
        "15": [
          { t: "follow", time: "09:30", note: "Llamar", ts: 1, clientId: "c1", prospectId: "p1" },
          { t: "nota", note: "14:00 · Revisar docs", ts: 2 },
        ],
        "17": [
          { type: "follow", note: "Sin hora", ts: 3 },
        ],
        "20": [
          { t: "follow", time: "8:05", note: "Futuro", ts: 4 },
        ],
      },
    },
  },
  clients: {
    c2: {
      id: "c2",
      processDate: "2026-10-16",
      name: "Acme",
      processAmount: 100,
      prospectId: "p2",
    },
  },
};

test("contrato legacy: extractReminderTime === extraerHoraRecordatorio", () => {
  const e = { time: "9:05" };
  assert.equal(extractReminderTime(e), extraerHoraRecordatorio(e));
  assert.equal(extractReminderTime({ note: "10:15 · x" }), "10:15");
});

test("snapshot recordatorios (today fijo)", () => {
  const out = construirRecordatorios(DB_FIXTURE, { today: TODAY });
  const legacy = collectReminders(DB_FIXTURE, { today: TODAY });
  assert.equal(JSON.stringify(out), JSON.stringify(legacy));
  assert.equal(
    JSON.stringify(out),
    JSON.stringify([
      {
        id: "cal-2026-10-15-1",
        type: "follow-up",
        date: "2026-10-15",
        time: "09:30",
        due: "overdue",
        note: "Llamar",
        clientId: "c1",
        prospectId: "p1",
      },
      {
        id: "cal-2026-10-15-2",
        type: "note",
        date: "2026-10-15",
        time: "14:00",
        due: "overdue",
        note: "14:00 · Revisar docs",
        clientId: null,
        prospectId: null,
      },
      {
        id: "proc-c2",
        type: "processing",
        date: "2026-10-16",
        time: null,
        due: "overdue",
        note: "Procesamiento pendiente: Acme",
        clientId: "c2",
        prospectId: "p2",
        contract: null,
        amount: 100,
      },
      {
        id: "cal-2026-10-17-3",
        type: "follow-up",
        date: "2026-10-17",
        time: null,
        due: "today",
        note: "Sin hora",
        clientId: null,
        prospectId: null,
      },
      {
        id: "cal-2026-10-20-4",
        type: "follow-up",
        date: "2026-10-20",
        time: "08:05",
        due: "upcoming",
        note: "Futuro",
        clientId: null,
        prospectId: null,
      },
    ]),
  );
});

test("snapshot deep links por PushType", () => {
  const cases = [
    [{ type: PushType.SESSION_REVOKED }, "/login"],
    [{ type: PushType.CONNECTION_REQUEST }, "/network"],
    [{ type: PushType.FOLLOW_UP_REMINDER }, "/"],
    [{ type: PushType.SALES_TO_PROCESS }, "/sales"],
    [{ type: PushType.SCHEDULED_NOTE }, "/"],
    [{ type: PushType.SUPPORT_REPLY }, "/settings"],
    [{ path: "/clients/abc" }, "/clients/abc"],
    [{ type: PushType.SHARED_PROSPECT }, null],
  ];
  const snap = cases.map(([payload, expected]) => ({
    in: payload,
    out: resolverRutaPushDesdePayload(payload),
    expected,
  }));
  for (const row of snap) {
    assert.equal(row.out, row.expected, JSON.stringify(row.in));
  }
  assert.equal(
    JSON.stringify(snap.map((r) => r.out)),
    JSON.stringify(["/login", "/network", "/", "/sales", "/", "/settings", "/clients/abc", null]),
  );
});

test("snapshot prefs on/off", () => {
  assert.deepEqual(
    normalizarPreferenciasNotificacion({}),
    {
      messages: true,
      connection_requests: true,
      connection_accepted: true,
      shared_prospects: true,
      follow_up_reminders: true,
      sales_to_process: false,
      scheduled_notes: true,
    },
  );
  assert.deepEqual(
    normalizarPreferenciasNotificacion({
      messages: false,
      sales_to_process: true,
      follow_up_reminders: false,
    }),
    {
      messages: false,
      connection_requests: true,
      connection_accepted: true,
      shared_prospects: true,
      follow_up_reminders: false,
      sales_to_process: true,
      scheduled_notes: true,
    },
  );
  assert.equal(
    digestOmitidoPorPrefs(
      normalizarPreferenciasNotificacion({
        follow_up_reminders: false,
        sales_to_process: false,
        scheduled_notes: false,
      }),
    ),
    true,
  );
  assert.equal(
    omitirPorPrefsRecordatorio(normalizarPreferenciasNotificacion({ follow_up_reminders: false }), {
      esFollow: true,
      esNota: false,
    }),
    "prefs_off",
  );
});

test("snapshot validación previo a scheduled_push_jobs", () => {
  assert.deepEqual(clasificarTipoRecordatorio("follow"), { esFollow: true, esNota: false });
  assert.deepEqual(clasificarTipoRecordatorio("nota"), { esFollow: false, esNota: true });
  assert.equal(clasificarTipoRecordatorio("x").error, "Tipo de recordatorio no válido.");
  assert.equal(fechaRecordatorioValida("2026-10-17"), true);
  assert.equal(fechaRecordatorioValida("bad"), false);
  assert.equal(normalizarHoraRecordatorio("8:5"), "09:00");
  assert.equal(normalizarHoraRecordatorio("8:05"), "08:05");
  const late = evaluarSendAt(new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), Date.now());
  assert.equal(late.skipped, "too_late");
  const campos = construirCamposTrabajoPush({
    esFollow: true,
    date: "2026-10-17",
    time: "09:00",
    note: "Hola",
    entryKey: "k1",
    tag: "fu-tag",
  });
  assert.equal(
    JSON.stringify(campos),
    JSON.stringify({
      push_type: "follow_up_reminder",
      title: "Recordatorio de follow-up",
      body: "Follow-up: Hola",
      path: "/",
      tag: "fu-tag",
      entry_key: "k1",
      status: "pending",
      date: "2026-10-17",
      time: "09:00",
    }),
  );
});
