
import { useEffect, useMemo, useState } from "react";
import { Calendar, Info } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { computeMetasKpis } from "@/lib/calculations/calendar";
import { onlyDigits } from "@/lib/format/money";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { calKey } from "@/lib/format/dates";
import { selectOnFocus } from "@/lib/focus-select.js";
import { EMPTY_CAL_MONTH } from "@/lib/store-empty.js";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";

export function MetasPage() {
  const { t, months } = useI18n();
  const { fmt, fmtN, settings: moneySettings } = useMoney();
  const hydrated = useAppStore((s) => s.hydrated);
  const calYear = useAppStore((s) => s.calYear);
  const calMonth = useAppStore((s) => s.calMonth);
  const calPrev = useAppStore((s) => s.calPrev);
  const calNext = useAppStore((s) => s.calNext);
  const saveGoalMonth = useDbStore((s) => s.saveGoalMonth);
  const monthKey = calKey(calYear, calMonth);

  const [vol, setVol] = useState("");
  const [tours, setTours] = useState("");
  const [ventas, setVentas] = useState("");
  const [saved, setSaved] = useState(false);

  const goalVol = useDbStore((s) => s.db.goals[monthKey]?.vol ?? 0);
  const goalTours = useDbStore((s) => s.db.goals[monthKey]?.tours ?? 0);
  const goalVentas = useDbStore((s) => s.db.goals[monthKey]?.ventas ?? 0);

  useEffect(() => {
    setVol(goalVol ? fmtN(goalVol) : "");
    setTours(goalTours ? String(goalTours) : "");
    setVentas(goalVentas ? String(goalVentas) : "");
  }, [monthKey, goalVol, goalTours, goalVentas, fmtN]);

  const data = useDbStore((s) => s.db.cal[monthKey] ?? EMPTY_CAL_MONTH);
  const kpis = useMemo(() => computeMetasKpis(
    calYear, calMonth, data,
    Number(onlyDigits(vol)) || 0,
    Number(onlyDigits(tours)) || 0,
    Number(onlyDigits(ventas)) || 0,
  ), [calYear, calMonth, data, vol, tours, ventas]);

  const formatVol = () => {
    const raw = onlyDigits(vol);
    const locale = moneySettings.language === "en" ? "en-US" : "es-MX";
    setVol(raw ? Number(raw).toLocaleString(locale, { maximumFractionDigits: 0 }) : "");
  };

  if (!hydrated) return <Topbar title={t("page.metas.title")} subtitle={t("common.loading")} />;

  const diasTrab = Math.max(0, kpis.dim - kpis.descDays);

  return (
    <>
      <Topbar title={t("page.metas.title")} subtitle={t("page.metas.subtitle")} />
      <div className="sales-page metas-page">
        <div className="metas-page-nav">
          <PageBack inline />
        </div>
        <div className="local-month-nav metas-month-nav">
          <button type="button" className="tb-nav-btn" onClick={calPrev} aria-label={t("common.previousMonth")}>‹</button>
          <div className="local-month-label">{months[calMonth]} {calYear}</div>
          <button type="button" className="tb-nav-btn" onClick={calNext} aria-label={t("common.nextMonth")}>›</button>
        </div>

        <div className="g2 metas-layout">
          <div className="card metas-goal-card">
            <div className="metas-card-head">
              <div className="metas-card-head-titles">
                <div className="card-heading">{t("metas.monthGoal")}</div>
                <div className="card-sub">{t("metas.enterGoals")}</div>
              </div>
              <div className="metas-period-badges">
                <div className="metas-period-badge">
                  <Calendar size={15} aria-hidden="true" />
                  <span className="metas-period-badge-label">{t("metas.year")}</span>
                  <span className="metas-period-badge-val">{calYear}</span>
                </div>
                <div className="metas-period-badge">
                  <Calendar size={15} aria-hidden="true" />
                  <span className="metas-period-badge-label">{t("metas.month")}</span>
                  <span className="metas-period-badge-val">{months[calMonth]}</span>
                </div>
              </div>
            </div>

            <div className="frow frow-first metas-frow">
              <div className="flabel">
                <strong>{t("metas.volume")}</strong>
                <span className="flabel-help">{t("metas.volumeHelp")}</span>
              </div>
              <div className="mfield metas-vol-field">
                <span className="mpfx">$</span>
                <input type="text" className="metas-input" placeholder="500,000" inputMode="numeric" value={vol} onFocus={selectOnFocus} onChange={(e) => setVol(e.target.value)} onBlur={formatVol} />
              </div>
            </div>
            <div className="frow metas-frow">
              <div className="flabel">
                <strong>{t("metas.tours")}</strong>
                <span className="flabel-help">{t("metas.toursHelp")}</span>
              </div>
              <input type="text" className="goal-plain-input small metas-num-input" placeholder="30" inputMode="numeric" value={tours} onFocus={selectOnFocus} onChange={(e) => setTours(e.target.value)} />
            </div>
            <div className="frow metas-frow">
              <div className="flabel">
                <strong>{t("metas.sales")}</strong>
                <span className="flabel-help">{t("metas.salesHelp")}</span>
              </div>
              <input type="text" className="goal-plain-input small metas-num-input" placeholder="10" inputMode="numeric" value={ventas} onFocus={selectOnFocus} onChange={(e) => setVentas(e.target.value)} />
            </div>

            <hr className="metas-divider" />

            <div className="frow frow-first metas-frow">
              <div className="flabel">
                <strong>{t("metas.restDays")}</strong>
                <span className="flabel-help">{t("metas.restDaysHelp")}</span>
              </div>
              <div className="metas-readonly-val metas-readonly-val--lg">{kpis.descDays}</div>
            </div>
            <div className="frow metas-frow">
              <div className="flabel">
                <strong>{t("metas.workDays")}</strong>
                <span className="flabel-help">{t("metas.workDaysHelp")}</span>
              </div>
              <div className="metas-readonly-val metas-readonly-val--lg metas-readonly-val--blue">{diasTrab}</div>
            </div>

            <div className="hint metas-hint">
              <Info size={16} className="metas-hint-icon" aria-hidden="true" />
              <span>{t("metas.hint")}</span>
            </div>

            <button type="button" className="btn btn-primary btn-full metas-save-btn" onClick={() => {
              saveGoalMonth(calYear, calMonth, {
                vol: Number(onlyDigits(vol)) || 0,
                tours: Number(onlyDigits(tours)) || 0,
                ventas: Number(onlyDigits(ventas)) || 0,
              });
              setSaved(true);
              setTimeout(() => setSaved(false), 1600);
            }}>{saved ? t("metas.saved") : t("metas.save")}</button>
          </div>

          <div className="metas-side-stack">
            <div className="card metas-kpi-card">
              <div className="card-heading">{t("metas.kpisProjected")}</div>
              <div className="card-sub">{t("metas.kpisSub")}</div>
              <div className="g2 metas-kpi-grid">
                <div className="vbox blue">
                  <div className="vbox-val">{fmt(kpis.vprom)}</div>
                  <div className="vbox-label">{t("goals.avgSale")}</div>
                  <div className="vbox-sub">{t("metas.avgSaleSub")}</div>
                </div>
                <div className="vbox green">
                  <div className="vbox-val">{fmt(kpis.efic)}</div>
                  <div className="vbox-label">{t("goals.efficiency")}</div>
                  <div className="vbox-sub">{t("metas.efficiencySub")}</div>
                </div>
                <div className="vbox yellow">
                  <div className="vbox-val">{kpis.cierre.toFixed(2)}%</div>
                  <div className="vbox-label">{t("goals.closeRate")}</div>
                  <div className="vbox-sub">{t("metas.closeRateSub")}</div>
                </div>
                <div className="vbox blue">
                  <div className="vbox-val">{fmt(kpis.prod)}</div>
                  <div className="vbox-label">{t("metas.dailyGoal")}</div>
                  <div className="vbox-sub">{t("metas.dailyGoalSub")}</div>
                </div>
              </div>
            </div>

            <div className="card metas-breakdown-card">
              <div className="card-heading">{t("metas.monthBreakdown")}</div>
              <div className="card-sub">{t("metas.monthBreakdownSub")}</div>
              <table className="dtbl">
                <tbody>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>{t("metas.daysInMonth")}</td><td className="td-r" style={{ fontFamily: "var(--font-geist-mono), monospace", fontWeight: 600 }}>{kpis.dim}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>{t("metas.restDays")}</td><td className="td-r td-red">{kpis.descDays}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>{t("metas.workDays")}</td><td className="td-r td-blue">{diasTrab}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>{t("metas.approxWeekly")}</td><td className="td-r td-green">{fmt(kpis.semanal)}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>{t("metas.toursPerDay")}</td><td className="td-r" style={{ fontFamily: "var(--font-geist-mono), monospace", fontWeight: 600 }}>{kpis.toursDia}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>{t("metas.approxDaily")}</td><td className="td-r td-green">{fmt(kpis.prod)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
