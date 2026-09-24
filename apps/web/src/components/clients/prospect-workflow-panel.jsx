import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock3, MessageSquare, Pencil, Plus } from "lucide-react";
import { AdminStatusBadge } from "@/components/admin/admin-ui.jsx";
import { ProspectCollaborationGroups } from "@/components/clients/prospect-collaboration-groups.jsx";
import { ProspectParticipantAssignModal } from "@/components/clients/prospect-participant-assign-modal.jsx";
import { CollapsibleSection } from "@/components/ui/collapsible-section.jsx";
import { participantsApi } from "@/lib/participants-api.js";
import { toast } from "@/lib/toast";

const EVENT_LABELS = {
  workflow_iniciado: "Expediente iniciado",
  transferido: "Transferido a la sala",
  cerrador_asignado: "Cerrador asignado",
  cerrador_reasignado: "Cerrador reasignado",
  vendedor_asignado: "Vendedor asignado",
  vendedor_reasignado: "Vendedor reasignado",
};

function personName(profile, fallback) {
  return profile?.full_name || profile?.email || fallback;
}

/**
 * Participantes del expediente (sin pipeline).
 * Gerente, Vendedor y Cerrador colaboran sobre el mismo registro.
 */
export function ProspectParticipantsPanel({ prospectId, enabled = true, onCapabilities }) {
  const navigate = useNavigate();
  const [payload, setPayload] = useState(null);
  const [pending, setPending] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [assignModal, setAssignModal] = useState(null);

  const load = useCallback(async (signal) => {
    if (!enabled || !prospectId) return;
    try {
      const data = await participantsApi.get(prospectId);
      if (signal?.aborted) return;
      setPayload(data);
      onCapabilities?.(data?.capabilities ?? null);
      setHidden(false);
      setError("");
    } catch (loadError) {
      if (signal?.aborted) return;
      if (
        [404, 409].includes(loadError?.status)
        || /prospect_workflows|schema cache|does not exist/i.test(loadError?.message || "")
      ) setHidden(true);
      else setError(loadError instanceof Error ? loadError.message : "No fue posible cargar participantes.");
    }
  }, [enabled, prospectId, onCapabilities]);

  useEffect(() => {
    const controller = { aborted: false };
    void load(controller);
    return () => { controller.aborted = true; };
  }, [load]);

  const run = async (work, message) => {
    setPending(true);
    setError("");
    try {
      await work();
      await load();
      setAssignModal(null);
      toast.success(message);
    } catch (actionError) {
      const messageText = actionError instanceof Error ? actionError.message : "No fue posible completar la acción.";
      setError(messageText);
      toast.error(messageText);
    } finally {
      setPending(false);
    }
  };

  const state = payload?.state;
  const capabilities = payload?.capabilities || {};

  const cerradorCard = useMemo(() => {
    if (!state) return null;
    return {
      key: "cerrador",
      label: "Cerrador",
      profile: state.cerrador,
      canAssign: capabilities.can_assign_closer,
      canReassign: capabilities.can_reassign_closer,
      searchPath: "workspace/closers/search",
      save: (userId) => participantsApi.assignCloser(prospectId, userId),
      assignSuccess: "Cerrador asignado",
      reassignSuccess: "Cerrador reasignado",
    };
  }, [state, capabilities, prospectId]);

  const openAssignModal = (card, reassign) => {
    setAssignModal({
      roleKey: card.key,
      roleLabel: card.label,
      searchPath: card.searchPath,
      currentProfile: card.profile,
      isReassign: reassign,
      onSave: (userId) => run(
        () => card.save(userId),
        reassign ? card.reassignSuccess : card.assignSuccess,
      ),
    });
  };

  if (!enabled || hidden || (!payload && !error)) return null;

  return (
    <CollapsibleSection
      id="prospect-collaboration"
      defaultOpen={false}
      className="card prospect-workflow-panel exp-collapsible-card"
      title={(
        <div className="prospect-workflow-collab-head">
          <span className="section-label">Colaboración</span>
          {state ? (
            <AdminStatusBadge tone={state.estado === "completado" ? "success" : "neutral"}>
              {state.estado === "completado" ? "Completado" : state.estado === "cancelado" ? "Cancelado" : "Activo"}
            </AdminStatusBadge>
          ) : null}
        </div>
      )}
      bodyClassName="prospect-workflow-collab-body"
    >
      {error ? <div className="auth-error">{error}</div> : null}
      {state ? (
        <>
          <div className="prospect-workflow-participants" aria-label="Participantes del expediente">
            <ProspectCollaborationGroups
              state={state}
              canEdit={Boolean(capabilities.can_edit)}
              pending={pending}
              vendedorCaps={{
                canAssign: capabilities.can_assign_representante,
                canReassign: capabilities.can_reassign_representante,
              }}
              onAssignUser={(field, reassign) => {
                if (field.legacy) {
                  openAssignModal({
                    key: "vendedor",
                    label: "Vendedor",
                    profile: state.representante,
                    searchPath: "workspace/representantes/search",
                    save: (userId) => participantsApi.assignRepresentante(prospectId, userId),
                    assignSuccess: "Vendedor asignado",
                    reassignSuccess: "Vendedor reasignado",
                  }, reassign);
                  return;
                }
                openAssignModal({
                  key: field.key,
                  label: field.label,
                  profile: state[field.alias],
                  searchPath: "workspace/members/search",
                  save: (userId) => participantsApi.saveCollaboration(prospectId, { [field.key]: userId }),
                  assignSuccess: `${field.label} asignado`,
                  reassignSuccess: `${field.label} reasignado`,
                }, reassign);
              }}
              onClearUser={(field) => run(
                () => participantsApi.saveCollaboration(prospectId, { [field.key]: null }),
                `${field.label} quitado`,
              )}
              onSaveTexts={(texts) => run(
                () => participantsApi.saveCollaboration(prospectId, texts),
                "Colaboración guardada",
              )}
            />
            <div className="btn-row" style={{ marginTop: 8 }}>
              {cerradorCard?.canAssign && !state.cerrador_id ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => openAssignModal(cerradorCard, false)}
                >
                  <Plus size={14} aria-hidden /> Asignar Cerrador
                </button>
              ) : null}
              {cerradorCard?.canReassign && state.cerrador_id ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => openAssignModal(cerradorCard, true)}
                >
                  <Pencil size={14} aria-hidden /> Asignar Cerrador
                </button>
              ) : null}
              {state.cerrador ? (
                <span className="prospect-collab-cerrador-name">{personName(state.cerrador, "Sin asignar")}</span>
              ) : null}
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

      <ProspectParticipantAssignModal
        open={Boolean(assignModal)}
        onOpenChange={(open) => { if (!open) setAssignModal(null); }}
        roleKey={assignModal?.roleKey}
        roleLabel={assignModal?.roleLabel}
        searchPath={assignModal?.searchPath}
        currentProfile={assignModal?.currentProfile}
        isReassign={assignModal?.isReassign}
        pending={pending}
        onSave={(userId) => assignModal?.onSave?.(userId)}
      />
    </CollapsibleSection>
  );
}
