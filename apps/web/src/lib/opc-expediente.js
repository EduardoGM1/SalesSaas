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

export function defaultOpcForm({ fecha, hora, etiqueta, olaConfigId }) {
  return {
    hombreNombre: "",
    hombreApellido: "",
    mujerNombre: "",
    mujerApellido: "",
    ninos: [],
    agencia: "",
    estadoProcedencia: "",
    nights: "",
    roomType: "",
    roomNumber: "",
    notes: "",
    fecha: fecha || "",
    hora: normalizeHora(hora),
    etiqueta: etiqueta || "",
    olaConfigId: olaConfigId || "",
  };
}
