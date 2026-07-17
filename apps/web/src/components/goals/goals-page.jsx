import { useMemo, useState } from "react";
import { BarChart3, Calendar, List, Tag, Target, TrendingUp } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { DashboardChart } from "@/components/goals/dashboard-chart";
import { DashboardKpiCard } from "@/components/goals/dashboard-kpi-card.jsx";
import { CollapsibleSection } from "@/components/ui/collapsible-section.jsx";
import { getDashboardWeeks, normalizeGoal, workingDaysRemaining } from "@/lib/calculations/calendar";
import { productionTourSaleCounts } from "@/lib/calculations/tour-summary";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { calKey } from "@/lib/format/dates";
import { DEFAULT_TOUR_TYPES, EMPTY_CAL_MONTH } from "@/lib/store-empty.js";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";

export function GoalsPage() {
  const { t, months } = useI18n();
  const { fmt, fmtN, settings: moneySettings } = useMoney();
  /** Formato KPI: "5,000 USD" (número + espacio + código). */
  const kpiMoney = (n) => `${fmtN(n)} ${moneySettings.currency || "USD"}`;
  const hydrated = useAppStore((s) => s.hydrated);
  const calYear = useAppStore((s) => s.calYear);
  const calMonth = useAppStore((s) => s.calMonth);
  const calPrev = useAppStore((s) => s.calPrev);
  const calNext = useAppStore((s) => s.calNext);
  const [showTarget, setShowTarget] = useState(true);
  const [showReal, setShowReal] = useState(true);
  const monthKey = calKey(calYear, calMonth);
  const data = useDbStore((s) => s.db.cal[monthKey] ?? EMPTY_CAL_MONTH, shallow);
  const goalVol = useDbStore((s) => s.db.goals[monthKey]?.vol ?? 0, shallow);
  const goalTours = useDbStore((s) => s.db.goals[monthKey]?.tours ?? 0, shallow);
  const goalVentas = useDbStore((s) => s.db.goals[monthKey]?.ventas ?? 0, shallow);
  const clients = useDbStore((s) => s.db.clients, shallow);
  const tourTypes = useDbStore((s) => s.db.settings?.tourTypes ?? DEFAULT_TOUR_TYPES, shallow);
  const goal = useMemo(
    () => normalizeGoal({ vol: goalVol, tours: goalTours, ventas: goalVentas }),
    [goalVol, goalTours, goalVentas],
  );
  const weeks = useMemo(
    () => getDashboardWeeks(calYear, calMonth, data, goal, clients),
    [calYear, calMonth, data, goal, clients],
  );

  /** Fuente única: Resumen de tipo tours + recuadros Tours/Ventas de Datos de producción. */
  const { summary: tourSummary, tours: productionTours, sales: productionSales } = useMemo(
    () => productionTourSaleCounts(clients, tourTypes),
    [clients, tourTypes],
  );

  /** Volumen del mes (agenda/ventas); Tours/Ventas acumulados vienen de expedientes cuantificables. */
  const volumeTotals = weeks.reduce((a, w) => ({
    obj: a.obj + (w.obj || 0),
    real: a.real + (w.real || 0),
  }), { obj: 0, real: 0 });

  const totals = {
    ...volumeTotals,
    tours: productionTours,
    sales: productionSales,
  };

  const vfalt = Math.max(0, goal.vol - totals.real);
  const drest = workingDaysRemaining(calYear, calMonth, data);
  const prod = drest > 0 ? vfalt / drest : 0;
  // KPIs con la misma base de Tours/Ventas que Datos de producción
  const vprom = totals.sales > 0 ? totals.real / totals.sales : 0;
  const efic = totals.tours > 0 ? totals.real / totals.tours : 0;
  const cierre = totals.tours > 0 ? (totals.sales / totals.tours) * 100 : 0;

  const volumeRows = [
    [t("goals.volumeProduced"), fmt(totals.real), "green"],
    [t("goals.volumeRemaining"), fmt(vfalt), "red"],
    [t("goals.dailyProductionNeeded"), fmt(prod), "yellow"],
  ];

  if (!hydrated) return <Topbar title={t("page.dashboard.title")} subtitle={t("common.loading")} />;

  const dataRows = (rows) => rows.map(([label, value, color]) => (
    <div key={label} className="dash-data-row">
      <span className="dash-data-dot" />
      <span className="dash-data-label">{label}</span>
      <span className={`dash-data-value ${color}`}>{value}</span>
    </div>
  ));

  const renderProductionStack = () => (
    <div className="dash-prod-stack">
      <div className="dash-data-card dash-main-card">
        <div className="dash-card-head">
          <div className="dash-card-title"><BarChart3 size={18} color="#2563eb" /> {t("goals.data")}</div>
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
        </div>
        <div className="dash-data-list">
          {dataRows(volumeRows)}
        </div>
        <div className="dash-stat-grid dash-stat-grid--2 dash-tours-sales-grid">
          <div className="dash-stat-card">
            <span className="dash-stat-label">{t("metas.tours")}</span>
            <span className="dash-stat-val">{fmtN(totals.tours)}</span>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-label">{t("metas.sales")}</span>
            <span className="dash-stat-val">{fmtN(totals.sales)}</span>
          </div>
        </div>
      </div>

      <CollapsibleSection
        defaultOpen
        className="dash-graph-card dash-chart-collapsible"
        title={<div className="dash-card-title"><Target size={18} color="#2563eb" /> {t("goals.targetVsReal")}</div>}
        subtitle={t("goals.chartHint")}
        bodyClassName="dash-graph-card-body"
      >
        <div className="dash-graph-head dash-graph-head--body">
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
      </CollapsibleSection>

      <div className="dash-data-card dash-kpis-card">
        <div className="dash-card-title"><TrendingUp size={18} color="#2563eb" /> {t("goals.kpisSection")}</div>
        <div className="dash-stat-grid dash-stat-grid--3">
          <DashboardKpiCard icon={Tag} label={t("goals.avgSale")} value={kpiMoney(vprom)} />
          <DashboardKpiCard icon={Target} label={t("goals.closeRate")} value={`${cierre.toFixed(0)}%`} />
          <DashboardKpiCard icon={TrendingUp} label={t("goals.efficiency")} value={kpiMoney(efic)} />
        </div>
      </div>
    </div>
  );

  const weeklyTableBody = (
    <table className="dash-week-prod-table">
      <thead><tr><th>{t("goals.weekNum")}</th><th>{t("goals.objective")}</th><th>{t("goals.real")}</th></tr></thead>
      <tbody>
        {weeks.map((w) => (
          <tr key={w.weekNo}><td>{w.weekNo}</td><td>{fmt(w.obj)}</td><td>{fmt(w.real)}</td></tr>
        ))}
      </tbody>
    </table>
  );

  const weeklyTable = (
    <div className="dash-table-card">
      <div className="dash-card-title"><Calendar size={18} color="#2563eb" /> {t("goals.weeklyProduction")}</div>
      {weeklyTableBody}
    </div>
  );

  const weeklyTableMobile = (
    <CollapsibleSection
      mobileOnly
      defaultOpen={false}
      className="dash-table-card"
      title={<div className="dash-card-title"><Calendar size={18} color="#2563eb" /> {t("goals.weeklyProduction")}</div>}
    >
      {weeklyTableBody}
    </CollapsibleSection>
  );

  const tourTypeEntries = tourTypes.map((type) => [type, tourSummary[type] ?? { yes: 0, no: 0 }] as [string, { yes: number; no: number }] );
  const tourTypeTableBody = (
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
  );

  const tourTypeBlock = tourTypeEntries.length > 0 ? (
    <div className="dash-table-card">
      <div className="dash-card-title"><List size={18} color="#2563eb" /> {t("goals.tourTypeSummary")}</div>
      {tourTypeTableBody}
    </div>
  ) : null;

  const tourTypeBlockMobile = tourTypeEntries.length > 0 ? (
    <CollapsibleSection
      mobileOnly
      defaultOpen={false}
      className="dash-table-card"
      title={<div className="dash-card-title"><List size={18} color="#2563eb" /> {t("goals.tourTypeSummary")}</div>}
    >
      {tourTypeTableBody}
    </CollapsibleSection>
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
          {renderProductionStack()}
          {weeklyTableMobile}
          {tourTypeBlockMobile}
        </div>

        <div className="dash-desktop-layout">
          {renderProductionStack()}
          <div className="dash-bottom-grid">
            {weeklyTable}
            {tourTypeBlock}
          </div>
        </div>
      </div>
    </>
  );
}
