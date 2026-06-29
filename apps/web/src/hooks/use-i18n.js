import { useMemo } from "react";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";
import { getLang, getMonths, getWeekdays, getWeekdaysShort, t } from "@/lib/i18n.js";

export function useI18n() {
  const settings = useDbStore((s) => s.db.settings, shallow);
  const lang = getLang(settings);

  return useMemo(() => ({
    lang,
    language: lang,
    t: (key, vars) => t(key, lang, vars),
    months: getMonths(lang),
    weekdays: getWeekdays(lang),
    weekdaysShort: getWeekdaysShort(lang),
  }), [lang]);
}
