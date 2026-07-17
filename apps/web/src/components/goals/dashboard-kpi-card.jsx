/**
 * Tarjeta KPI reutilizable del Dashboard.
 * Jerarquía: ícono → nombre → valor (tipografía Worksheet `.vbox-val`).
 * El valor llega ya formateado (ej. "5,000 USD" o "50%") y se muestra en una sola línea.
 */
export function DashboardKpiCard({ icon: Icon, label, value, iconSize = 15 }) {
  return (
    <div className="dash-kpi-card">
      {Icon ? (
        <div className="dash-kpi-card-icon" aria-hidden="true">
          <Icon size={iconSize} />
        </div>
      ) : null}
      <div className="dash-kpi-card-body">
        <div className="dash-kpi-card-label">{label}</div>
        <div className="vbox-val dash-kpi-card-val">{value}</div>
      </div>
    </div>
  );
}
