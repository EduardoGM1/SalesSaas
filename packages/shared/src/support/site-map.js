/**
 * Catálogo del mapa del sitio para Atención a usuario (SDD-01).
 * Fuente única: web y API consumen estos IDs estables.
 */

export const SUPPORT_REQUEST_TYPES = [
  { id: "problem", labelEs: "Reportar un problema", labelEn: "Report a problem" },
  { id: "help", labelEs: "Necesito ayuda", labelEn: "I need help" },
  { id: "question", labelEs: "Tengo una duda", labelEn: "I have a question" },
  { id: "suggestion", labelEs: "Sugerencia", labelEn: "Suggestion" },
  { id: "comment", labelEs: "Comentario", labelEn: "Comment" },
  { id: "other", labelEs: "Otro", labelEn: "Other" },
];

/** @type {{ moduleId: string, labelEs: string, labelEn: string, children: { id: string, labelEs: string, labelEn: string }[] }[]} */
export const SUPPORT_SITE_MAP = [
  {
    moduleId: "agenda",
    labelEs: "Agenda",
    labelEn: "Calendar",
    children: [
      { id: "agenda_followups", labelEs: "Follow-ups", labelEn: "Follow-ups" },
      { id: "agenda_notas_usuario", labelEs: "Notas del usuario", labelEn: "User notes" },
      { id: "agenda_ventas_procesar", labelEs: "Ventas por procesar", labelEn: "Sales to process" },
    ],
  },
  {
    moduleId: "metas",
    labelEs: "Metas",
    labelEn: "Goals",
    children: [
      { id: "metas_metas", labelEs: "Metas", labelEn: "Goals" },
    ],
  },
  {
    moduleId: "clientes",
    labelEs: "Clientes",
    labelEn: "Clients",
    children: [
      { id: "clientes_expediente", labelEs: "Expediente", labelEn: "File" },
      { id: "clientes_datos_prospecto", labelEs: "Datos del prospecto", labelEn: "Prospect details" },
      { id: "clientes_survey", labelEs: "Survey", labelEn: "Survey" },
      { id: "clientes_vacaciones", labelEs: "Proyección de vacaciones", labelEn: "Vacation projection" },
      { id: "clientes_worksheet", labelEs: "Worksheet", labelEn: "Worksheet" },
      { id: "clientes_notas_cliente", labelEs: "Notas del cliente", labelEn: "Client notes" },
      { id: "clientes_followups", labelEs: "Follow-ups", labelEn: "Follow-ups" },
      { id: "clientes_compartir", labelEs: "Compartir expediente", labelEn: "Share file" },
    ],
  },
  {
    moduleId: "dashboard",
    labelEs: "Dashboard",
    labelEn: "Dashboard",
    children: [
      { id: "dashboard_dashboard", labelEs: "Dashboard", labelEn: "Dashboard" },
    ],
  },
  {
    moduleId: "herramientas",
    labelEs: "Herramientas",
    labelEn: "Tools",
    children: [
      { id: "herramientas_herramientas", labelEs: "Herramientas", labelEn: "Tools" },
    ],
  },
  {
    moduleId: "configuracion",
    labelEs: "Configuración",
    labelEn: "Settings",
    children: [
      { id: "config_usuario", labelEs: "Usuario", labelEn: "User" },
      { id: "config_idioma", labelEs: "Idioma", labelEn: "Language" },
      { id: "config_notificaciones", labelEs: "Notificaciones", labelEn: "Notifications" },
      { id: "config_tipos_tour", labelEs: "Tipos de tour", labelEn: "Tour types" },
      { id: "config_moneda", labelEs: "Moneda y tipo de cambio", labelEn: "Currency and exchange rate" },
      { id: "config_worksheet", labelEs: "Worksheet de configuración", labelEn: "Worksheet settings" },
    ],
  },
  {
    moduleId: "mensajeria",
    labelEs: "Mensajería",
    labelEn: "Messaging",
    children: [
      { id: "mensajeria_red", labelEs: "Red / Network", labelEn: "Network" },
      { id: "mensajeria_mensajes", labelEs: "Mensajes", labelEn: "Messages" },
    ],
  },
  {
    moduleId: "otro",
    labelEs: "Otro",
    labelEn: "Other",
    children: [
      { id: "otro", labelEs: "Otro", labelEn: "Other" },
    ],
  },
];

function pickLabel(entry, lang) {
  return lang === "en" ? entry.labelEn : entry.labelEs;
}

/** Opciones planas: { id, moduleLabel, leafLabel, pathLabel } */
export function listSupportAreaOptions(lang = "es") {
  const options = [];
  for (const mod of SUPPORT_SITE_MAP) {
    const moduleLabel = pickLabel(mod, lang);
    for (const child of mod.children) {
      const leafLabel = pickLabel(child, lang);
      options.push({
        id: child.id,
        moduleId: mod.moduleId,
        moduleLabel,
        leafLabel,
        pathLabel: `${moduleLabel} > ${leafLabel}`,
      });
    }
  }
  return options;
}

export function findSupportAreaOption(id, lang = "es") {
  return listSupportAreaOptions(lang).find((o) => o.id === id) || null;
}

export const SUPPORT_REQUEST_TYPE_IDS = new Set(SUPPORT_REQUEST_TYPES.map((t) => t.id));
export const SUPPORT_AREA_IDS = new Set(
  SUPPORT_SITE_MAP.flatMap((m) => m.children.map((c) => c.id)),
);
