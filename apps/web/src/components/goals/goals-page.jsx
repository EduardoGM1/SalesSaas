
import { useMemo, useState } from "react";
import { BarChart3, Calendar, List, Tag, Target, TrendingUp } from "lucide-react";
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
  const tourTypes = useDbStore((s) => s.db.settings?.tourTypes ?? ["Q", "NQ", "CT", "Member"]);
  const goal = useMemo(
    () => normalizeGoal({ vol: goalVol, tours: goalTours, ventas: goalVentas }),
    [goalVol, goalTours, goalVentas],
  );
  const weeks = useMemo(
    () => getDashboardWeeks(calYear, calMonth, data, goal, clients),
    [calYear, calMonth, data, goal, clients],
  );

  const tourSummary = useMemo(() => {
    const map: Record<string, { yes: number; no: number }> = {};
    tourTypes.forEach((type) => {
      map[type] = { yes: 0, no: 0 };
    });
    Object.values(clients).forEach((c) => {
      if (!c.tipo_tour) return;
      if (!map[c.tipo_tour]) map[c.tipo_tour] = { yes: 0, no: 0 };
      if (c.tour_cuantificable !== false) map[c.tipo_tour].yes++;
      else map[c.tipo_tour].no++;
    });
    return map;
  }, [clients, tourTypes]);

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

  const volumeRows = [
    [t("goals.volumeProduced"), fmt(totals.real), "green"],
    [t("goals.volumeRemaining"), fmt(vfalt), "red"],
    [t("goals.dailyProductionNeeded"), fmt(prod), "yellow"],
  ];

  const desktopRows = [
    ...volumeRows,
    [t("goals.toursAccumulated"), fmtN(totals.tours), "blue"],
    [t("goals.salesAccumulated"), fmtN(totals.sales), "blue"],
    [t("goals.avgSale"), fmt(vprom), "teal"],
    [t("goals.closeRate"), `${cierre.toFixed(1)}%`, "purple"],
    [t("goals.efficiency"), fmt(efic), "purple"],
  ];

  if (!hydrated) return <Topbar title={t("page.dashboard.title")} subtitle={t("common.loading")} />;

  const periodBadges = (
    <div className="dash-period-badges">
      <div className="dash-period-badge">
        <Calendar size={15} aria-hidden="true" />
        <span className="dash-period-badge-label">{t("metas.year")}</span>
        <span className="dash-period-badge-val">{calYear}</span>
      </div>
      <div className="dash-period-badge">
        <Calendar size={15} aria-hidden="true" />
        <span className="dash-period-badge-label">{t("metas.month")}</span>
        <span className="dash-period-badge-val">{months[calMonth]}</span>
      </div>
    </div>
  );

  const dataRows = (rows) => rows.map(([label, value, color]) => (
    <div key={label} className="dash-data-row">
      <span className="dash-data-dot" />
      <span className="dash-data-label">{label}</span>
      <span className={`dash-data-value ${color}`}>{value}</span>
    </div>
  ));

  const chartBlock = (
    <div className="dash-graph-card">
      <div className="dash-graph-head">
        <div className="dash-card-title"><Target size={18} color="#2563eb" /> {t("goals.targetVsReal")}</div>
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
  );

  const weeklyTable = (
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
  );

  const tourTypeEntries = tourTypes.map((type) => [type, tourSummary[type] ?? { yes: 0, no: 0 }] as [string, { yes: number; no: number }] );
  const tourTypeBlock = tourTypeEntries.length > 0 ? (
    <div className="dash-table-card">
      <div className="dash-card-title"><List size={18} color="#2563eb" /> {t("goals.tourTypeSummary")}</div>
      <table className="dash-tour-summary-table">
        <thead>
          <tr>
            <th>{t("goals.tourTypeCol")}</th>
            <th colSpan={2} style={{ textAlign: "center" }}>{t("goals.quantifiable")}</th>
            <th>{t("goals.total")}</th>
          </tr>
          <tr className="dash-ts-subhead">
            <th></th>
            <th>{t("goals.yesShort")}</th>
            <th>{t("goals.noShort")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tourTypeEntries.map(([type, counts]) => {
            const total = counts.yes + counts.no;
            return (
              <tr key={type}>
                <td className="dash-ts-type">{type}</td>
                <td className="dash-ts-yes">{counts.yes}</td>
                <td className="dash-ts-no">{counts.no}</td>
                <td className="dash-ts-total">{total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : null;

  return (
    <>
      <Topbar title={t("page.dashboard.title")} subtitle={t("page.dashboard.subtitle")} />
      <div className="sales-page dash-page">
        <div className="dash-page-nav">
          <PageBack inline />
        </div>
        <div className="local-month-nav dash-month-nav">
          <button type="button" className="tb-nav-btn" onClick={calPrev} aria-label={t("common.previousMonth")}>‹</button>
          <div className="local-month-label">{months[calMonth]} {calYear}</div>
          <button type="button" className="tb-nav-btn" onClick={calNext} aria-label={t("common.nextMonth")}>›</button>
        </div>

        <div className="dash-mobile-layout">
          <div className="dash-data-card dash-main-card">
            <div className="dash-card-head">
              <div className="dash-card-title"><BarChart3 size={18} color="#2563eb" /> {t("goals.data")}</div>
              {periodBadges}
            </div>
            <div className="dash-data-list">
              {dataRows(volumeRows)}
            </div>

            <div className="dash-section-divider">{t("goals.accumulated")}</div>
            <div className="dash-stat-grid dash-stat-grid--2">
              <div className="dash-stat-card">
                <span className="dash-stat-label">{t("metas.tours")}</span>
                <span className="dash-stat-val">{fmtN(totals.tours)}</span>
              </div>
              <div className="dash-stat-card">
                <span className="dash-stat-label">{t("metas.sales")}</span>
                <span className="dash-stat-val">{fmtN(totals.sales)}</span>
              </div>
            </div>

            <div className="dash-section-divider">{t("goals.kpisSection")}</div>
            <div className="dash-stat-grid dash-stat-grid--3">
              <div className="dash-kpi-mini">
                <Tag size={14} aria-hidden="true" />
                <span className="dash-kpi-mini-label">{t("goals.avgSale")}</span>
                <span className="dash-kpi-mini-val">{fmt(vprom)}</span>
              </div>
              <div className="dash-kpi-mini">
                <Target size={14} aria-hidden="true" />
                <span className="dash-kpi-mini-label">{t("goals.closeRate")}</span>
                <span className="dash-kpi-mini-val">{cierre.toFixed(0)}%</span>
              </div>
              <div className="dash-kpi-mini">
                <TrendingUp size={14} aria-hidden="true" />
                <span className="dash-kpi-mini-label">{t("goals.efficiency")}</span>
                <span className="dash-kpi-mini-val">{fmt(efic)}</span>
              </div>
            </div>
          </div>
          {chartBlock}
          {weeklyTable}
          {tourTypeBlock}
        </div>

        <div className="dash-desktop-layout">
          <div className="dash-top-grid">
            <div className="dash-data-card">
              <div className="dash-card-title"><BarChart3 size={18} color="#2563eb" /> {t("goals.data")}</div>
              <div className="dash-data-list">
                {dataRows(desktopRows)}
              </div>
            </div>
            {chartBlock}
          </div>
          <div className="dash-bottom-grid">
            {weeklyTable}
            {tourTypeBlock}
          </div>
        </div>
      </div>
    </>
  );
}
