import { getMonths } from "../locale-calendar.js";
function ymdToday() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseYMD(s) {
  const [y, m, d] = String(s || "").split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
function longDate(s, lang = "es") {
  const d = parseYMD(s);
  if (!d) return s || "—";
  const months = getMonths(lang);
  if (lang === "en") {
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}
function shortDate(s, lang = "es") {
  const d = parseYMD(s);
  if (!d) return s || "—";
  const short = lang === "en" ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] : ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${d.getDate()} ${short[d.getMonth()]} ${d.getFullYear()}`;
}
function calKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
}
export {
  calKey,
  getISOWeek,
  longDate,
  parseYMD,
  shortDate,
  ymdToday
};
