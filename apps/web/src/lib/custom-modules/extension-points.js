/**
 * Registry de puntos de extensión para módulos custom.
 * Un módulo custom SOLO puede engancharse en estos hooks — nunca mutar pantallas arbitrarias.
 */
export const EXTENSION_POINTS = Object.freeze({
  EXPEDIENTE_TAB: "expediente.tab",
  DASHBOARD_SALA_BLOQUE: "dashboard.sala.bloque",
  CLIENTES_COLUMNA: "clientes.columna",
});

export const EXTENSION_POINT_META = Object.freeze({
  [EXTENSION_POINTS.EXPEDIENTE_TAB]: {
    label: "Pestaña adicional en expediente",
    surface: "ClientDetail tabs",
  },
  [EXTENSION_POINTS.DASHBOARD_SALA_BLOQUE]: {
    label: "Bloque adicional en Dashboard de sala",
    surface: "Sala dashboard",
  },
  [EXTENSION_POINTS.CLIENTES_COLUMNA]: {
    label: "Columna adicional en lista de Clientes",
    surface: "ClientsPage table",
  },
});

/**
 * Filtra módulos custom activos para un hook concreto.
 * @param {Array<{ punto_extension?: string|null, schema_ui?: object }>} modules
 * @param {string} point
 */
export function modulesForExtensionPoint(modules, point) {
  if (!Array.isArray(modules) || !point) return [];
  return modules.filter((m) => m?.punto_extension === point);
}
