/**
 * Anexo A del SDD-03 (23 sep 2026): 61 rangos de mantenimiento.
 * La página 5 del SDD dice 60; el anexo y su encabezado dicen 61.
 * holiday_credits es el mínimo del rango (lookupBottomLine: mayor clave <= HC).
 * No hay rangos por encima de 940,000: la foto termina ahí.
 * Transcripción pendiente de validación de Mich.
 */

/** Ventas con fecha de calendario (America/Mexico_City) anterior a este día conservan 2026. */
export const RH_MANTENIMIENTO_2027_DESDE = "2026-09-23";

/** Medianoche del 23 sep 2026 en America/Mexico_City (UTC-6, sin horario de verano). */
export const RH_MANTENIMIENTO_2027_DESDE_ISO = "2026-09-23T06:00:00.000Z";

export const RH_MANTENIMIENTO_2027_NOTAS =
  "Mantenimientos 2027 (SDD-03 Anexo A, 61 rangos). Pendiente de validación de Mich.";

/** @type {{ hcMin: number, hcMax: number, programa: string, cuota2026: number, cuota2027: number }[]} */
export const ANEXO_A_MANTENIMIENTOS = [
  { hcMin: 0, hcMax: 5000, programa: "BRZ", cuota2026: 585, cuota2027: 615 },
  { hcMin: 5001, hcMax: 10000, programa: "BRZ+", cuota2026: 700, cuota2027: 735 },
  { hcMin: 10001, hcMax: 15000, programa: "SLVR", cuota2026: 805, cuota2027: 845 },
  { hcMin: 15001, hcMax: 20000, programa: "SLV+", cuota2026: 945, cuota2027: 990 },
  { hcMin: 20001, hcMax: 25000, programa: "GOLD", cuota2026: 1040, cuota2027: 1090 },
  { hcMin: 25001, hcMax: 30000, programa: "GLD+", cuota2026: 1170, cuota2027: 1230 },
  { hcMin: 30001, hcMax: 35000, programa: "PLAT", cuota2026: 1495, cuota2027: 1570 },
  { hcMin: 35001, hcMax: 40000, programa: "PLAT", cuota2026: 1630, cuota2027: 1710 },
  { hcMin: 40001, hcMax: 50000, programa: "PLT+", cuota2026: 1775, cuota2027: 1865 },
  { hcMin: 50001, hcMax: 60000, programa: "PLT+", cuota2026: 1860, cuota2027: 1955 },
  { hcMin: 60001, hcMax: 70000, programa: "ROYL", cuota2026: 2060, cuota2027: 2165 },
  { hcMin: 70001, hcMax: 80000, programa: "ROYL", cuota2026: 2295, cuota2027: 2410 },
  { hcMin: 80001, hcMax: 90000, programa: "ROYL", cuota2026: 2515, cuota2027: 2640 },
  { hcMin: 90001, hcMax: 100000, programa: "ROYL", cuota2026: 2770, cuota2027: 2910 },
  { hcMin: 100001, hcMax: 110000, programa: "ROYL", cuota2026: 2970, cuota2027: 3120 },
  { hcMin: 110001, hcMax: 120000, programa: "ROYL", cuota2026: 3215, cuota2027: 3375 },
  { hcMin: 120001, hcMax: 130000, programa: "ROYL", cuota2026: 3455, cuota2027: 3630 },
  { hcMin: 130001, hcMax: 140000, programa: "ROYL", cuota2026: 3695, cuota2027: 3880 },
  { hcMin: 140001, hcMax: 150000, programa: "ROYL", cuota2026: 3925, cuota2027: 4120 },
  { hcMin: 150001, hcMax: 160000, programa: "ROYL", cuota2026: 4160, cuota2027: 4370 },
  { hcMin: 160001, hcMax: 170000, programa: "ROYL", cuota2026: 4385, cuota2027: 4605 },
  { hcMin: 170001, hcMax: 180000, programa: "ROYL", cuota2026: 4620, cuota2027: 4850 },
  { hcMin: 180001, hcMax: 190000, programa: "ROYL", cuota2026: 4870, cuota2027: 5115 },
  { hcMin: 190001, hcMax: 200000, programa: "ROYL", cuota2026: 5135, cuota2027: 5390 },
  { hcMin: 200001, hcMax: 220000, programa: "ROYL", cuota2026: 5525, cuota2027: 5800 },
  { hcMin: 220001, hcMax: 240000, programa: "ROYL", cuota2026: 5940, cuota2027: 6235 },
  { hcMin: 240001, hcMax: 260000, programa: "ROYL", cuota2026: 6325, cuota2027: 6640 },
  { hcMin: 260001, hcMax: 280000, programa: "ROYL", cuota2026: 6710, cuota2027: 7045 },
  { hcMin: 280001, hcMax: 300000, programa: "ROYL", cuota2026: 7075, cuota2027: 7430 },
  { hcMin: 300001, hcMax: 320000, programa: "ROYL", cuota2026: 7445, cuota2027: 7815 },
  { hcMin: 320001, hcMax: 340000, programa: "ROYL", cuota2026: 7815, cuota2027: 8205 },
  { hcMin: 340001, hcMax: 360000, programa: "ROYL", cuota2026: 8170, cuota2027: 8580 },
  { hcMin: 360001, hcMax: 380000, programa: "ROYL", cuota2026: 8510, cuota2027: 8935 },
  { hcMin: 380001, hcMax: 400000, programa: "ROYL", cuota2026: 8835, cuota2027: 9275 },
  { hcMin: 400001, hcMax: 420000, programa: "ROYL", cuota2026: 9155, cuota2027: 9615 },
  { hcMin: 420001, hcMax: 440000, programa: "ROYL", cuota2026: 9475, cuota2027: 9950 },
  { hcMin: 440001, hcMax: 460000, programa: "ROYL", cuota2026: 9790, cuota2027: 10280 },
  { hcMin: 460001, hcMax: 480000, programa: "ROYL", cuota2026: 10065, cuota2027: 10570 },
  { hcMin: 480001, hcMax: 500000, programa: "ROYL", cuota2026: 10370, cuota2027: 10890 },
  { hcMin: 500001, hcMax: 520000, programa: "ROYL", cuota2026: 10665, cuota2027: 11200 },
  { hcMin: 520001, hcMax: 540000, programa: "ROYL", cuota2026: 10990, cuota2027: 11540 },
  { hcMin: 540001, hcMax: 560000, programa: "ROYL", cuota2026: 11320, cuota2027: 11885 },
  { hcMin: 560001, hcMax: 580000, programa: "ROYL", cuota2026: 11650, cuota2027: 12235 },
  { hcMin: 580001, hcMax: 600000, programa: "ROYL", cuota2026: 11995, cuota2027: 12595 },
  { hcMin: 600001, hcMax: 620000, programa: "ROYL", cuota2026: 12350, cuota2027: 12970 },
  { hcMin: 620001, hcMax: 640000, programa: "ROYL", cuota2026: 12705, cuota2027: 13340 },
  { hcMin: 640001, hcMax: 660000, programa: "ROYL", cuota2026: 13080, cuota2027: 13735 },
  { hcMin: 660001, hcMax: 680000, programa: "ROYL", cuota2026: 13465, cuota2027: 14140 },
  { hcMin: 680001, hcMax: 700000, programa: "ROYL", cuota2026: 13870, cuota2027: 14565 },
  { hcMin: 700001, hcMax: 720000, programa: "ROYL", cuota2026: 14270, cuota2027: 14985 },
  { hcMin: 720001, hcMax: 740000, programa: "ROYL", cuota2026: 14695, cuota2027: 15430 },
  { hcMin: 740001, hcMax: 760000, programa: "ROYL", cuota2026: 15115, cuota2027: 15870 },
  { hcMin: 760001, hcMax: 780000, programa: "ROYL", cuota2026: 15575, cuota2027: 16355 },
  { hcMin: 780001, hcMax: 800000, programa: "ROYL", cuota2026: 16045, cuota2027: 16845 },
  { hcMin: 800001, hcMax: 820000, programa: "ROYL", cuota2026: 16490, cuota2027: 17315 },
  { hcMin: 820001, hcMax: 840000, programa: "ROYL", cuota2026: 17005, cuota2027: 17855 },
  { hcMin: 840001, hcMax: 860000, programa: "ROYL", cuota2026: 17495, cuota2027: 18370 },
  { hcMin: 860001, hcMax: 880000, programa: "ROYL", cuota2026: 18015, cuota2027: 18915 },
  { hcMin: 880001, hcMax: 900000, programa: "ROYL", cuota2026: 18550, cuota2027: 19480 },
  { hcMin: 900001, hcMax: 920000, programa: "ROYL", cuota2026: 19100, cuota2027: 20055 },
  { hcMin: 920001, hcMax: 940000, programa: "ROYL", cuota2026: 19660, cuota2027: 20645 },
];

