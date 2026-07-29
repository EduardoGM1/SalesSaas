import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, Clock3, MessageSquare, Store, UserRound, UserRoundCheck } from "lucide-react";
import { AdminStatusBadge } from "@/components/admin/admin-ui.jsx";
import { BuscadorUsuario } from "@/components/admin/buscador-usuario.jsx";
import { participantsApi } from "@/lib/participants-api.js";
import { toast } from "@/lib/toast";

const EVENT_LABELS = {
  workflow_iniciado: "Expediente iniciado",
  transferido: "Transferido a la sala",
  cerrador_asignado: "Cerrador asignado",
  cerrador_reasignado: "Cerrador reasignado",
  archivo_subido: "Archivo subido",
  archivo_eliminado: "Archivo eliminado",
};

function personName(profile, fallback) {
  return profile?.full_name || profile?.email || fallback;
}

/**
 * Participantes del expediente (sin pipeline).
 * Sala, Gerente, Vendedor y Cerrador colaboran sobre el mismo registro.
 */
export function ProspectParticipantsPanel({ prospectId, enabled = true }) {
  const navigate = useNavigate();
  const [payload, setPayload] = useState(null);
  const [selectedCloser, setSelectedCloser] = useState(null);
  const [pending, setPending] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!enabled || !prospectId) return;
    try {
      const data = await participantsApi.get(prospectId);
      setPayload(data);
      setHidden(false);
      setError("");
      if (data?.capabilities?.can_assign_closer || data?.capabilities?.can_reassign_closer) {
        if (data?.state?.cerrador) {
          setSelectedCloser({
            id: data.state.cerrador_id,
            full_name: data.state.cerrador.full_name || null,
            email: data.state.cerrador.email || null,
            avatar_url: data.state.cerrador.avatar_url || null,
          });
        } else {
          setSelectedCloser(null);
        }
      }
    } catch (loadError) {
      if (
        [404, 409].includes(loadError?.status)
        || /prospect_workflows|schema cache|does not exist/i.test(loadError?.message || "")
      ) setHidden(true);
      else setError(loadError instanceof Error ? loadError.message : "No fue posible cargar participantes.");
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
      const messageText = actionError instanceof Error ? actionError.message : "No fue posible completar la acción.";
      setError(messageText);
      toast.error(messageText);
    } finally {
      setPending(false);
    }
  };

  if (!enabled || hidden || (!payload && !error)) return null;
  const state = payload?.state;
  const capabilities = payload?.capabilities || {};
  const context = payload?.context || {};

  const participantes = state
    ? [
      {
        key: "sala",
        icon: <Store size={15} aria-hidden />,
        label: "Sala",
        value: context.sala_nombre || "—",
        detail: context.empresa_nombre || null,
      },
      {
        key: "gerente",
        icon: <BadgeCheck size={15} aria-hidden />,
        label: "Gerente",
        value: personName(state.gerente, "Sin gerente"),
      },
      {
        key: "vendedor",
        icon: <UserRound size={15} aria-hidden />,
        label: "Vendedor",
        value: personName(state.representante, "Sin vendedor"),
      },
      {
        key: "cerrador",
        icon: <UserRoundCheck size={15} aria-hidden />,
        label: "Cerrador",
        value: personName(state.cerrador, "Sin asignar"),
      },
    ]
    : [];

  return (
    <section className="card prospect-workflow-panel" aria-labelledby="participants-title">
      <div className="prospect-workflow-head">
        <div>
          <span className="section-label">Colaboración</span>
          <h2 id="participants-title">Participantes</h2>
          <p>Las 3 partes trabajan sobre el mismo expediente, sin traspasos.</p>
        </div>
        {state ? (
          <AdminStatusBadge tone={state.estado === "completado" ? "success" : "neutral"}>
            {state.estado === "completado" ? "Completado" : state.estado === "cancelado" ? "Cancelado" : "Activo"}
          </AdminStatusBadge>
        ) : null}
      </div>

      {error ? <div className="auth-error">{error}</div> : null}
      {state ? (
        <>
          <div className="prospect-workflow-participants" aria-label="Participantes del expediente">
            <div className="prospect-workflow-participants-grid">
              {participantes.map((item) => (
                <div key={item.key} className="prospect-workflow-participant">
                  {item.icon}
                  <div>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    {item.detail ? <small>{item.detail}</small> : null}
                  </div>
                </div>
              ))}
            </div>
            {capabilities.can_assign_closer || capabilities.can_reassign_closer ? (
              <form
                className="prospect-workflow-assign"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!selectedCloser?.id) return;
                  void run(
                    () => participantsApi.assignCloser(prospectId, selectedCloser.id),
                    capabilities.can_reassign_closer ? "Cerrador reasignado" : "Cerrador asignado",
                  );
                }}
              >
                <BuscadorUsuario
                  searchPath="workspace/closers/search"
                  value={selectedCloser}
                  onChange={setSelectedCloser}
                  placeholder={capabilities.can_reassign_closer ? "Buscar Cerrador por nombre o correo" : "Selecciona Cerrador por nombre o correo"}
                  disabled={pending}
                  inputId={`closer-search-${prospectId}`}
                />
                <button className="btn btn-primary" disabled={pending || !selectedCloser?.id}>
                  <UserRoundCheck size={16} />
                  {capabilities.can_reassign_closer ? "Reasignar Cerrador" : "Asignar Cerrador"}
                </button>
              </form>
            ) : null}
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pending}
                onClick={() => {
                  void (async () => {
                    setPending(true);
                    try {
                      const conv = await participantsApi.openChat(prospectId);
                      if (conv?.id) navigate(`/messages?scope=team&conversation=${conv.id}`);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "No se pudo abrir el chat.");
                    } finally {
                      setPending(false);
                    }
                  })();
                }}
              >
                <MessageSquare size={15} /> Abrir chat del expediente
              </button>
            </div>
          </div>

          <div className="prospect-workflow-timeline">
            <h3>Historial</h3>
            {(payload.timeline || []).slice(-10).reverse().map((event) => (
              <div key={event.id} className="prospect-workflow-event">
                <Clock3 size={14} />
                <div>
                  <strong>
                    {EVENT_LABELS[event.event_type]
                      || event.event_type?.replaceAll("_", " ")
                      || "Evento"}
                    {event.event_type === "transferido" && event.metadata?.destino_sala
                      ? ` ${event.metadata.destino_sala}`
                      : ""}
                    {event.event_type === "archivo_subido" && event.metadata?.nombre
                      ? `: ${event.metadata.nombre}`
                      : ""}
                  </strong>
                  <span>
                    {event.actor?.full_name || event.actor?.email || "Sistema"}
                    {" · "}
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
            {!payload.timeline?.length ? (
              <p className="admin-cell-muted" style={{ margin: 0, fontSize: 13 }}>Sin eventos todavía.</p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

/** @deprecated Alias de compatibilidad */
export const ProspectWorkflowPanel = ProspectParticipantsPanel;
