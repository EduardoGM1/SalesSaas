import { AdminStatusBadge } from "@/components/admin/admin-ui.jsx";
import { ModuleChecklist } from "@/components/admin/module-checklist.jsx";
import { PermissionMatrix } from "@/components/admin/permission-matrix.jsx";
import { SalesModal } from "@/components/ui/sales-modal";

/**
 * Modal amplio para editar un puesto: nombre, módulos y vista de acciones base.
 */
export function RoleEditorModal({
  open,
  role,
  form,
  onFormChange,
  onClose,
  onSave,
  pending = false,
  flags = [],
  permissions = [],
}) {
  if (!role) return null;

  const scopeLabel = role.scope === "empresa" ? "Administración de empresa" : "Puesto de sala";
  const moduleCount = form.flag_keys?.length ?? 0;
  const actionCount = role.permission_keys?.length ?? 0;

  return (
    <SalesModal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose?.();
      }}
      title={`Editar puesto · ${role.nombre}`}
      sub="Ajusta el nombre visible y los módulos. Las acciones base son solo referencia en esta fase."
      maxWidth={860}
      modalClassName="role-editor-modal modal-wide"
    >
      <form
        className="role-editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave?.();
        }}
      >
        <div className="role-editor-meta">
          {role.es_sistema ? (
            <AdminStatusBadge tone="info">Sistema · {role.slug}</AdminStatusBadge>
          ) : (
            <AdminStatusBadge tone="neutral">{scopeLabel}</AdminStatusBadge>
          )}
          <AdminStatusBadge tone="info">{moduleCount} módulos seleccionados</AdminStatusBadge>
          {actionCount > 0 ? (
            <AdminStatusBadge tone="neutral">{actionCount} acciones base</AdminStatusBadge>
          ) : null}
        </div>

        <label className="role-editor-field">
          <span className="section-label">Nombre del puesto</span>
          <input
            className="auth-input"
            placeholder="Ej. Liner, Cerrador o Recepción"
            value={form.nombre}
            onChange={(event) => onFormChange((current) => ({ ...current, nombre: event.target.value }))}
            required
            autoFocus
          />
        </label>

        <div className="role-editor-columns">
          <section className="role-editor-panel">
            <header className="role-editor-panel-head">
              <h3>Módulos</h3>
              <p>Define qué herramientas y pantallas ve quien tenga este puesto.</p>
            </header>
            <ModuleChecklist
              flags={flags}
              value={form.flag_keys}
              idPrefix="role-edit"
              className="role-editor-checklist"
              onChange={(flag_keys) => onFormChange((current) => ({ ...current, flag_keys }))}
            />
          </section>

          <section className="role-editor-panel role-editor-panel--readonly">
            <header className="role-editor-panel-head">
              <h3>Acciones (permisos)</h3>
              <p>
                Acciones base del puesto. La edición desde aquí llegará en una fase posterior;
                los asistentes reciben acciones adicionales en Administradores → Delegar permisos.
              </p>
            </header>
            <div className="role-editor-permissions">
              <PermissionMatrix
                permisos={permissions}
                value={role.permission_keys || []}
                readOnly
                emptyLabel="Sin acciones base en este puesto."
              />
            </div>
          </section>
        </div>

        <div className="btn-row role-editor-actions">
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </SalesModal>
  );
}
