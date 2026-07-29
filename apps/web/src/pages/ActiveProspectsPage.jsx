import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FolderOpen } from "lucide-react";
import { Topbar } from "@/components/layout/topbar.jsx";
import { AdminEmptyState, AdminPageState, AdminStatusBadge } from "@/components/admin/admin-ui.jsx";
import { participantsApi } from "@/lib/participants-api.js";
import { useWorkspace } from "@/hooks/use-workspace.js";

/**
 * Mis expedientes activos (sin pipeline/etapas).
 * Gerente: sala completa · Vendedor/Cerrador: asignados.
 */
export function ActiveProspectsPage() {
  const { active } = useWorkspace();
  const [state, setState] = useState({ loading: true, error: "", items: [] });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const items = await participantsApi.active();
      setState({ loading: false, error: "", items: Array.isArray(items) ? items : [] });
    } catch (error) {
      setState({
        loading: false,
        error: error instanceof Error ? error.message : "No fue posible cargar los expedientes.",
        items: [],
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Topbar
        title="Mis expedientes"
        subtitle={active?.nombre
          ? `Expedientes activos de ${active.nombre}`
          : "Expedientes de tu sala activos"}
      />
      <main className="sales-page workflow-inbox-page">
        <header className="workflow-inbox-head">
          <div>
            <span className="section-label">Sala activa</span>
            <h1>Mis expedientes</h1>
            <p>Mismo registro compartido entre Vendedor, Gerente y Cerrador — sin etapas.</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => void load()}>Actualizar</button>
        </header>
        <AdminPageState loading={state.loading} error={state.error}>
          {!state.items.length ? (
            <AdminEmptyState
              icon={FolderOpen}
              title="Sin expedientes activos"
              body="Cuando se creen o te asignen expedientes en esta sala, aparecerán aquí."
            />
          ) : (
            <div className="workflow-inbox-grid">
              {state.items.map((row) => {
                const prospect = row.prospects || {};
                const name = prospect.name1 || prospect.name || prospect.prospect_code || "Expediente";
                return (
                  <article key={row.prospect_id} className="card workflow-inbox-card">
                    <div className="workflow-inbox-card-head">
                      <div>
                        <span>{prospect.prospect_code || "Sin folio"}</span>
                        <h2>{name}</h2>
                      </div>
                      <AdminStatusBadge tone={row.estado === "completado" ? "success" : "neutral"}>
                        {row.estado === "completado" ? "Completado" : "Activo"}
                      </AdminStatusBadge>
                    </div>
                    <div className="workflow-inbox-card-meta">
                      <span><strong>Vendedor</strong>{row.representante?.full_name || "—"}</span>
                      <span><strong>Cerrador</strong>{row.cerrador?.full_name || "Sin asignar"}</span>
                      <span>
                        <strong>Actualizado</strong>
                        {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                      </span>
                    </div>
                    <Link className="btn btn-primary" to={`/clients/${row.prospect_id}`}>
                      Abrir expediente <ArrowRight size={16} />
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </AdminPageState>
      </main>
    </>
  );
}
