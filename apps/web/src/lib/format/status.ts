const LABELS: Record<string, string> = {
  "": "Sin estado",
  venta: "Venta",
  bback: "B-back",
  procesable: "Procesable",
  "no-procesable": "No procesable",
  perdido: "Perdido / cerrado",
  cerrado: "Cerrado",
  procesado: "Procesado",
};

export function statusLabel(s: string | undefined): string {
  return LABELS[s || ""] || s || "Sin estado";
}

export function statusClass(s: string | undefined): string {
  return String(s || "").replace(/[^a-z0-9-]/g, "-");
}
