import { readFileSync, writeFileSync } from "fs";

const src = readFileSync("apps/web/src/lib/constants.ts", "utf8");

function extract(name) {
  const re = new RegExp(`export const ${name}[^=]*=\\s*`);
  const m = src.match(re);
  if (!m) throw new Error(`no ${name}`);
  let i = m.index + m[0].length;
  while (src[i] && /\s/.test(src[i])) i++;
  if (src[i] !== "{") throw new Error(`expected { for ${name}`);
  let depth = 0;
  const start = i;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

const city = extract("COUNTRY_CITY");
const flags = extract("COUNTRY_FLAGS");
const countryCount = Object.keys(Function(`"use strict"; return (${city})`)()).length;

const out = `const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
];
const DAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado"
];
const WS_DEFAULTS = {
  wo1m: "60",
  wo1r: "12.99",
  wo2m: "48",
  wo2r: "8.90",
  wo3m: "12",
  wo3r: "0"
};
const WS_CONFIG_IDS = ["wo1m", "wo1r", "wo2m", "wo2r", "wo3m", "wo3r"];
const COUNTRY_CITY = ${city};
const COUNTRY_FLAGS = ${flags};
const CURRENCIES = ["USD", "MXN", "CAD", "EUR"];
export {
  COUNTRY_CITY,
  COUNTRY_FLAGS,
  CURRENCIES,
  DAYS,
  MONTHS,
  WS_CONFIG_IDS,
  WS_DEFAULTS
};
`;

writeFileSync("packages/shared/src/constants.js", out);
console.log(`synced shared constants: ${countryCount} countries`);
