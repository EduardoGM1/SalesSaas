/** Nombres de mes/día sin depender del store ni de i18n (evita ciclos de import). */

export const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const WEEKDAYS_ES = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
];

export const WEEKDAYS_EN = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export const WEEKDAYS_SHORT_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const WEEKDAYS_SHORT_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function getMonths(lang = "es") {
  return lang === "en" ? MONTHS_EN : MONTHS_ES;
}

export function getWeekdays(lang = "es") {
  return lang === "en" ? WEEKDAYS_EN : WEEKDAYS_ES;
}

export function getWeekdaysShort(lang = "es") {
  return lang === "en" ? WEEKDAYS_SHORT_EN : WEEKDAYS_SHORT_ES;
}
