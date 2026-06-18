
import { useMemo, useState } from "react";
import { BarChart3, Calendar, Target } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { DashboardChart } from "@/components/goals/dashboard-chart";
import { getDashboardWeeks, normalizeGoal, workingDaysRemaining } from "@/lib/calculations/calendar";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { calKey } from "@/lib/format/dates";
import { EMPTY_CAL_MONTH } from "@/lib/store-empty.js";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";

export function GoalsPage() {
  const { t, months } = useI18n();
  const { fmt, fmtN } = useMoney();
  const hydrated = useAppStore((s) => s.hydrated);
  const calYear = useAppStore((s) => s.calYear);
  const calMonth = useAppStore((s) => s.calMonth);
  const calPrev = useAppStore((s) => s.calPrev);
  const calNext = useAppStore((s) => s.calNext);
  const [showTarget, setShowTarget] = useState(true);
  const [showReal, setShowReal] = useState(true);
  const monthKey = calKey(calYear, calMonth);
  const data = useDbStore((s) => s.db.cal[monthKey] ?? EMPTY_CAL_MONTH);
  const goalVol = useDbStore((s) => s.db.goals[monthKey]?.vol ?? 0);
  const goalTours = useDbStore((s) => s.db.goals[monthKey]?.tours ?? 0);
  const goalVentas = useDbStore((s) => s.db.goals[monthKey]?.ventas ?? 0);
  const clients = useDbStore((s) => s.db.clients);
  const goal = useMemo(
    () => normalizeGoal({ vol: goalVol, tours: goalTours, ventas: goalVentas }),
    [goalVol, goalTours, goalVentas],
  );
  const weeks = useMemo(
    () => getDashboardWeeks(calYear, calMonth, data, goal, clients),
    [calYear, calMonth, data, goal, clients],
  );

  const totals = weeks.reduce((a, w) => ({
    obj: a.obj + (w.obj || 0), real: a.real + (w.real || 0),
    tours: a.tours + (w.tours || 0), sales: a.sales + (w.sales || 0),
  }), { obj: 0, real: 0, tours: 0, sales: 0 });

  const vfalt = Math.max(0, goal.vol - totals.real);
  const drest = workingDaysRemaining(calYear, calMonth, data);
  const prod = drest > 0 ? vfalt / drest : 0;
  const vprom = totals.sales > 0 ? totals.real / totals.sales : 0;
  const efic = totals.tours > 0 ? totals.real / totals.tours : 0;
  const cierre = totals.tours > 0 ? (totals.sales / totals.tours) * 100 : 0;

  const rows = [
    [t("goals.volumeProduced"), fmt(totals.real), "green"],
    [t("goals.volumeRemaining"), fmt(vfalt), "red"],
    [t("goals.dailyProductionNeeded"), fmt(prod), "yellow"],
    [t("goals.toursAccumulated"), fmtN(totals.tours), "blue"],
    [t("goals.salesAccumulated"), fmtN(totals.sales), "blue"],
    [t("goals.avgSale"), fmt(vprom), "teal"],
    [t("goals.closeRate"), `${cierre.toFixed(1)}%`, "purple"],
    [t("goals.efficiency"), fmt(efic), "purple"],
  ];

  if (!hydrated) return <Topbar title={t("page.dashboard.title")} subtitle={t("common.loading")} />;

  return (
    <>
      <Topbar title={t("page.dashboard.title")} subtitle={t("page.dashboard.subtitle")} />
      <div className="sales-page">
        <PageBack />
        <div className="dash-lean-head">
          <div>
            <div className="dash-title">{t("page.dashboard.title")}</div>
            <div className="dash-sub">{months[calMonth]} {calYear}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div className="local-month-nav">
              <button type="button" className="tb-nav-btn" onClick={calPrev} aria-label={t("common.previousMonth")}>‹</button>
              <div className="local-month-label">{months[calMonth]} {calYear}</div>
              <button type="button" className="tb-nav-btn" onClick={calNext} aria-label={t("common.nextMonth")}>›</button>
            </div>
          </div>
        </div>

        <div className="dash-top-grid">
          <div className="dash-data-card">
            <div className="dash-card-title"><BarChart3 size={18} color="#2563eb" /> {t("goals.data")}</div>
            <div>
              {rows.map(([label, value, color]) => (
                <div key={label} className="dash-data-row">
                  <span className="dash-data-dot" />
                  <span className="dash-data-label">{label}</span>
                  <span className={`dash-data-value ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="dash-graph-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
              <div className="dash-card-title" style={{ marginBottom: 0 }}><Target size={18} color="#2563eb" /> {t("goals.targetVsReal")}</div>
              <div className="dash-chart-toggles">
                <label className="dash-chart-toggle">
                  <input type="checkbox" checked={showTarget} onChange={(e) => setShowTarget(e.target.checked)} />
                  <span className="legend-line" /> {t("goals.showTarget")}
                </label>
                <label className="dash-chart-toggle">
                  <input type="checkbox" checked={showReal} onChange={(e) => setShowReal(e.target.checked)} />
                  <span className="legend-box" /> {t("goals.showReal")}
                </label>
              </div>
            </div>
            <DashboardChart weeks={weeks} showTarget={showTarget} showReal={showReal} />
          </div>
        </div>

        <div className="dash-table-card">
          <div className="dash-card-title"><Calendar size={18} color="#2563eb" /> {t("goals.weeklyProduction")}</div>
          <table className="dash-week-prod-table">
            <thead><tr><th>{t("goals.weekNum")}</th><th>{t("goals.objective")}</th><th>{t("goals.real")}</th></tr></thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.weekNo}><td>{w.weekNo}</td><td>{fmt(w.obj)}</td><td>{fmt(w.real)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
