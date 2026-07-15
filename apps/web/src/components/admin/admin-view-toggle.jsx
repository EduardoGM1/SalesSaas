/**
 * Selector Tabla / Gráfica para bloques del panel admin.
 */
export function AdminViewToggle({ value, onChange, tableLabel, chartLabel }) {
  return (
    <div className="admin-view-toggle" role="group" aria-label="Vista">
      <button
        type="button"
        className={`admin-view-toggle-btn${value === "table" ? " is-active" : ""}`}
        aria-pressed={value === "table"}
        onClick={() => onChange("table")}
      >
        {tableLabel}
      </button>
      <button
        type="button"
        className={`admin-view-toggle-btn${value === "chart" ? " is-active" : ""}`}
        aria-pressed={value === "chart"}
        onClick={() => onChange("chart")}
      >
        {chartLabel}
      </button>
    </div>
  );
}
