import { useMemo, useState } from "react";
import { AdminStatusBadge } from "@/components/admin/admin-ui.jsx";
import { formatModuloLabel, groupPermissionsByModulo, permisosForKeys } from "@/lib/admin/permission-groups.js";

const PREVIEW_PER_GROUP = 3;

/**
 * Resumen de acciones sin checkboxes (Fase 1).
 * Fase 2: sustituir por PermissionMatrix editable en puestos custom.
 */
export function RolePermissionsReadonly({
  roleName,
  variant = "system",
  permissionKeys = [],
  permisos = [],
}) {
  const [expanded, setExpanded] = useState(false);
  const keys = Array.isArray(permissionKeys) ? permissionKeys : [];
  const groups = useMemo(() => {
    const resolved = permisosForKeys(permisos, keys);
    return groupPermissionsByModulo(resolved, { capa: "app" });
  }, [permisos, keys]);

  const total = keys.length;

  if (total === 0) {
    return (
      <div className="role-permissions-readonly role-permissions-readonly--empty">
        <p className="team-hint">Sin acciones base en este puesto.</p>
      </div>
    );
  }

  const isSystem = variant === "system";

  return (
    <div className="role-permissions-readonly">
      <div className="role-permissions-readonly-callout" role="note">
        <AdminStatusBadge tone="neutral">Solo lectura</AdminStatusBadge>
        {isSystem ? (
          <p>
            <strong>Permisos base del producto.</strong>
            {" "}
            Estas acciones vienen con el puesto
            {" "}
            <strong>{roleName}</strong>
            .
            {" "}
            Para un asistente con permisos extra, ve a
            {" "}
            <strong>Administradores → Delegar permisos</strong>
            .
          </p>
        ) : (
          <p>
            <strong>Acciones actuales del puesto.</strong>
            {" "}
            La edición desde este modal llegará en la siguiente fase; los módulos sí se guardan aquí.
          </p>
        )}
      </div>

      {!expanded ? (
        <div className="role-permissions-readonly-preview">
          {groups.slice(0, 4).map((group) => (
            <div key={group.modulo} className="role-permissions-readonly-group">
              <span className="role-permissions-readonly-modulo">{group.label}</span>
              <ul>
                {group.items.slice(0, PREVIEW_PER_GROUP).map((item) => (
                  <li key={item.clave}>{item.nombre_visible || item.clave}</li>
                ))}
                {group.items.length > PREVIEW_PER_GROUP ? (
                  <li className="role-permissions-readonly-more">
                    +{group.items.length - PREVIEW_PER_GROUP} más en
                    {" "}
                    {formatModuloLabel(group.modulo).toLowerCase()}
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
          {groups.length > 4 ? (
            <p className="admin-card-muted">… y {groups.length - 4} categorías más</p>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm role-permissions-readonly-expand"
            onClick={() => setExpanded(true)}
          >
            Ver las {total} acciones
          </button>
        </div>
      ) : (
        <div className="role-permissions-readonly-full">
          {groups.map((group) => (
            <section key={group.modulo} className="role-permissions-readonly-group">
              <h4 className="role-permissions-readonly-modulo">{group.label}</h4>
              <ul>
                {group.items.map((item) => (
                  <li key={item.clave}>{item.nombre_visible || item.clave}</li>
                ))}
              </ul>
            </section>
          ))}
          <button
            type="button"
            className="btn btn-ghost btn-sm role-permissions-readonly-expand"
            onClick={() => setExpanded(false)}
          >
            Ocultar detalle
          </button>
        </div>
      )}
    </div>
  );
}
