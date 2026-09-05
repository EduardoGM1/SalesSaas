import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildOpcSnapshot,
  computeStayTotal,
  defaultOpcForm,
  firstSingleName,
  formatOpcNotes,
  matchOlaByHora,
  normalizeHora,
  opcDisplayName,
  parseOpcNotesSnapshot,
} from "./opc-expediente.js";

describe("opc-expediente helpers", () => {
  it("toma el primer token como nombre CRM", () => {
    assert.equal(firstSingleName("Juan Perez"), "Juan");
    assert.equal(firstSingleName(""), "Pareja");
    assert.equal(firstSingleName("  María  "), "María");
  });

  it("normaliza hora HH:MM", () => {
    assert.equal(normalizeHora("9:30:00"), "09:30");
    assert.equal(normalizeHora("10:30"), "10:30");
  });

  it("empareja ola por hora", () => {
    const olas = [
      { ola_config_id: "a", hora: "09:00", etiqueta: "OLA 1" },
      { ola_config_id: "b", hora: "11:00:00", etiqueta: "OLA 2" },
    ];
    assert.equal(matchOlaByHora(olas, "11:00").ola_config_id, "b");
    assert.equal(matchOlaByHora(olas, "12:00"), null);
  });

  it("incluye todos los campos del mockup en el snapshot", () => {
    const form = defaultOpcForm({ fecha: "2026-09-03", hora: "10:30", etiqueta: "OLA 2" });
    form.pais = "México";
    form.pax = "2";
    form.estado = "Quintana Roo";
    form.modulo = "Módulo 4";
    form.idioma = "Español";
    form.estadoCivil = "Casados";
    form.hombre = { nombre: "Juan", apellido: "Perez", nacionalidad: "MX", edad: "40", ocupacion: "Ing" };
    form.mujer = { nombre: "Ana", apellido: "Lopez", nacionalidad: "MX", edad: "38", ocupacion: "Doc" };
    form.ninos = { nombre: "Leo", apellido: "Perez", nacionalidad: "MX", edad: "8", ocupacion: "" };
    form.notasCliente = "nota c";
    form.agencia = "Viajes QA";
    form.nights = "3";
    form.roomType = "Deluxe";
    form.rate = "100";
    form.roomNumber = "1204";
    form.total = computeStayTotal(form.nights, form.rate);
    form.notasEstancia = "nota e";
    form.calificacion = "A";
    form.regalo = "iPad";
    form.notasInvitacion = "nota i";
    const snap = buildOpcSnapshot(form);
    assert.equal(snap.pais, "México");
    assert.equal(snap.pax, "2");
    assert.equal(snap.modulo, "Módulo 4");
    assert.equal(snap.idioma, "Español");
    assert.equal(snap.estado_civil, "Casados");
    assert.equal(snap.integrantes.hombre.nacionalidad, "MX");
    assert.equal(snap.integrantes.ninos.edad, "8");
    assert.equal(snap.rate, 100);
    assert.equal(snap.total, 300);
    assert.equal(snap.calificacion, "A");
    assert.equal(snap.regalo, "iPad");
    const parsed = parseOpcNotesSnapshot(formatOpcNotes(form));
    assert.equal(parsed.notas_cliente, "nota c");
    assert.equal(parsed.notas_estancia, "nota e");
    assert.equal(parsed.notas_invitacion, "nota i");
    assert.equal(opcDisplayName(form), "Juan / Ana");
  });
});
