import { useEffect, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { formatCollaborationIdInput } from "@/lib/format/collaboration-id-input.js";

const GROUPS = [
  {
    id: "gerente",
    title: "Gerente",
    users: [
      { key: "gerente_id", alias: "gerente", label: "Gerente", keepExisting: true },
      { key: "hostes_id", alias: "hostes", label: "Hostes" },
      { key: "filtro_id", alias: "filtro", label: "Filtro" },
    ],
  },
  {
    id: "inhouse",
    title: "In House",
    users: [
      { key: "opc_id", alias: "opc", label: "OPC" },
      { key: "liner_id", alias: "liner", label: "Liner" },
      { key: "ftb_id", alias: "ftb", label: "FTB" },
      { key: "inhouse_closer1_id", alias: "inhouse_closer1", label: "Closer 1" },
      { key: "inhouse_closer2_id", alias: "inhouse_closer2", label: "Closer 2" },
      { key: "imagen_id", alias: "imagen", label: "Imagen" },
    ],
  },
  {
    id: "members",
    title: "Members",
    users: [
      { key: "self_gen_id", alias: "self_gen", label: "Self-Gen" },
      { key: "members_closer1_id", alias: "members_closer1", label: "Closer 1" },
      { key: "members_closer2_id", alias: "members_closer2", label: "Closer 2" },
    ],
  },
  {
    id: "vendedor",
    title: "Vendedor",
    users: [
      { key: "representante_id", alias: "representante", label: "Vendedor", legacy: true },
    ],
    texts: [
      { key: "contrato", label: "Contrato" },
      { key: "vlo", label: "VLO" },
    ],
  },
  {
    id: "resultado",
    title: "Resultado",
    catalogs: [
      { key: "calificacion_final", label: "Calificación Final" },
      { key: "estatus_tour", label: "Estatus tour" },
      { key: "estatus_venta", label: "Estatus venta" },
    ],
    texts: [
      { key: "resultado_prospect_id", label: "Prospect ID" },
    ],
  },
];

function personName(profile) {
  return profile?.full_name || profile?.email || "";
}

/**
 * Seis grupos de colaboración. Cada campo es su propia columna.
 * Cerrador es solo la tarjeta: la asignación sigue en assignCloser.
 * Los catálogos de resultado quedan vacíos hasta que Mich defina los valores.
 */
export function ProspectCollaborationGroups({
  state,
  canEdit = false,
  pending = false,
  vendedorCaps = {},
  cerrador = null,
  onAssignUser,
  onClearUser,
  onSaveTexts,
}) {
  const [texts, setTexts] = useState({
    contrato: "",
    vlo: "",
    resultado_prospect_id: "",
  });

  useEffect(() => {
    setTexts({
      contrato: state?.contrato || "",
      vlo: state?.vlo || "",
      resultado_prospect_id: state?.resultado_prospect_id || "",
    });
  }, [state?.contrato, state?.vlo, state?.resultado_prospect_id]);

  const dirty = texts.contrato !== (state?.contrato || "")
    || texts.vlo !== (state?.vlo || "")
    || texts.resultado_prospect_id !== (state?.resultado_prospect_id || "");

  return (
    <>
    <div className="prospect-collab-groups">
      {GROUPS.map((group) => (
        <section key={group.id} className="prospect-collab-group" aria-label={group.title}>
          <h3>{group.title}</h3>
          <div className="prospect-workflow-participants-grid">
            {(group.users || []).map((field) => {
              const profile = state?.[field.alias];
              const assignedId = state?.[field.key];
              const assigned = Boolean(assignedId);
              const name = personName(profile) || "Sin asignar";
              const canAssign = field.legacy
                ? (assigned ? vendedorCaps.canReassign : vendedorCaps.canAssign)
                : canEdit;
              const canClear = canEdit && assigned && !field.legacy && !(field.keepExisting && assigned);
              return (
                <div key={field.key} className="prospect-workflow-participant">
                  <div className="prospect-workflow-participant-body">
                    <div className="prospect-workflow-participant-head">
                      <span>{field.label}</span>
                      {canAssign && assigned ? (
                        <button
                          type="button"
                          className="prospect-workflow-participant-edit"
                          aria-label={`Editar ${field.label}`}
                          disabled={pending}
                          onClick={() => onAssignUser?.(field, true)}
                        >
                          <Pencil size={13} />
                        </button>
                      ) : null}
                    </div>
                    {canAssign && !assigned ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm prospect-workflow-participant-assign"
                        disabled={pending}
                        onClick={() => onAssignUser?.(field, false)}
                      >
                        <Plus size={14} aria-hidden />
                        Asignar {field.label}
                      </button>
                    ) : (
                      <strong title={name}>{name}</strong>
                    )}
                    {canClear ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm prospect-collab-clear"
                        disabled={pending}
                        onClick={() => onClearUser?.(field)}
                      >
                        <X size={13} aria-hidden /> Quitar
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {(group.catalogs || []).map((field) => (
              <label key={field.key} className="prospect-workflow-participant prospect-collab-field">
                <span>{field.label}</span>
                <select className="auth-input" disabled value="" aria-disabled="true">
                  <option value="">Pendiente de catálogo</option>
                </select>
              </label>
            ))}
            {(group.texts || []).map((field) => (
              <label key={field.key} className="prospect-workflow-participant prospect-collab-field">
                <span>{field.label}</span>
                <input
                  className="auth-input"
                  value={texts[field.key] || ""}
                  disabled={!canEdit || pending}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={40}
                  onChange={(event) => {
                    const next = formatCollaborationIdInput(event.target.value);
                    setTexts((prev) => ({ ...prev, [field.key]: next }));
                  }}
                />
              </label>
            ))}
          </div>
        </section>
      ))}
      <section className="prospect-collab-group" aria-label="Cerrador">
        <h3>Cerrador</h3>
        <div className="prospect-workflow-participants-grid">
          <div className="prospect-workflow-participant">
            <div className="prospect-workflow-participant-body">
              <div className="prospect-workflow-participant-head">
                <span>Cerrador</span>
                {cerrador?.canReassign && cerrador?.assigned ? (
                  <button
                    type="button"
                    className="prospect-workflow-participant-edit"
                    aria-label="Editar Cerrador"
                    disabled={pending}
                    onClick={() => cerrador.onReassign?.()}
                  >
                    <Pencil size={13} />
                  </button>
                ) : null}
              </div>
              {cerrador?.canAssign && !cerrador?.assigned ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm prospect-workflow-participant-assign"
                  disabled={pending}
                  onClick={() => cerrador.onAssign?.()}
                >
                  <Plus size={14} aria-hidden />
                  Asignar Cerrador
                </button>
              ) : (
                <strong title={cerrador?.name || "Sin asignar"}>{cerrador?.name || "Sin asignar"}</strong>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
    {canEdit ? (
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending || !dirty}
          onClick={() => onSaveTexts?.(texts)}
        >
          Guardar Contrato, VLO y Prospect ID
        </button>
      </div>
    ) : null}
    </>
  );
}
