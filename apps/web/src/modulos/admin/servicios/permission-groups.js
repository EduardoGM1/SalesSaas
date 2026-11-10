const MODULO_LABELS = {
  expedientes: "Expedientes",
  ventas: "Ventas",
  herramientas: "Herramientas",
  dashboard: "Dashboard y agenda",
  metas: "Metas",
  red: "Red",
  mensajes: "Mensajería",
  config: "Configuración",
  admin: "Administración",
  workflow: "Workflow",
};

/** Etiqueta legible para agrupación por permisos.modulo. */
export function formatModuloLabel(modulo) {
  if (!modulo) return "Otros";
  return MODULO_LABELS[modulo] || String(modulo).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeClave(clave) {
  const parts = String(clave || "").split(":");
  if (parts.length < 2) return clave;
  const action = parts[1].replace(/_/g, " ");
  return action.charAt(0).toUpperCase() + action.slice(1);
}

/** Resuelve entradas del catálogo para un conjunto de claves (con fallback si falta en catálogo). */
export function permisosForKeys(permisos, keys) {
  const catalog = new Map((permisos || []).map((p) => [p.clave, p]));
  return (keys || []).map((clave) => {
    const row = catalog.get(clave);
    if (row) return row;
    const modulo = String(clave).split(":")[0] || "otros";
    return {
      clave,
      nombre_visible: humanizeClave(clave),
      modulo,
      capa: "app",
    };
  });
}

/**
 * Agrupa permisos por modulo para PermissionMatrix.
 * @param {object[]} permisos - Catálogo o entradas resueltas
 * @param {{ ceilingKeys?: string[], capa?: string }} opts
 */
export function groupPermissionsByModulo(permisos, { ceilingKeys = null, capa = "app" } = {}) {
  const ceiling = ceilingKeys ? new Set(ceilingKeys) : null;
  const list = (permisos || []).filter((p) => {
    if (capa && p.capa !== capa) return false;
    if (ceiling && !ceiling.has(p.clave)) return false;
    return true;
  });

  const byModulo = new Map();
  for (const row of list) {
    const mod = row.modulo || "otros";
    if (!byModulo.has(mod)) byModulo.set(mod, []);
    byModulo.get(mod).push(row);
  }

  return [...byModulo.entries()]
    .sort(([a], [b]) => formatModuloLabel(a).localeCompare(formatModuloLabel(b), "es"))
    .map(([modulo, items]) => ({
      modulo,
      label: formatModuloLabel(modulo),
      items: items.sort((a, b) => (a.nombre_visible || a.clave).localeCompare(b.nombre_visible || b.clave, "es")),
    }));
}
