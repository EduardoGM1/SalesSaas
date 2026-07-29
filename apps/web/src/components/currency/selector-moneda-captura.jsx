/**
 * Pestañas de moneda de captura (USD/MXN). No cambia idioma ni país de la app.
 */
export function SelectorMonedaCaptura({ value = "USD", onChange, disabled = false, className = "" }) {
  const current = value === "MXN" ? "MXN" : "USD";

  return (
    <div className={`selector-moneda-captura${className ? ` ${className}` : ""}`} role="group" aria-label="Moneda de captura">
      {[
        { id: "USD", flag: "🇺🇸", label: "USD / United States" },
        { id: "MXN", flag: "🇲🇽", label: "MXN / México" },
      ].map((item) => (
        <button
          key={item.id}
          type="button"
          className={`selector-moneda-captura-btn${current === item.id ? " on" : ""}`}
          aria-pressed={current === item.id}
          disabled={disabled}
          onClick={() => onChange?.(item.id)}
        >
          <span className="selector-moneda-captura-flag" aria-hidden>{item.flag}</span>
          <span className="selector-moneda-captura-text">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
