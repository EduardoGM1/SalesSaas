/** Mapa herramienta UI → clave de flag (motor 0051). */
export const TOOL_FLAG_KEYS = {
  survey: "survey",
  vacaciones: "proyeccion_vacaciones",
  worksheet: "worksheet",
  analysis: "analysis",
};

export const MONEY_BOX_FLAG = "worksheet.money_box";

/** Variante Worksheet Royal Holiday (custom por empresa). */
export const WORKSHEET_ROYAL_HOLIDAY_FLAG = "worksheet.royal_holiday";

/** Herramientas RH (custom por empresa; gated con useFlag). */
export const RH_TOOL_FLAGS = {
  bottom_lines: "rh.tool.bottom_lines",
  comisiones: "rh.tool.comisiones",
  calendario_comisiones: "rh.tool.calendario_comisiones",
  creditos: "rh.tool.creditos",
  dias_descanso: "rh.tool.dias_descanso",
  ops: "rh.tool.ops",
};

export const SURVEY_TAB_FLAGS = {
  motivaciones: "survey.tab.motivaciones",
  timeshare: "survey.tab.timeshare_information",
  gastos: "survey.tab.gastos_viaje",
  resumen: "survey.tab.resumen",
};

export function toolFlagKey(tool) {
  return TOOL_FLAG_KEYS[tool] || null;
}
