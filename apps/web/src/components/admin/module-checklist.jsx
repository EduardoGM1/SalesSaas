/**
 * Checklist reutilizable de módulos (flags) para Puestos y Paquetes.
 */
export function ModuleChecklist({
  flags = [],
  value = [],
  onChange,
  disabled = false,
  className = "",
  idPrefix = "mod",
}) {
  const selected = Array.isArray(value) ? value : [];

  return (
    <div className={`admin-tenant-check-grid module-checklist${className ? ` ${className}` : ""}`}>
      {(flags || []).map((flag) => {
        const clave = flag.clave;
        const inputId = `${idPrefix}-${clave}`;
        return (
          <label key={flag.id || clave} htmlFor={inputId}>
            <input
              id={inputId}
              type="checkbox"
              checked={selected.includes(clave)}
              disabled={disabled}
              onChange={(event) => {
                if (!onChange) return;
                onChange(
                  event.target.checked
                    ? [...selected, clave]
                    : selected.filter((key) => key !== clave),
                );
              }}
            />
            {flag.nombre_visible || clave}
          </label>
        );
      })}
    </div>
  );
}
