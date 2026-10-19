/**
 * Caracterización de la lógica pura extraída en el Tramo A
 * (respaldo push, presentación de toast, item del Toaster, cuerpo de schedule-reminder).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  datosRespaldoDesdePush,
  VENTANA_AGRUPACION_MS,
  iconoToastDesdePayload,
  claveAgrupacion,
  opcionesToastDesdePayload,
  MAX_TOASTS_VISIBLES,
  duracionToast,
  toastEsVacio,
  armarItemToast,
  armarProgramacionRecordatorio,
  fechaHoraLocalAIso,
} from "../fachada-node.js";

test("datosRespaldoDesdePush: mensajes y contactos", () => {
  assert.deepEqual(
    datosRespaldoDesdePush("mensaje_nuevo", { title: "Ana", body: "hola", path: "/messages?with=u7&conversation=cv1", avatarUrl: "https://x/b.png" }),
    { nombreRemitente: "Ana", mensaje: "hola", avatarRemitente: "https://x/b.png", chatId: "u7", conversationId: "cv1", rutaDestino: "/messages?with=u7&conversation=cv1" },
  );
  assert.deepEqual(
    datosRespaldoDesdePush("mensaje_nuevo", { title: "", body: "" }),
    { nombreRemitente: "Nuevo mensaje", mensaje: "", avatarRemitente: undefined, chatId: "unknown", conversationId: undefined, rutaDestino: undefined },
  );
  assert.deepEqual(
    datosRespaldoDesdePush("solicitud_contacto", { title: "Solicitud", body: "Beto quiere conectar contigo" }),
    { nombreSolicitante: "Beto", avatarSolicitante: undefined, solicitudId: "Solicitud" },
  );
  assert.equal(datosRespaldoDesdePush("solicitud_contacto", { title: "Carlos", body: "" }).nombreSolicitante, "Carlos");
  assert.deepEqual(
    datosRespaldoDesdePush("solicitud_aceptada", { title: "x", body: "Caro aceptó tu solicitud", path: "/messages?with=u3" }),
    { nombreContacto: "Caro", avatarContacto: undefined, contactoId: "u3", chatId: "u3" },
  );
});

test("datosRespaldoDesdePush: expedientes, agenda, ventas y soporte", () => {
  assert.deepEqual(
    datosRespaldoDesdePush("expediente_compartido", { body: "Dani te compartió «Familia Ruiz» con acceso de edición", path: "/red/x" }),
    { nombreQuienComparte: "Dani", nombreCliente: "Familia Ruiz", nivelAcceso: "edición", avatarQuienComparte: undefined, expedienteId: "shared", rutaDestino: "/red/x" },
  );
  assert.deepEqual(
    datosRespaldoDesdePush("cerrador_asignado", { title: "Reasignado", body: "", path: "/clients/abc%20d/x?y=1" }),
    { cuerpo: "Reasignado", expedienteId: "abc d", rutaDestino: "/clients/abc%20d/x?y=1", reasignado: true },
  );
  assert.deepEqual(
    datosRespaldoDesdePush("followup_pendiente", { title: "Follow-up", body: "Llamar a Eva" }),
    { nombreCliente: "Llamar a Eva", motivo: null, fecha: null, expedienteId: "followup" },
  );
  assert.deepEqual(datosRespaldoDesdePush("venta_pendiente", { title: "Ventas", body: "Tienes 3 ventas por procesar" }), { cantidad: 3 });
  assert.deepEqual(
    datosRespaldoDesdePush("venta_pendiente", { title: "x", body: "Fer" }),
    { cantidad: 1, nombreCliente: "Fer", monto: 0, ventaId: "pending" },
  );
  assert.deepEqual(
    datosRespaldoDesdePush("nota_programada", { title: "Gabo", body: "Revisar" }),
    { nombreCliente: "Gabo", contenidoNota: "Revisar", expedienteId: "nota" },
  );
  assert.deepEqual(
    datosRespaldoDesdePush("respuesta_soporte", { title: "Soporte", body: "Soporte respondió: listo", path: "/settings?supportTicket=tk9" }),
    { ticketId: "tk9", fragmento: "listo" },
  );
  assert.equal(datosRespaldoDesdePush("expediente_transferido", { title: "x", body: "y" }), null);
});

test("presentación del toast in-app", () => {
  assert.equal(VENTANA_AGRUPACION_MS, 30_000);
  assert.equal(iconoToastDesdePayload({ tipo: "mensaje_nuevo" }), "message");
  assert.equal(iconoToastDesdePayload({ tipo: "followup_pendiente", iconoCategoria: "ventas" }), "sales_to_process");
  assert.equal(iconoToastDesdePayload({ tipo: "respuesta_soporte" }), "bell");
  assert.equal(claveAgrupacion("venta_pendiente", { tipo: "venta_pendiente", entidadId: "v9" }), "venta_pendiente:multiple");
  assert.equal(claveAgrupacion("mensaje_nuevo", { tipo: "mensaje_nuevo", entidadId: "c1" }), "mensaje_nuevo:c1");
  const payload = { tipo: "nota_programada", entidadId: "p5", titulo: "T", cuerpo: "B", rutaDestino: "/" };
  assert.deepEqual(opcionesToastDesdePayload(payload), {
    title: "T", body: "B", avatarUrl: null, icon: "scheduled_note", href: "/", duration: 5500, groupKey: "nota_programada:p5",
  });
  assert.equal(opcionesToastDesdePayload(payload, "g").groupKey, "g");
});

test("item del Toaster", () => {
  assert.equal(MAX_TOASTS_VISIBLES, 3);
  assert.equal(toastEsVacio({ title: "  ", body: "" }), true);
  assert.equal(toastEsVacio({ message: "x" }), false);
  assert.equal(duracionToast({}), 3000);
  assert.equal(duracionToast({ type: "error" }), 4500);
  assert.equal(duracionToast({ variant: "notification", type: "error" }), 5500);
  assert.equal(duracionToast({ duration: 0 }), 0);
  assert.deepEqual(armarItemToast({ title: " T ", body: "B", variant: "notification", icon: "message", href: "/x", groupKey: "g" }, 4), {
    id: 4, msg: "T — B", title: "T", body: "B", type: "info", variant: "notification", icon: "message", avatarUrl: null, href: "/x", onClick: null, groupKey: "g",
  });
  assert.deepEqual(armarItemToast({ message: "ok", type: "success" }, 1), {
    id: 1, msg: "ok", title: "", body: "", type: "success", variant: "default", icon: null, avatarUrl: null, href: null, onClick: null, groupKey: null,
  });
});

test("cuerpo de schedule-reminder", () => {
  const ahora = 1_700_000_000_000;
  assert.deepEqual(
    armarProgramacionRecordatorio({ type: "follow", date: "2026-10-19", time: "10:30", note: "10:30 · Llamar a Eva", entryKey: "k1" }, ahora),
    { type: "follow", date: "2026-10-19", time: "10:30", note: "Llamar a Eva", send_at: fechaHoraLocalAIso("2026-10-19", "10:30"), entry_key: "k1" },
  );
  const sinHora = armarProgramacionRecordatorio({ type: "venta", date: "2026-10-19", time: "x", note: "9:00 · a · b" }, ahora);
  assert.equal(sinHora.time, "09:00");
  assert.equal(sinHora.note, "a · b");
  assert.equal(sinHora.entry_key, String(ahora));
  assert.equal(armarProgramacionRecordatorio({ type: "nota", date: "2026-10-19", time: "8:05", note: null }, ahora).time, "08:05");
  assert.equal(armarProgramacionRecordatorio({ type: "follow", date: "", time: "10:00" }, ahora), null);
  assert.equal(armarProgramacionRecordatorio({ type: "follow", date: "mal", time: "10:00" }, ahora), null);
});
