/**
 * Carpetas de expediente: Nivel 1 (pestaña trapecio) + bandeja de sub-tabs.
 *
 * `FolderTab` / `ClientFolderStrip` cubren TODA carpeta de nivel 1 con hijos
 * (Survey, Vacaciones, Worksheet, Datos Cliente, Venta, Notas).
 * `SubTabsDrawer` es la bandeja de Nivel 2 (Survey, Worksheet RH, etc.).
 */

export function FolderTab({ folder, selected }) {
  const Icon = folder.icon;
  const tone = folder.tone || "blue";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={`exp-folder-tab tone-${tone}${selected ? " is-active" : ""}`}
      onClick={folder.onClick}
    >
      <span className="exp-folder-tab-ear">
        {Icon ? <Icon size={14} aria-hidden /> : null}
        <span className="exp-folder-tab-ear-label">{folder.label}</span>
      </span>
      <span className="exp-folder-tab-body">
        <span className="exp-folder-tab-title">{folder.label}</span>
        {folder.desc ? <span className="exp-folder-tab-desc">{folder.desc}</span> : null}
      </span>
    </button>
  );
}

export function ClientFolderStrip({ folders, activeTab }) {
  return (
    <div
      className="exp-folder-strip exp-folder-strip--shelf"
      role="tablist"
      aria-label="Carpetas del expediente"
    >
      {folders.map((folder) => (
        <FolderTab
          key={folder.id}
          folder={folder}
          selected={folder.id === activeTab}
        />
      ))}
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

/** Bandeja bajo la carpeta activa: franja del color heredado + sub-tabs. */
export function SubTabsDrawer({
  tabs,
  activeId,
  onSelect,
  tone = "blue",
  ariaLabel = "Secciones",
}) {
  if (!tabs?.length) return null;
  return (
    <div className={`exp-subtabs-drawer tone-${tone}`}>
      <ClientFolderSubnav
        tabs={tabs}
        activeId={activeId}
        onSelect={onSelect}
        ariaLabel={ariaLabel}
      />
    </div>
  );
}