export function ymdMexico(value) {
  if (value == null || value === "") return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Versión cuya vigencia cubre la fecha (vigente_hasta exclusivo, en día de México). */
export function catalogoParaFecha(versions, fechaYmd) {
  const fecha = ymdMexico(fechaYmd);
  if (!fecha) return null;
  const matches = (versions || []).filter((version) => {
    const desde = ymdMexico(version.vigente_desde);
    const hasta = version.vigente_hasta ? ymdMexico(version.vigente_hasta) : null;
    if (!desde || desde > fecha) return false;
    if (hasta && fecha >= hasta) return false;
    return true;
  });
  matches.sort((a, b) => Number(b.version) - Number(a.version));
  return matches[0] || null;
}

/**
 * 61 filas 2027. El precio de board se copia solo si el catálogo 2026 ya tenía
 * una clave dentro del rango. El anexo no trae precio mínimo y no se inventa.
 */
export function filasBottomLine2027(existentes = []) {
  return ANEXO_A_MANTENIMIENTOS.map((row) => {
    const inside = (existentes || []).filter((item) => {
      const hc = Number(item.holiday_credits);
      return hc >= row.hcMin && hc <= row.hcMax;
    });
    const source = inside.sort((a, b) => Number(a.holiday_credits) - Number(b.holiday_credits))[0];
    return {
      programa: row.programa,
      holiday_credits: row.hcMin,
      cuota_anual_mfee: row.cuota2027,
      precio_minimo_sin_iva: source ? Number(source.precio_minimo_sin_iva) || 0 : 0,
      precio_minimo_con_iva: source ? Number(source.precio_minimo_con_iva) || 0 : 0,
    };
  });
}
