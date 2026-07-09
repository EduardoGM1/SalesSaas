/** Etiqueta de tipo de entrada de agenda para el panel admin. */
export function agendaTypeLabel(entry, t) {
  const type = entry?.type;
  if (type === "venta") return t("admin.agenda.type.sale");
  if (type === "descanso") return t("admin.agenda.type.rest");
  if (type === "follow") return t("admin.agenda.type.follow");
  if (type === "nota" && entry?.kind === "no-tour") return t("admin.agenda.type.noTour");
  if (type === "nota") return t("admin.agenda.type.note");
  return type || "—";
}

/** Etiqueta de procesamiento en entradas de agenda. */
export function agendaProcessingLabel(processing, t) {
  if (!processing) return "—";
  if (processing === "pendiente") return t("admin.agenda.processing.pending");
  if (processing === "procesable" || processing === "venta") return t("admin.agenda.processing.ok");
  return processing;
}

/** Nombre de expediente o cliente libre en fila de agenda. */
export function agendaFileLabel(entry, t) {
  const p = entry?.prospect;
  if (p) return p.name || p.name1 || p.prospect_code || "—";
  if (entry?.client_name) return entry.client_name;
  return t("admin.prospect.free");
}
