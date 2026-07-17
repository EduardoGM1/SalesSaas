/**
 * Tarjeta KPI reutilizable del Dashboard.
 * Jerarquía: ícono (reconocer) → nombre (explicar) → valor (protagonista, tipografía Worksheet `.vbox-val`).
 * En montos, separa código/símbolo de moneda del número para que el wrap móvil nunca parta "5,000".
 */

function splitKpiValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.includes("%")) return { kind: "plain", text: raw };
  const spaced = raw.match(/^([A-Z]{3})\s+(.+)$/u);
  if (spaced) return { kind: "money", code: spaced[1], amount: spaced[2] };
  const symbol = raw.match(/^((?:US|CA|MX)?\$|€)\s*(.+)$/u);
  if (symbol) return { kind: "money", code: symbol[1], amount: symbol[2] };
  return { kind: "plain", text: raw };
}

export function DashboardKpiCard({ icon: Icon, label, value, iconSize = 15 }) {
  const parts = splitKpiValue(value);
  return (
    <div className="dash-kpi-card">
      {Icon ? (
        <div className="dash-kpi-card-icon" aria-hidden="true">
          <Icon size={iconSize} />
        </div>
      ) : null}
      <div className="dash-kpi-card-body">
        <div className="dash-kpi-card-label">{label}</div>
        <div className="vbox-val dash-kpi-card-val">
          {parts.kind === "money" ? (
            <>
              <span className="dash-kpi-curr">{parts.code}</span>
              <span className="dash-kpi-amt">{parts.amount}</span>
            </>
          ) : (
            <span className="dash-kpi-amt">{parts.text}</span>
          )}
        </div>
      </div>
    </div>
  );
}
