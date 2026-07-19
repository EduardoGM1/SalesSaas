import {
  HAS_TS_QUESTION,
  MOTIVACIONES_AFTER_STYLE,
  MOTIVACIONES_BEFORE_STYLE,
  STYLE_QUESTIONS,
  TIMESHARE_QUESTIONS,
} from "@/lib/survey/discovery-questions.js";

/** Banco estático de respaldo (offline / sin Supabase). opciones = claves estables. */
export function buildFallbackBankRows() {
  const rows = [];
  let orden = 10;
  for (const item of MOTIVACIONES_BEFORE_STYLE) {
    rows.push({
      id: `fallback-${item.id}`,
      clave: item.id,
      seccion: "motivaciones",
      bloque: "before_style",
      texto: item.titleKey,
      label_corto: null,
      tipo_respuesta: item.max === 1 ? "chip_unico" : "chip_multiple",
      max_seleccion: item.max,
      opciones: item.optionKeys,
      orden,
      with_context: true,
      numero: item.number,
      es_global: true,
      activa: true,
    });
    orden += 10;
  }
  orden = 100;
  for (const item of STYLE_QUESTIONS) {
    rows.push({
      id: `fallback-${item.id}`,
      clave: item.id,
      seccion: "motivaciones",
      bloque: "style",
      texto: item.labelKey,
      label_corto: item.labelKey,
      tipo_respuesta: "chip_unico",
      max_seleccion: item.max,
      opciones: item.optionKeys,
      orden,
      with_context: false,
      numero: null,
      es_global: true,
      activa: true,
    });
    orden += 10;
  }
  orden = 200;
  for (const item of MOTIVACIONES_AFTER_STYLE) {
    rows.push({
      id: `fallback-${item.id}`,
      clave: item.id,
      seccion: "motivaciones",
      bloque: "after_style",
      texto: item.titleKey,
      label_corto: null,
      tipo_respuesta: item.max === 1 ? "chip_unico" : "chip_multiple",
      max_seleccion: item.max,
      opciones: item.optionKeys,
      orden,
      with_context: true,
      numero: item.number,
      es_global: true,
      activa: true,
    });
    orden += 10;
  }
  orden = 10;
  for (const item of TIMESHARE_QUESTIONS) {
    rows.push({
      id: `fallback-${item.id}`,
      clave: item.id,
      seccion: "timeshare",
      bloque: "main",
      texto: item.titleKey,
      label_corto: null,
      tipo_respuesta: item.max === 1 ? "chip_unico" : "chip_multiple",
      max_seleccion: item.max,
      opciones: item.optionKeys,
      orden,
      with_context: true,
      numero: item.number,
      es_global: true,
      activa: true,
    });
    orden += 10;
  }
  const h = HAS_TS_QUESTION;
  rows.push({
    id: `fallback-${h.id}`,
    clave: h.id,
    seccion: "timeshare",
    bloque: "has_ts",
    texto: h.titleKey,
    label_corto: null,
    tipo_respuesta: "chip_unico",
    max_seleccion: h.max,
    opciones: h.optionKeys,
    orden: 1000,
    with_context: false,
    numero: null,
    es_global: true,
    activa: true,
  });
  return rows;
}
