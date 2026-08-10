/** Estado inicial del worksheet Royal Holiday (moneda de captura). */
export const DEFAULT_RH_FORM = {
  holiday_credits: "10000",
  valor: "",
  valores: ["", "", "", ""],
  epvFvi: ["", "", "", "", ""],
  posicion: "ftb",
  monto_venta: "",
  enganche_pct: "25",
  enganche_hoy: "",
  gasto_adm_hoy: "",
  nacionalidad: "mexicano",
  plazo_meses: "",
  costo_administrativo_usd: "",
  regalosElegidos: {},
  extrasDp: [],
  extrasCc: [],
  enganche_num_pagos: "3",
  enganche_pagos: [],
  gasto_num_pagos: "2",
  gasto_pagos: [],
  opc: "",
  liner: "",
  closer1: "",
  closer2: "",
  exit: "",
  tarjeta_inmex: "",
  tarjeta_rci: "",
  tarjeta_inmex_on: false,
  tarjeta_rci_on: false,
};

export function mergeRhForm(base, loaded) {
  if (!loaded || typeof loaded !== "object") return { ...base };
  return {
    ...base,
    ...loaded,
    valores: Array.isArray(loaded.valores) ? loaded.valores : base.valores,
    epvFvi: Array.isArray(loaded.epvFvi) ? loaded.epvFvi : base.epvFvi,
    enganche_pagos: Array.isArray(loaded.enganche_pagos) ? loaded.enganche_pagos : base.enganche_pagos,
    gasto_pagos: Array.isArray(loaded.gasto_pagos) ? loaded.gasto_pagos : base.gasto_pagos,
    extrasDp: Array.isArray(loaded.extrasDp) ? loaded.extrasDp : base.extrasDp,
    extrasCc: Array.isArray(loaded.extrasCc) ? loaded.extrasCc : base.extrasCc,
    regalosElegidos: loaded.regalosElegidos && typeof loaded.regalosElegidos === "object"
      ? loaded.regalosElegidos
      : base.regalosElegidos,
  };
}

/** Serializa formulario RH al bucket local/remoto de la herramienta worksheet. */
export function rhFormToBucket(form, tab) {
  return {
    rh: "1",
    rhTab: tab,
    rhForm_json: JSON.stringify(form),
  };
}

/** Restaura formulario RH desde bucket; null si no hay datos RH guardados. */
export function rhFormFromBucket(bucket) {
  if (!bucket || (bucket.rh !== "1" && bucket.rh !== true)) return null;
  try {
    const raw = bucket.rhForm_json ?? bucket.rhForm;
    if (raw == null || raw === "") return null;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      form: mergeRhForm(DEFAULT_RH_FORM, parsed),
      tab: String(bucket.rhTab || "financiamiento"),
    };
  } catch {
    return null;
  }
}
