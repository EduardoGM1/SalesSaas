import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, RotateCcw, Send, UserRoundCheck } from "lucide-react";
import { AdminStatusBadge } from "@/components/admin/admin-ui.jsx";
import { workflowApi } from "@/lib/workflow-api.js";
import { toast } from "@/lib/toast";

const STAGES = [
  ["representante", "Representante"],
  ["survey", "Survey"],
  ["worksheet", "Worksheet"],
  ["proyeccion", "Proyección"],
  ["revision_gerente", "Revisión Gerente"],
  ["asignacion_cerrador", "Asignar Cerrador"],
  ["money_box", "Money Box"],
  ["tipo_cambio", "Tipo de Cambio"],
  ["venta", "Venta"],
  ["completado", "Completado"],
];

const LABELS = Object.fromEntries(STAGES);

function responsibleName(state) {
  if (["money_box", "tipo_cambio", "venta", "completado"].includes(state?.etapa_actual)) {
    return state?.cerrador?.full_name || state?.cerrador?.email || "Cerrador pendiente";
  }
  if (["revision_gerente", "asignacion_cerrador"].includes(state?.etapa_actual)) {
    return state?.gerente?.full_name || state?.gerente?.email || "Gerente de sala";
  }
  return state?.representante?.full_name || state?.representante?.email || "Representante";
}

export function ProspectWorkflowPanel({ prospectId, enabled = true }) {
  const [payload, setPayload] = useState(null);
  const [peers, setPeers] = useState([]);
  const [closerId, setCloserId] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [pending, setPending] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!enabled || !prospectId) return;
    try {
      const data = await workflowApi.get(prospectId);
      setPayload(data);
      setHidden(false);
      setError("");
      if (data?.capabilities?.can_assign_closer) {
        const response = await fetch("/api/v1/workspace/peers", { credentials: "include" });
        const body = await response.json().catch(() => ({}));
        if (response.ok) setPeers(Array.isArray(body.data) ? body.data : []);
      }
    } catch (loadError) {
      if (
        [404, 409].includes(loadError?.status)
        || /prospect_workflows|schema cache|does not exist/i.test(loadError?.message || "")
      ) setHidden(true);
      else setError(loadError instanceof Error ? loadError.message : "No fue posible cargar el workflow.");
    }
  }, [enabled, prospectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work, message) => {
    setPending(true);
    setError("");
    try {
      await work();
      await load();
      toast.success(message);
    } catch (actionError) {
      const messageText = actionError instanceof Error ? actionError.message : "No fue posible avanzar.";
      setError(messageText);
      toast.error(messageText);
    } finally {
      setPending(false);
    }
  };

  const currentIndex = useMemo(
    () => STAGES.findIndex(([key]) => key === payload?.state?.etapa_actual),
    [payload?.state?.etapa_actual],
  );

  if (!enabled || hidden || (!payload && !error)) return null;
  const state = payload?.state;
  const capabilities = payload?.capabilities || {};

  return (
    <section className="card prospect-workflow-panel" aria-labelledby="workflow-title">
      <div className="prospect-workflow-head">
        <div>
          <span className="section-label">Flujo comercial</span>
          <h2 id="workflow-title">Etapa y responsables</h2>
          <p>Todo el proceso permanece dentro de este expediente.</p>
        </div>
        {state ? <AdminStatusBadge tone={state.estado === "completado" ? "success" : state.estado === "en_revision" ? "info" : "neutral"}>{state.estado?.replaceAll("_", " ")}</AdminStatusBadge> : null}
      </div>

      {error ? <div className="auth-error">{error}</div> : null}
      {state ? (
        <>
          <div className="prospect-workflow-progress" aria-label="Progreso del workflow">
            {STAGES.map(([key, label], index) => (
              <div key={key} className={`prospect-workflow-step${index < currentIndex ? " done" : ""}${index === currentIndex ? " active" : ""}`}>
                <span>{index < currentIndex ? <CheckCircle2 size={14} /> : index + 1}</span>
                <small>{label}</small>
              </div>
            ))}
          </div>

          <div className="prospect-workflow-current">
            <div><span>Etapa actual</span><strong>{LABELS[state.etapa_actual] || state.etapa_actual}</strong></div>
            <div><span>Responsable</span><strong>{responsibleName(state)}</strong></div>
            <div><span>Actualizado</span><strong>{state.updated_at ? new Date(state.updated_at).toLocaleString() : "—"}</strong></div>
          </div>

          <div className="prospect-workflow-actions">
            {capabilities.can_advance && state.etapa_actual !== "tipo_cambio" ? (
              <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void run(() => workflowApi.advance(prospectId), "Etapa completada")}>
                <ArrowRight size={16} /> Completar etapa
              </button>
            ) : null}
            {capabilities.can_advance && state.etapa_actual === "tipo_cambio" ? (
              <form onSubmit={(event) => {
                event.preventDefault();
                void run(() => workflowApi.advance(prospectId, { exchange_rate: { value: Number(exchangeRate), recorded_at: new Date().toISOString() } }), "Tipo de cambio registrado");
              }}>
                <input className="auth-input" type="number" min="0" step="0.0001" value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} placeholder="Tipo de cambio" required />
                <button className="btn btn-primary" disabled={pending}>Continuar a Venta</button>
              </form>
            ) : null}
            {capabilities.can_send_review ? (
              <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void run(() => workflowApi.sendReview(prospectId), "Enviado al gerente")}><Send size={16} /> Enviar al gerente</button>
            ) : null}
            {capabilities.can_review ? (
              <>
                <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void run(() => workflowApi.review(prospectId, "aprobar"), "Revisión aprobada")}><CheckCircle2 size={16} /> Aprobar</button>
                <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => void run(() => workflowApi.review(prospectId, "devolver"), "Expediente devuelto")}><RotateCcw size={16} /> Devolver</button>
              </>
            ) : null}
            {capabilities.can_assign_closer ? (
              <form onSubmit={(event) => {
                event.preventDefault();
                void run(() => workflowApi.assignCloser(prospectId, closerId), "Cerrador asignado");
              }}>
                <select className="auth-input" value={closerId} onChange={(event) => setCloserId(event.target.value)} required>
                  <option value="">Selecciona Cerrador</option>
                  {peers.map((peer) => <option key={peer.id} value={peer.id}>{peer.full_name || peer.email}</option>)}
                </select>
                <button className="btn btn-primary" disabled={pending}><UserRoundCheck size={16} /> Asignar</button>
              </form>
            ) : null}
          </div>

          <div className="prospect-workflow-timeline">
            <h3>Historial</h3>
            {(payload.timeline || []).slice(-8).reverse().map((event) => (
              <div key={event.id} className="prospect-workflow-event">
                <Clock3 size={14} />
                <div><strong>{LABELS[event.etapa_destino] || event.event_type?.replaceAll("_", " ")}</strong><span>{event.actor?.full_name || event.actor?.email || "Sistema"} · {new Date(event.created_at).toLocaleString()}</span></div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
