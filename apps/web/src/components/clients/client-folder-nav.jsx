/**
 * Shell de carpetas (Nivel 1) + bandeja de sub-tabs (Nivel 2).
 *
 * Nivel 1: fila de cards grandes (estantería), nunca columna ni chips.
 * Nivel 2 SOLO en Worksheet con flag worksheet.royal_holiday.
 *
 * Pendientes de producto (no decidir ni implementar aquí):
 * - Si las carpetas Venta / Notas tendrán sub-tabs a futuro
 * - Persistencia del último tab entre sesiones
 * - Límite de carpetas en mobile
 */

import { ChevronDown } from "lucide-react";

export function ClientFolderStrip({ folders, activeTab }) {
  return (
    <div
      className="exp-folder-strip exp-folder-strip--shelf"
      role="tablist"
      aria-label="Carpetas del expediente"
    >
      {folders.map((folder) => {
        const Icon = folder.icon;
        const selected = folder.id === activeTab;
        const tone = folder.tone || "blue";
        return (
          <button
            key={folder.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`exp-folder-card exp-folder-card--shelf tone-${tone}${selected ? " is-active" : ""}`}
            onClick={folder.onClick}
          >
            <div className={`tool-icon ${tone}`}><Icon size={18} /></div>
            <ChevronDown className="exp-folder-chevron" size={16} aria-hidden />
            <div className="exp-folder-card-text">
              <div className="tool-name">{folder.label}</div>
              {folder.desc ? <div className="tool-desc">{folder.desc}</div> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function ClientFolderSubnav({ tabs, activeId, onSelect, ariaLabel = "Secciones" }) {
  if (!tabs?.length) return null;
  return (
    <nav className="exp-folder-subnav" aria-label={ariaLabel}>
      {tabs.map((tb) => (
        <button
          key={tb.id}
          type="button"
          className={`exp-folder-subnav-item${tb.id === activeId ? " is-active" : ""}`}
          onClick={() => onSelect(tb.id)}
        >
          {tb.label}
        </button>
      ))}
    </nav>
  );
}
