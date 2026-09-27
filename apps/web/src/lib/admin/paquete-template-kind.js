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

/** Plantilla de biblioteca → puesto de sistema del que se copia el snapshot de acciones. */
export const LIBRARY_TEMPLATE_ROLE_SLUG = {
  "operacion-base": "gerente",
  cierre: "cerrador",
  liner: "liner",
  marketing: "marketing",
  "opc-lobby": "opc",
};

export function librarySystemTemplates(packages) {
  const allowed = new Set(LIBRARY_SYSTEM_PACKAGE_SLUGS);
  return sortLibraryPackages((packages || []).filter((pack) => allowed.has(pack.slug)));
}

export function flagKeysFromPackage(pack) {
  return [...new Set(
    (pack?.paquete_flags || [])
      .filter((row) => row.activo !== false)
      .map((row) => row.flags?.clave)
      .filter(Boolean),
  )];
}

/**
 * Copia inicial: módulos de la plantilla + acciones del puesto de sistema homólogo.
 * No devuelve paquete_id (el puesto custom guarda su propio paquete técnico).
 */
export function snapshotFromLibraryTemplate(pack, roles = []) {
  const flag_keys = flagKeysFromPackage(pack);
  const roleSlug = LIBRARY_TEMPLATE_ROLE_SLUG[pack?.slug];
  const source = roleSlug
    ? (roles || []).find((role) => role.slug === roleSlug && role.es_sistema)
    : null;
  return {
    flag_keys,
    permission_keys: [...(source?.permission_keys || [])],
    sourceRoleName: source?.nombre || null,
  };
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
