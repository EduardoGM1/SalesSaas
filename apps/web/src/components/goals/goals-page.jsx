
import { useMemo } from "react";
import { BarChart3, Calendar, Target } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { DashboardChart } from "@/components/goals/dashboard-chart";
import { getDashboardWeeks, normalizeGoal, workingDaysRemaining } from "@/lib/calculations/calendar";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
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
  const getCalMonth = useDbStore((s) => s.getCalMonth);
  const getGoalMonth = useDbStore((s) => s.getGoalMonth);

  const data = getCalMonth(calYear, calMonth);
  const goal = normalizeGoal(getGoalMonth(calYear, calMonth));
  const weeks = useMemo(() => getDashboardWeeks(calYear, calMonth, data, goal), [calYear, calMonth, data, goal]);

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div className="dash-card-title" style={{ marginBottom: 0 }}><Target size={18} color="#2563eb" /> {t("goals.targetVsReal")}</div>
              <div className="dash-legend">
                <span className="dash-legend-item"><span className="legend-line" /> {t("goals.target")}</span>
                <span className="dash-legend-item"><span className="legend-box" /> {t("goals.real")}</span>
              </div>
            </div>
            <DashboardChart weeks={weeks} />
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
