/** Escapa comodines ILIKE (% _) y caracteres especiales de filtros PostgREST. */
export function escapeIlikePattern(raw) {
  return String(raw || "")
    .trim()
    .replace(/[,%()\\]/g, "")
    .replace(/[%_]/g, "");
}

export function ilikeOrFilter(fields, rawQuery) {
  const q = escapeIlikePattern(rawQuery);
  if (!q) return null;
  return fields.map((f) => `${f}.ilike.%${q}%`).join(",");
}
