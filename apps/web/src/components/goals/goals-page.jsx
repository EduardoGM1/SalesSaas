
import { useMemo } from "react";
import { BarChart3, Calendar, Target } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { DashboardChart } from "@/components/goals/dashboard-chart";
import { MONTHS } from "@/lib/constants";
import { getDashboardWeeks, normalizeGoal, workingDaysRemaining } from "@/lib/calculations/calendar";
import { fmt, fmtN } from "@/lib/format/money";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";

export function GoalsPage() {
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

  const rows: [string, string, string][] = [
    ["Volumen producido", fmt(totals.real), "green"],
    ["Volumen faltante", fmt(vfalt), "red"],
    ["Producción diaria necesaria", fmt(prod), "yellow"],
    ["Tours acumulados", fmtN(totals.tours), "blue"],
    ["Ventas acumuladas", fmtN(totals.sales), "blue"],
    ["Venta promedio", fmt(vprom), "teal"],
    ["% Cierre", `${cierre.toFixed(1)}%`, "purple"],
    ["Eficiencia / VPG", fmt(efic), "purple"],
  ];

  if (!hydrated) return <Topbar title="Dashboard" subtitle="Cargando..." />;

  return (
    <>
      <Topbar title="Dashboard" subtitle="Seguimiento de metas" />
      <div className="sales-page">
        <PageBack />
        <div className="dash-lean-head">
          <div>
            <div className="dash-title">Dashboard</div>
            <div className="dash-sub">{MONTHS[calMonth]} {calYear}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div className="local-month-nav">
              <button type="button" className="tb-nav-btn" onClick={calPrev} aria-label="Mes anterior">‹</button>
              <div className="local-month-label">{MONTHS[calMonth]} {calYear}</div>
              <button type="button" className="tb-nav-btn" onClick={calNext} aria-label="Mes siguiente">›</button>
            </div>
          </div>
        </div>

        <div className="dash-top-grid">
          <div className="dash-data-card">
            <div className="dash-card-title"><BarChart3 size={18} color="#2563eb" /> Datos</div>
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
              <div className="dash-card-title" style={{ marginBottom: 0 }}><Target size={18} color="#2563eb" /> Objetivo VS Real</div>
              <div className="dash-legend">
                <span className="dash-legend-item"><span className="legend-line" /> Objetivo</span>
                <span className="dash-legend-item"><span className="legend-box" /> Real</span>
              </div>
            </div>
            <DashboardChart weeks={weeks} />
          </div>
        </div>

        <div className="dash-table-card">
          <div className="dash-card-title"><Calendar size={18} color="#2563eb" /> Producción semanal</div>
          <table className="dash-week-prod-table">
            <thead><tr><th>Sem #</th><th>Objetivo</th><th>Real</th></tr></thead>
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
