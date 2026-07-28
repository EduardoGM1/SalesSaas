import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Topbar } from "@/components/layout/topbar.jsx";
import { AdminEmptyState, AdminPageState, AdminStatusBadge } from "@/components/admin/admin-ui.jsx";
import { workflowApi } from "@/lib/workflow-api.js";

const STAGE_LABELS = {
  representante: "Representante",
  survey: "Survey",
  worksheet: "Worksheet",
  proyeccion: "Proyección",
  revision_gerente: "Revisión Gerente",
  asignacion_cerrador: "Asignar Cerrador",
  money_box: "Money Box",
  tipo_cambio: "Tipo de Cambio",
  venta: "Venta",
};

export function WorkflowInboxPage() {
  const [state, setState] = useState({ loading: true, error: "", items: [] });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const items = await workflowApi.inbox();
      setState({ loading: false, error: "", items: Array.isArray(items) ? items : [] });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "No fue posible cargar la bandeja.", items: [] });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Topbar title="Workflow" subtitle="Expedientes y próximas acciones de la sala activa" />
      <main className="sales-page workflow-inbox-page">
        <header className="workflow-inbox-head">
          <div><span className="section-label">Bandeja operativa</span><h1>Flujo comercial</h1><p>La vista se adapta a tu puesto: Representante, Gerente o Cerrador.</p></div>
          <button type="button" className="btn btn-ghost" onClick={() => void load()}>Actualizar</button>
        </header>
        <AdminPageState loading={state.loading} error={state.error}>
          {!state.items.length ? (
            <AdminEmptyState icon={ClipboardCheck} title="No hay acciones pendientes" body="Los expedientes activos de tu sala aparecerán aquí." />
          ) : (
            <div className="workflow-inbox-grid">
              {state.items.map((workflow) => {
                const prospect = workflow.prospects || {};
                const name = prospect.name1 || prospect.name || prospect.prospect_code || "Expediente";
                return (
                  <article key={workflow.prospect_id} className="card workflow-inbox-card">
                    <div className="workflow-inbox-card-head">
                      <div><span>{prospect.prospect_code || "Sin folio"}</span><h2>{name}</h2></div>
                      <AdminStatusBadge tone={workflow.estado === "en_revision" ? "info" : "neutral"}>{STAGE_LABELS[workflow.etapa_actual] || workflow.etapa_actual}</AdminStatusBadge>
                    </div>
                    <div className="workflow-inbox-card-meta">
                      <span><strong>Representante</strong>{workflow.representante?.full_name || "—"}</span>
                      <span><strong>Cerrador</strong>{workflow.cerrador?.full_name || "Pendiente"}</span>
                      <span><strong>Actualización</strong>{workflow.updated_at ? new Date(workflow.updated_at).toLocaleString() : "—"}</span>
                    </div>
                    <Link className="btn btn-primary" to={`/clients/${workflow.prospect_id}`}>Abrir expediente <ArrowRight size={16} /></Link>
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
