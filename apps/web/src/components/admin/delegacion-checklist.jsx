import { PermissionMatrix } from "@/components/admin/permission-matrix.jsx";

/**
 * Checklist de permisos delegables (techo del delegante).
 * Wrapper de PermissionMatrix para compatibilidad con TeamPage y tenant admin.
 */
export function DelegacionChecklist({
  ceiling = [],
  selected = [],
  onChange,
  loading = false,
  permisos = [],
  emptyLabel = "No hay permisos que puedas delegar.",
}) {
  return (
    <PermissionMatrix
      permisos={permisos}
      ceiling={ceiling}
      value={selected}
      onChange={onChange}
      loading={loading}
      emptyLabel={emptyLabel}
    />
  );
}
