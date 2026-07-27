/** Mapa herramienta UI → clave de flag (motor 0051). */
export const TOOL_FLAG_KEYS = {
  survey: "survey",
  vacaciones: "proyeccion_vacaciones",
  worksheet: "worksheet",
  analysis: "analysis",
};

export const MONEY_BOX_FLAG = "worksheet.money_box";

export const SURVEY_TAB_FLAGS = {
  motivaciones: "survey.tab.motivaciones",
  timeshare: "survey.tab.timeshare_information",
  gastos: "survey.tab.gastos_viaje",
  resumen: "survey.tab.resumen",
};

export function toolFlagKey(tool) {
  return TOOL_FLAG_KEYS[tool] || null;
}
