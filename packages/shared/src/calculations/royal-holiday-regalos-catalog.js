/**
 * Catálogo canónico de regalos Royal Holiday (Excel Saletse — hojas Regalos + Worksheet).
 * Usado por seed y sync; el motor lee las mismas claves desde rh_regalos.restricciones.
 */

export const RH_REGALOS_EXCEL = [
  {
    nombre: "Prevelige Member",
    costo: 0,
    cargas_permitidas: ["sin_costo"],
    restricciones: {
      venta_minima_hc: 15000,
    },
    notas: "45 noches de hospedaje (pagan su A/I). Se liberan acorde al porcentaje de pago de la membresía. Venta mínima 15,000 HC.",
  },
  {
    nombre: "Flyback",
    costo: 1508,
    cargas_permitidas: ["closing_cost", "venta"],
    restricciones: {
      venta_minima_usd: 19167.58,
      cantidad_default: 2,
    },
    notas: "2 certificados. Venta mínima $19,167.58 (GOLD). Closing o venta lo asigna el usuario.",
  },
  {
    nombre: "All inclusive",
    costo: null,
    cargas_permitidas: ["venta"],
    restricciones: {
      cantidad_es_monto: true,
      cantidad_default: 500,
      grupo_tope: "ai_vuelo",
      grupo_tope_usd: 1500,
    },
    notas: "Crédito para all inclusive o certificado de vuelo. En conjunto no pueden exceder $1,500 USD.",
  },
  {
    nombre: "Certificado de vuelo",
    costo: null,
    cargas_permitidas: ["venta"],
    restricciones: {
      cantidad_es_monto: true,
      cantidad_default: 1000,
      grupo_tope: "ai_vuelo",
      grupo_tope_usd: 1500,
    },
    notas: "Monto capturado por el usuario. Suma con All inclusive ≤ $1,500 USD.",
  },
  {
    nombre: "Move In",
    costo: 4000,
    cargas_permitidas: ["closing_cost"],
    restricciones: {
      moneda_costo: "MXN",
      cantidad_default: 1,
    },
    notas: "Costo en pesos MXN. Se carga a gastos administrativos (closing).",
  },
  {
    nombre: "Certificado multidestino",
    costo: 0,
    cargas_permitidas: ["sin_costo"],
    restricciones: {
      activacion_usd: 399,
      vigencia_meses: 12,
      noches: 4,
      dias: 5,
    },
    notas: "Sin costo para la sala. El socio paga $399 USD de activación. 4 noches / 5 días (2 adultos, 2 niños), 12 meses. Hoteles Royal Park (Orlando, Miami, Buenos Aires, Puerto Rico) y Regina (Cabo, Vallarta, Cancún).",
  },
  {
    nombre: "Tours",
    costo: null,
    cargas_permitidas: ["venta"],
    restricciones: {
      cantidad_es_monto: true,
      cantidad_default: 0,
    },
    notas: "El usuario captura el monto. Se carga a monto de venta.",
  },
  {
    nombre: "Bono de creditos",
    costo: null,
    cargas_permitidas: ["closing_cost", "venta"],
    restricciones: {
      costo_es_cuota_anual: true,
      hc_bonus_factor: 2,
      hc_bonus_max: 60000,
      vigencia_meses: 18,
      hc_tiers: [10000, 15000, 30000],
    },
    notas: "Costo = cuota anual (M.Fee) del programa. Créditos extra hasta 2× los comprados, máximo 60,000 HC. Expira en 18 meses. Closing o venta lo asigna el usuario.",
  },
  {
    nombre: "All inclusive noches",
    costo: null,
    cargas_permitidas: ["closing_cost"],
    restricciones: {
      cantidad_es_monto: true,
      cantidad_default: 0,
      ppd_min: 49,
      ppd_max: 199,
    },
    notas: "Noches todo incluido por persona y por día. Tarifa p/p entre $49 y $199 USD. El usuario captura el monto. Se carga a closing.",
  },
];

export function normalizarNombreRegalo(nombre) {
  return String(nombre || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave estable para cruzar filas DB ↔ Excel (All inclusive crédito vs noches). */
export function claveRegaloExcel(nombre, restricciones = {}) {
  const n = normalizarNombreRegalo(nombre);
  const r = restricciones && typeof restricciones === "object" ? restricciones : {};
  if (n.includes("prevelige") || n.includes("privilege")) return "privilege";
  if (n.includes("flyback")) return "flyback";
  if (n.includes("vuelo")) return "vuelo";
  if (n.includes("move")) return "move_in";
  if (n.includes("multidestino")) return "multidestino";
  if (n === "tours" || n.startsWith("tour")) return "tours";
  if (n.includes("bono")) return "bono";
  const isNoches = n.includes("noche") || r.ppd_min != null || r.ppd_max != null;
  if (n.includes("all inclusive") && isNoches) return "ai_noches";
  if (n.includes("all inclusive")) return "ai_credito";
  return n;
}
