/**
 * Clasifica filas de paquetes_acceso para la UI de Plantillas de módulos.
 *
 * No existe columna es_biblioteca: las plantillas de biblioteca son
 * - slugs de sistema (seed RH / operación), o
 * - paquetes custom creados desde la pestaña Plantillas.
 *
 * Paquetes técnicos: generados al editar módulos de un puesto (ensureRolePackageFromFlags).
 */

export const LIBRARY_SYSTEM_PACKAGE_SLUGS = [
  "operacion-base",
  "cierre",
  "liner",
  "marketing",
  "opc-lobby",
];

/** Paquete ligado a un puesto concreto (no plantilla reutilizable). */
export function isRoleTechnicalPackage(pack) {
  if (!pack) return false;
  const slug = String(pack.slug || "").trim();
  if (LIBRARY_SYSTEM_PACKAGE_SLUGS.includes(slug)) return false;
  if (slug.startsWith("puesto-")) return true;
  const desc = String(pack.descripcion || "").trim();
  if (desc.startsWith("Módulos del puesto")) return true;
  const nombre = String(pack.nombre || "").trim();
  if (nombre.endsWith(" (módulos)")) return true;
  return false;
}

export function isLibraryModuleTemplate(pack) {
  return !isRoleTechnicalPackage(pack);
}

export function sortLibraryPackages(packages) {
  const order = new Map(LIBRARY_SYSTEM_PACKAGE_SLUGS.map((s, i) => [s, i]));
  return [...(packages || [])].sort((a, b) => {
    const sa = order.has(a.slug) ? order.get(a.slug) : 100;
    const sb = order.has(b.slug) ? order.get(b.slug) : 100;
    if (sa !== sb) return sa - sb;
    return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
  });
}
