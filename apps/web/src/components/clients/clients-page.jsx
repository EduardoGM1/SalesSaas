
import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Eye, Trash2 } from "lucide-react";
import { SalesModal } from "@/components/ui/sales-modal";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { clientDisplayName } from "@/lib/clients";
import { longDate } from "@/lib/format/dates";
import { statusLabel, statusClass } from "@/lib/format/status";
import { useDbStore } from "@/stores/db-store";
import { useAppStore } from "@/stores/app-store";
import { useClientActions } from "@/hooks/use-client-actions.js";

export function ClientsPage() {
  const hydrated = useAppStore((s) => s.hydrated);
  const { searchClients, createProspect, removeClient } = useClientActions();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [missingName, setMissingName] = useState(false);
  const [query, setQuery] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMissingName(false);
    const timer = window.setTimeout(() => nameRef.current?.focus(), 300);
    return () => window.clearTimeout(timer);
  }, [open]);

  const sorted = searchClients(query);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName("");
      setMissingName(false);
    }
  };

  const handleCreate = () => {
    const result = createProspect(name);
    if (!result.ok) {
      if (result.reason === "missing_name") {
        setMissingName(true);
        nameRef.current?.focus();
      }
      return;
    }
    handleOpenChange(false);
  };

  if (!hydrated) return <Topbar title="Clientes" subtitle="Cargando..." />;

  return (
    <>
      <Topbar title="Clientes" subtitle="Gestión de expedientes" />
      <div className="sales-page">
        <PageBack />
        <div className="page-head">
          <div>
            <div className="page-title">Clientes</div>
            <div className="page-sub">Gestión de expedientes</div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => handleOpenChange(true)}>+ Nuevo cliente</button>
        </div>

        <div className="client-search-card">
          <div className="client-search-row">
            <div className="client-search-input-wrap">
              <input
                type="search"
                className="client-search-input"
                placeholder="Buscar por nombre, acompañante, contrato, fecha, mes, año, ciudad, país o estado..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuery("")}>Limpiar</button>
            <div className="client-search-count">
              {terms.length ? `${sorted.length} de ${allClients.length} expedientes` : `${allClients.length} expedientes`}
            </div>
          </div>
          <div className="client-search-help">El buscador filtra la base de expedientes sin modificar clientes, ventas ni actividades.</div>
        </div>

        {!allClients.length ? (
          <div className="client-empty">Sin clientes aún. Haz clic en <strong>Nuevo cliente</strong> para comenzar.</div>
        ) : !sorted.length ? (
          <div className="client-search-empty">No encontré expedientes con <strong>{query}</strong>.</div>
        ) : (
          <div className="client-table-card">
            <table className="client-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Fecha de tour</th>
                  <th>Ciudad / País</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/clients/${c.id}`} className="client-name-link">
                        <span>{clientDisplayName(c)}</span>
                        <span className="client-code">{c.prospectCode}</span>
                      </Link>
                    </td>
                    <td>{c.tourDate ? longDate(c.tourDate) : c.createdYmd ? longDate(c.createdYmd) : "—"}</td>
                    <td>{[c.city, c.country].filter(Boolean).join(" / ") || "—"}</td>
                    <td>
                      <span className={`client-status-badge ${statusClass(c.status)}`}>{statusLabel(c.status)}</span>
                    </td>
                    <td>
                      <div className="client-actions">
                        <Link to={`/clients/${c.id}`} className="icon-btn" title="Ver expediente"><Eye size={14} /></Link>
                        <button type="button" className="icon-btn" title="Eliminar" onClick={async () => {
                          await removeClient(c.id, clientDisplayName(c));
                        }}><Trash2 size={14} color="#dc2626" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SalesModal
        open={open}
        onOpenChange={handleOpenChange}
        title="Nuevo cliente"
        sub="Crea el expediente con el nombre inicial. Los demás datos se completan dentro del expediente."
      >
        <div className={`newclient-field required-field${missingName ? " field-missing" : ""}`}>
          <label className="required-label">
            Nombre completo{" "}
            <em style={{ fontStyle: "italic", textTransform: "none", letterSpacing: ".2px" }}>(cliente 1)</em>
            <span className="req-star">*</span>
          </label>
          <input
            ref={nameRef}
            id="nc-name"
            type="text"
            value={name}
            placeholder="Nombre completo"
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value.trim()) setMissingName(false);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          />
        </div>
        <div className="btn-row" style={{ marginTop: 20 }}>
          <button type="button" className="btn btn-ghost" onClick={() => handleOpenChange(false)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={handleCreate}>Crear expediente</button>
        </div>
      </SalesModal>
    </>
  );
}
