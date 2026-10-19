/**
 * Contratos que no se renombran (Tramo A): valores wire de PushType, deep links,
 * claves sts4_* locales, prefs notifications.* y puentes tipo in-app.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  PushType,
  PUSH_A_TIPO,
  TIPO_A_PREF,
  normalizarPreferenciasNotificacion,
  CLAVE_DIGEST_LOCAL,
  CLAVE_FLUSH_LOCAL,
  VENTANA_DIGEST_MS,
  VENTANA_FLUSH_MS,
} from "../fachada-node.js";
import { resolvePushPathFromPayload } from "@salesapp/shared/push/notification-targets.js";

test("PushType: valores wire congelados", () => {
  assert.deepEqual(PushType, {
    MESSAGE: "message",
    CONNECTION_REQUEST: "connection_request",
    CONNECTION_ACCEPTED: "connection_accepted",
    SHARED_PROSPECT: "shared_prospect",
    PROSPECT_SECTION_CHANGED: "prospect_section_changed",
    CLOSER_ASSIGNED: "closer_assigned",
    PROSPECT_TRANSFERRED: "prospect_transferred",
    FOLLOW_UP_REMINDER: "follow_up_reminder",
    SALES_TO_PROCESS: "sales_to_process",
    SCHEDULED_NOTE: "scheduled_note",
    SESSION_REVOKED: "session_revoked",
    SUPPORT_REPLY: "respuesta_soporte",
  });
});

test("deep links por PushType sin path explícito", () => {
  const sinPath = Object.fromEntries(
    Object.values(PushType).map((type) => [type, resolvePushPathFromPayload({ type })]),
  );
  assert.deepEqual(sinPath, {
    message: null,
    connection_request: "/network",
    connection_accepted: "/network",
    shared_prospect: null,
    prospect_section_changed: null,
    closer_assigned: null,
    prospect_transferred: null,
    follow_up_reminder: "/",
    sales_to_process: "/sales",
    scheduled_note: "/",
    session_revoked: "/login",
    respuesta_soporte: "/settings",
  });
  assert.equal(resolvePushPathFromPayload({ type: "message", path: "/messages?with=u1" }), "/messages?with=u1");
  assert.equal(resolvePushPathFromPayload({ url: "https://h.example/clients/p1?x=1#s" }), "/clients/p1?x=1#s");
  assert.equal(resolvePushPathFromPayload({ url: "https://h.example/", type: "sales_to_process" }), "/sales");
});

test("puentes PushType → tipo in-app → pref", () => {
  assert.deepEqual(PUSH_A_TIPO, {
    message: "mensaje_nuevo",
    connection_request: "solicitud_contacto",
    connection_accepted: "solicitud_aceptada",
    shared_prospect: "expediente_compartido",
    prospect_section_changed: "expediente_compartido",
    closer_assigned: "cerrador_asignado",
    prospect_transferred: "expediente_transferido",
    follow_up_reminder: "followup_pendiente",
    sales_to_process: "venta_pendiente",
    scheduled_note: "nota_programada",
    respuesta_soporte: "respuesta_soporte",
  });
  assert.deepEqual(TIPO_A_PREF, {
    mensaje_nuevo: "messages",
    solicitud_contacto: "connection_requests",
    solicitud_aceptada: "connection_accepted",
    expediente_compartido: "shared_prospects",
    cerrador_asignado: "shared_prospects",
    expediente_transferido: "shared_prospects",
    followup_pendiente: "follow_up_reminders",
    venta_pendiente: "sales_to_process",
    nota_programada: "scheduled_notes",
  });
});

test("prefs notifications.*: claves y defaults", () => {
  assert.deepEqual(normalizarPreferenciasNotificacion({}), {
    messages: true,
    connection_requests: true,
    connection_accepted: true,
    shared_prospects: true,
    follow_up_reminders: true,
    sales_to_process: false,
    scheduled_notes: true,
  });
});

test("claves sts4_* y ventanas locales", () => {
  assert.equal(CLAVE_DIGEST_LOCAL, "sts4_reminder_digest_at");
  assert.equal(CLAVE_FLUSH_LOCAL, "sts4_reminder_flush_at");
  assert.equal(VENTANA_DIGEST_MS, 900_000);
  assert.equal(VENTANA_FLUSH_MS, 45_000);
});
