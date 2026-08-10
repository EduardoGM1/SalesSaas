import { useMemo } from "react";
import { groupPermissionsByModulo, permisosForKeys } from "@/lib/admin/permission-groups.js";

/**
 * Matriz de acciones (permisos) agrupada por módulo.
 * Reutilizada en editor de Puestos y delegación de Asistentes.
 */
export function PermissionMatrix({
  permisos = [],
  value = [],
  ceiling = null,
  onChange,
  readOnly = false,
  loading = false,
  emptyLabel = "No hay acciones disponibles.",
  showClaveHint = false,
}) {
  const selected = useMemo(() => new Set(Array.isArray(value) ? value : []), [value]);

  const groups = useMemo(() => {
    const ceilingKeys = Array.isArray(ceiling) ? ceiling : null;
    const source = ceilingKeys
      ? permisosForKeys(permisos, ceilingKeys)
      : (permisos || []);
    return groupPermissionsByModulo(source, { ceilingKeys, capa: "app" });
  }, [permisos, ceiling]);

  const toggle = (clave) => {
    if (readOnly || !onChange) return;
    const next = new Set(selected);
    if (next.has(clave)) next.delete(clave);
    else next.add(clave);
    onChange([...next]);
  };

  if (loading) {
    return <p className="team-hint permission-matrix-empty">Cargando acciones…</p>;
  }

  if (!groups.length) {
    return <p className="team-empty permission-matrix-empty">{emptyLabel}</p>;
  }

  return (
    <div className="permission-matrix">
      {groups.map((group) => (
        <section key={group.modulo} className="permission-matrix-group">
          <h4 className="permission-matrix-modulo">{group.label}</h4>
          <ul className="permission-matrix-list">
            {group.items.map((perm) => (
              <li key={perm.clave}>
                <label className="permission-matrix-item">
                  <input
                    type="checkbox"
                    checked={selected.has(perm.clave)}
                    disabled={readOnly || !onChange}
                    onChange={() => toggle(perm.clave)}
                  />
                  <span className="permission-matrix-label">{perm.nombre_visible || perm.clave}</span>
                  {showClaveHint ? (
                    <span className="permission-matrix-clave">{perm.clave}</span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
