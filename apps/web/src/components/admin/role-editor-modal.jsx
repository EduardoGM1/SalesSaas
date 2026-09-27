import { AdminStatusBadge } from "@/components/admin/admin-ui.jsx";
import { ModuleChecklist } from "@/components/admin/module-checklist.jsx";
import { PermissionMatrix } from "@/components/admin/permission-matrix.jsx";
import { RolePermissionsReadonly } from "@/components/admin/role-permissions-readonly.jsx";
import { SalesModal } from "@/components/ui/sales-modal";

/** Fase 2: pasar true para habilitar matriz editable en puestos custom. */
const ENABLE_CUSTOM_ROLE_PERMISSION_EDIT = false;

/**
 * Modal amplio para editar un puesto: nombre, módulos y acciones (lectura o edición).
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
  const showEditablePermissions = ENABLE_CUSTOM_ROLE_PERMISSION_EDIT && !role.es_sistema;

  return (
    <SalesModal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose?.();
      }}
      title={`Editar puesto · ${role.nombre}`}
      sub="Ajusta el nombre visible y los módulos del puesto."
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

          <section className="role-editor-panel role-editor-panel--permissions">
            <header className="role-editor-panel-head">
              <h3>Acciones (permisos)</h3>
              {!showEditablePermissions ? (
                <p>Referencia de lo que puede hacer hoy quien tenga este puesto.</p>
              ) : (
                <p>Marca las acciones permitidas. Las de herramientas dependen de los módulos activos.</p>
              )}
            </header>
            {showEditablePermissions ? (
              <div className="role-editor-permissions">
                <PermissionMatrix
                  permisos={permissions}
                  value={role.permission_keys || []}
                  onChange={() => {}}
                  emptyLabel="Sin acciones en este puesto."
                />
              </div>
            ) : (
              <RolePermissionsReadonly
                roleName={role.nombre}
                variant={role.es_sistema ? "system" : "custom"}
                permissionKeys={role.permission_keys}
                permisos={permissions}
              />
            )}
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
