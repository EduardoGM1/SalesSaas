import { useEffect, useState } from "react";
import { SalesModal } from "@/components/ui/sales-modal";
import { BuscadorUsuario } from "@/components/admin/buscador-usuario.jsx";

function profileToUser(profile) {
  if (!profile?.id) return null;
  return {
    id: profile.id,
    full_name: profile.full_name || null,
    email: profile.email || null,
    avatar_url: profile.avatar_url || null,
  };
}

function personLabel(profile) {
  return profile?.full_name || profile?.email || "—";
}

/**
 * Modal unificado para asignar o reasignar Vendedor / Cerrador en un expediente.
 */
export function ProspectParticipantAssignModal({
  open,
  onOpenChange,
  roleKey,
  roleLabel,
  searchPath,
  currentProfile,
  isReassign = false,
  pending = false,
  onSave,
}) {
  const [selected, setSelected] = useState(null);
  const safeLabel = String(roleLabel || "").trim() || "participante";
  const labelLower = safeLabel.toLowerCase();

  useEffect(() => {
    if (!open) {
      setSelected(null);
      return;
    }
    setSelected(profileToUser(currentProfile));
  }, [open, currentProfile]);

  if (!open || !roleLabel || !searchPath) return null;

  const title = isReassign ? `Reasignar ${safeLabel}` : `Asignar ${safeLabel}`;
  const actionLabel = isReassign ? "Guardar cambio" : "Guardar";

  return (
    <SalesModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      sub={
        isReassign && currentProfile
          ? `Actualmente: ${personLabel(currentProfile)} — busca un reemplazo:`
          : `Selecciona un miembro de la sala para el rol de ${labelLower}.`
      }
      maxWidth={520}
    >
      <form
        className="prospect-participant-assign-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!selected?.id || pending) return;
          onSave?.(selected.id);
        }}
      >
        <BuscadorUsuario
          searchPath={searchPath}
          value={selected}
          onChange={setSelected}
          placeholder={`Buscar ${labelLower} por nombre o correo`}
          disabled={pending}
          inputId={`participant-assign-${roleKey || "role"}`}
        />
        <div className="btn-row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending || !selected?.id}>
            {actionLabel}
          </button>
        </div>
      </form>
    </SalesModal>
  );
}
