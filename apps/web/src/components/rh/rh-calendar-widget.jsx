import { useMemo } from "react";
import { useI18n } from "@/hooks/use-i18n.js";

/**
 * Calendario mensual reutilizable (.cal-widget / .cal-grid / .cal-day).
 * Sin acoplar a app-store de agenda.
 */
export function RhCalendarWidget({
  year,
  month,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  daysWithEntries = {},
}) {
  const { months, weekdaysShort } = useI18n();
  const first = new Date(year, month, 1).getDay();
  const dim = new Date(year, month + 1, 0).getDate();
  const today = useMemo(() => new Date(), []);
  const selectedDay = selectedDate ? Number(selectedDate.slice(8, 10)) : null;
  const selectedMonth = selectedDate ? Number(selectedDate.slice(5, 7)) - 1 : null;
  const selectedYear = selectedDate ? Number(selectedDate.slice(0, 4)) : null;

  const pad = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  return (
    <div className="cal-widget">
      <div className="agenda-month-nav">
        <button type="button" className="tb-nav-btn" onClick={onPrevMonth} aria-label="Mes anterior">‹</button>
        <div className="agenda-month-label">{months[month]} {year}</div>
        <button type="button" className="tb-nav-btn" onClick={onNextMonth} aria-label="Mes siguiente">›</button>
      </div>
      <div className="cal-weekdays">
        {weekdaysShort.map((d) => <div key={d} className="cal-wd">{d}</div>)}
      </div>
      <div className="cal-grid">
        {Array.from({ length: first }).map((_, i) => (
          <div key={`e${i}`} className="cal-day other" aria-hidden />
        ))}
        {Array.from({ length: dim }, (_, i) => {
          const d = i + 1;
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
          const isSel = selectedYear === year && selectedMonth === month && selectedDay === d;
          const key = pad(year, month, d);
          const hasEntries = (daysWithEntries[key] || 0) > 0;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelectDate(key)}
              className={`cal-day${isToday ? " today" : ""}${isSel ? " sel" : ""}`}
            >
              <div className="cal-dn">{d}</div>
              {hasEntries ? (
                <div className="cal-dots">
                  <span className="cal-dot show" />
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
