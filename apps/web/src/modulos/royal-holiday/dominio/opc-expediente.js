export function firstSingleName(value, fallback = "Pareja") {
  const token = String(value || "").trim().split(/\s+/)[0] || "";
  const cleaned = token.replace(/[^\p{L}\p{M}]/gu, "");
  return cleaned || fallback;
}

export function normalizeHora(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return raw.slice(0, 5);
  return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
}

/** Empareja fecha/hora con una ola del día (hora de config). */
export function matchOlaByHora(olas, hora) {
  const target = normalizeHora(hora);
  if (!target || !Array.isArray(olas)) return null;
  return olas.find((ola) => normalizeHora(ola.hora) === target) || null;
}

export function emptyPerson() {
  return { nombre: "", apellido: "", nacionalidad: "", edad: "", ocupacion: "" };
}

export function computeStayTotal(nights, rate) {
  if (nights === "" || rate === "" || nights == null || rate == null) return "";
  const n = Number(nights);
  const r = Number(rate);
  if (!Number.isFinite(n) || !Number.isFinite(r)) return "";
  return String(n * r);
}

export function formatOpcFechaMeta(iso) {
  const raw = String(iso || "").trim();
  if (!raw) return "—";
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return raw;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function defaultOpcForm({ fecha, hora, etiqueta, olaConfigId } = {}) {
  return {
    pais: "",
    pax: "",
    estado: "",
    modulo: "",
    idioma: "",
    estadoCivil: "",
    hombre: emptyPerson(),
    mujer: emptyPerson(),
    ninos: emptyPerson(),
    notasCliente: "",
    agencia: "",
    nights: "",
    roomType: "",
    rate: "",
    roomNumber: "",
    total: "",
    notasEstancia: "",
    fecha: fecha || "",
    hora: normalizeHora(hora),
    etiqueta: etiqueta || "",
    olaConfigId: olaConfigId || "",
    calificacion: "",
    regalo: "",
    notasInvitacion: "",
  };
}

export function buildOpcSnapshot(form) {
  return {
    pais: form.pais || "",
    pax: form.pax || "",
    estado: form.estado || "",
    modulo: form.modulo || "",
    idioma: form.idioma || "",
    estado_civil: form.estadoCivil || "",
    integrantes: {
      hombre: { ...(form.hombre || emptyPerson()) },
      mujer: { ...(form.mujer || emptyPerson()) },
      ninos: { ...(form.ninos || emptyPerson()) },
    },
    notas_cliente: form.notasCliente || "",
    agencia: form.agencia || "",
    nights: form.nights === "" ? null : Number(form.nights),
    room_type: form.roomType || "",
    rate: form.rate === "" ? null : Number(form.rate),
    room_number: form.roomNumber || "",
    total: form.total === "" ? null : Number(form.total),
    notas_estancia: form.notasEstancia || "",
    fecha: form.fecha || "",
    hora: normalizeHora(form.hora),
    calificacion: form.calificacion || "",
    regalo: form.regalo || "",
    notas_invitacion: form.notasInvitacion || "",
  };
}

export function formatOpcNotes(form) {
  const lines = [];
  if (form.notasCliente) lines.push(`Cliente: ${form.notasCliente}`);
  if (form.notasEstancia) lines.push(`Estancia: ${form.notasEstancia}`);
  if (form.notasInvitacion) lines.push(`Invitación: ${form.notasInvitacion}`);
  return `${lines.join("\n")}\n---opc---\n${JSON.stringify(buildOpcSnapshot(form))}`.trim();
}

export function parseOpcNotesSnapshot(notes) {
  const raw = String(notes || "");
  const idx = raw.lastIndexOf("---opc---");
  if (idx < 0) return null;
  try {
    return JSON.parse(raw.slice(idx + "---opc---".length).trim());
  } catch {
    return null;
  }
}

export function opcDisplayName(form) {
  const hombre = String(form?.hombre?.nombre || "").trim();
  const mujer = String(form?.mujer?.nombre || "").trim();
  return [hombre, mujer].filter(Boolean).join(" / ") || firstSingleName(hombre || mujer);
}
