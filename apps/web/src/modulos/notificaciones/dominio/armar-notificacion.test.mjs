/**
 * Caracterización web Tramo B: armarNotificacion, fecha local, prefs, PushType bridge.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  armarNotificacion,
  truncar,
  fechaHoraLocalAIso,
  normalizarPreferenciasNotificacion,
  preferenciaHabilitadaParaTipo,
  tipoInAppDesdePushType,
  PushType,
  debeRespetarCooldown,
  VENTANA_DIGEST_MS,
} from "../fachada-node.js";

test("truncar + armarNotificacion snapshots", () => {
  assert.equal(truncar("abcdefghij", 5), "abcde...");
  const msg = armarNotificacion("mensaje_nuevo", {
    nombreRemitente: "Ana",
    mensaje: "hola",
    chatId: "u1",
  });
  assert.equal(
    JSON.stringify(msg),
    JSON.stringify({
      tipo: "mensaje_nuevo",
      titulo: "Nuevo mensaje",
      cuerpo: "Ana: hola",
      avatarUrl: undefined,
      rutaDestino: "/messages?with=u1",
      entidadId: "u1",
    }),
  );
  const venta = armarNotificacion("venta_pendiente", { cantidad: 3 });
  assert.equal(venta.agrupada, true);
  assert.equal(venta.titulo, "3 ventas pendientes");
  const follow = armarNotificacion("followup_pendiente", {
    nombreCliente: "Bob",
    motivo: "llamar",
    fecha: "2026-10-17",
  });
  assert.equal(follow.rutaDestino, "/?fecha=2026-10-17");
});

test("fechaHoraLocalAIso: forma ISO válida", () => {
  const iso = fechaHoraLocalAIso("2026-10-17", "09:30");
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(fechaHoraLocalAIso("bad"), null);
  // Misma entrada → misma salida (determinista en este proceso)
  assert.equal(fechaHoraLocalAIso("2026-10-17", "09:30"), iso);
});

test("prefs + bridge PushType", () => {
  const prefs = normalizarPreferenciasNotificacion({ sales_to_process: true, messages: false });
  assert.equal(preferenciaHabilitadaParaTipo(prefs, "mensaje_nuevo"), false);
  assert.equal(preferenciaHabilitadaParaTipo(prefs, "venta_pendiente"), true);
  assert.equal(tipoInAppDesdePushType(PushType.FOLLOW_UP_REMINDER), "followup_pendiente");
  assert.equal(tipoInAppDesdePushType(PushType.MESSAGE), "mensaje_nuevo");
});

test("cooldown digest", () => {
  const now = 1_000_000;
  assert.equal(debeRespetarCooldown(now - 1000, now, VENTANA_DIGEST_MS), true);
  assert.equal(debeRespetarCooldown(now - VENTANA_DIGEST_MS - 1, now, VENTANA_DIGEST_MS), false);
});
