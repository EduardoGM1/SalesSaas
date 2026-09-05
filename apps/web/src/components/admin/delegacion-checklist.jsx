import { PermissionMatrix } from "@/components/admin/permission-matrix.jsx";

/**
 * Checklist de permisos delegables (alcance del delegante: capa:app).
 * No es un techo de gobierno de plataforma. Wrapper de PermissionMatrix.
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
