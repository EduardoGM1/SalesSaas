import { useState } from "react";
import { dropDisallowedToolPerms } from "@salesapp/shared/auth/permission-catalog.js";
import { snapshotFromLibraryTemplate } from "@/lib/admin/paquete-template-kind.js";

/**
 * Copia inicial desde una plantilla de biblioteca. No enlaza el puesto al paquete.
 */
export function ApplyRoleTemplate({
  templates = [],
  roles = [],
  mode = "create",
  hasExisting = false,
  onApply,
}) {
  const [selectedId, setSelectedId] = useState("");

  const apply = () => {
    const pack = templates.find((item) => item.id === selectedId);
    if (!pack) return;
    if (mode === "edit" && hasExisting) {
      const ok = window.confirm(
        "Este puesto ya tiene módulos o acciones. Aplicar la plantilla los reemplaza en el formulario. La plantilla y los demás puestos no cambian. ¿Continuar?",
      );
      if (!ok) return;
    }
    const snapshot = snapshotFromLibraryTemplate(pack, roles);
    onApply?.({
      flag_keys: snapshot.flag_keys,
      permission_keys: [...dropDisallowedToolPerms(snapshot.flag_keys, snapshot.permission_keys)],
    });
  };

  if (!templates.length) return null;

  return (
    <div className="role-template-apply">
      <div className="section-label">Empezar desde plantilla (opcional)</div>
      <p className="role-template-apply-copy">
        {mode === "edit"
          ? "Sustituye los módulos y las acciones base por una copia de la plantilla. No afecta la plantilla ni otros puestos. Después puedes ajustar este puesto: no queda enlazado."
          : "Aplicar copia los módulos de la plantilla y las acciones del puesto de sistema equivalente (por ejemplo, Liner). Es un punto de partida editable, no un enlace permanente."}
      </p>
      <div className="role-template-apply-row">
        <select
          className="auth-input"
          aria-label="Plantilla de módulos"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">Elegir plantilla…</option>
          {templates.map((pack) => (
            <option key={pack.id} value={pack.id}>{pack.nombre}</option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost" disabled={!selectedId} onClick={apply}>
          Aplicar
        </button>
      </div>
    </div>
  );
}
