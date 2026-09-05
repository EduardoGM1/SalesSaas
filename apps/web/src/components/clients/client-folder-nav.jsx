/**
 * Shell de carpetas (Nivel 1) + bandeja de sub-tabs (Nivel 2).
 *
 * Nivel 2 SOLO en Worksheet con flag worksheet.royal_holiday.
 * Carpetas sin hijos (y Worksheet regular) = panel inline, sin bandeja.
 *
 * Pendientes de producto (no decidir ni implementar aquí):
 * - Si las carpetas Venta / Notas tendrán sub-tabs a futuro
 * - Persistencia del último tab entre sesiones
 * - Límite de carpetas en mobile
 */

export function ClientFolderStrip({ folders, activeTab, compact }) {
  return (
    <div
      className={`exp-folder-strip${compact ? " exp-folder-strip--compact" : ""}`}
      role="tablist"
      aria-label="Carpetas del expediente"
    >
      {folders.map((folder) => {
        const Icon = folder.icon;
        const selected = folder.id === activeTab;
        return (
          <button
            key={folder.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`exp-folder-card${selected ? " is-active" : ""}${compact ? " exp-folder-card--compact" : ""}`}
            onClick={folder.onClick}
          >
            <div className={`tool-icon ${folder.tone}`}><Icon size={compact ? 16 : 20} /></div>
            <div className="exp-folder-card-text">
              <div className="tool-name">{folder.label}</div>
              {!compact && folder.desc ? <div className="tool-desc">{folder.desc}</div> : null}
            </div>
            {!compact && <div className="exp-folder-chevron">›</div>}
          </button>
        );
      })}
    </div>
  );
}

export function ClientFolderSubnav({ tabs, activeId, onSelect, ariaLabel = "Secciones" }) {
  if (!tabs?.length) return null;
  return (
    <nav className="admin-subnav worksheet-rh-tabs exp-folder-subnav" aria-label={ariaLabel}>
      {tabs.map((tb) => (
        <button
          key={tb.id}
          type="button"
          className={`admin-subnav-item${tb.id === activeId ? " active" : ""}`}
          onClick={() => onSelect(tb.id)}
        >
          {tb.label}
        </button>
      ))}
    </nav>
  );
}
