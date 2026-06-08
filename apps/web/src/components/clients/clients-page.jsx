
import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Eye, Trash2 } from "lucide-react";
import { SalesModal } from "@/components/ui/sales-modal";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { clientDisplayName, ensureProspectIdentity } from "@/lib/clients";
import { MONTHS } from "@/lib/constants";
import { longDate } from "@/lib/format/dates";
import { statusLabel, statusClass } from "@/lib/format/status";
import { createEmptyClient, useDbStore } from "@/stores/db-store";
import { useAppStore } from "@/stores/app-store";
import {  useNavigate  } from "react-router-dom";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";

export function ClientsPage() {
  const hydrated = useAppStore((s) => s.hydrated);
  const db = useDbStore((s) => s.db);
  const saveClient = useDbStore((s) => s.saveClient);
  const deleteClient = useDbStore((s) => s.deleteClient);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [missingName, setMissingName] = useState(false);
  const [query, setQuery] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setMissingName(false);
    const timer = window.setTimeout(() => nameRef.current?.focus(), 300);
    return () => window.clearTimeout(timer);
  }, [open]);

  const normalizedQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const allClients = Object.values(db.clients).map(ensureProspectIdentity);
  const filtered = terms.length ? allClients.filter((c) => {
    const date = c.tourDate || c.createdYmd || "";
    const dt = date ? new Date(`${date}T00:00:00`) : null;
    const monthName = dt && !Number.isNaN(dt.getTime()) ? MONTHS[dt.getMonth()] : "";
    const text = [
      clientDisplayName(c), c.name, c.name1, c.name2, c.occupation1, c.occupation2,
      c.contract, c.prospectCode, c.city, c.country, c.status, statusLabel(c.status),
      date, date ? longDate(date) : "", monthName, dt ? String(dt.getMonth() + 1) : "", dt ? String(dt.getFullYear()) : "",
    ].filter(Boolean).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return terms.every((term) => text.includes(term));
  }) : allClients;

  const sorted = filtered.sort((a, b) => {
    const da = a.tourDate || a.createdYmd || "";
    const db2 = b.tourDate || b.createdYmd || "";
    if (db2 !== da) return db2.localeCompare(da);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName("");
      setMissingName(false);
    }
  };

  const handleCreate = () => {
    if (!name.trim()) {
      setMissingName(true);
      toast.error("Falta el campo obligatorio: Nombre completo");
      nameRef.current?.focus();
      return;
    }
    const c = createEmptyClient(name.trim());
    saveClient(c);
    handleOpenChange(false);
    navigate(`/clients/${c.id}`);
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
                          if (await confirmDialog(`¿Eliminar a ${clientDisplayName(c)}?`)) deleteClient(c.id);
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
