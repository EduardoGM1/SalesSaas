/** Catálogo canónico de permisos (Fase 2 + consolidación admin por sección). */

export const PERMISSION_MODULES = [
  { id: "expedientes", label: "Expedientes / Clientes" },
  { id: "herramientas", label: "Herramientas" },
  { id: "ventas", label: "Ventas" },
  { id: "dashboard", label: "Dashboard / Agenda / Metas" },
  { id: "red", label: "Red / Mensajes" },
  { id: "config", label: "Configuración / Notificaciones" },
  { id: "admin", label: "Panel de administración" },
];

/**
 * Permisos admin consolidados (1 por sección del panel).
 * Excepción: ver_metricas_financieras_usuarios — dato sensible, no es pestaña.
 */
export const ADMIN_SECTION_PERMISSIONS = [
  { clave: "ver_resumen", nombre_visible: "Ver Resumen", modulo: "admin", capa: "admin" },
  { clave: "gestionar_usuarios", nombre_visible: "Gestionar Usuarios", modulo: "admin", capa: "admin" },
  { clave: "ver_logs", nombre_visible: "Ver Logs", modulo: "admin", capa: "admin" },
  { clave: "gestionar_metas", nombre_visible: "Gestionar Metas", modulo: "admin", capa: "admin" },
  { clave: "ver_metricas", nombre_visible: "Ver Métricas", modulo: "admin", capa: "admin" },
  { clave: "gestionar_soporte", nombre_visible: "Gestionar Soporte", modulo: "admin", capa: "admin" },
  { clave: "gestionar_roles_permisos", nombre_visible: "Gestionar Roles y permisos", modulo: "admin", capa: "admin" },
];

/**
 * Precedencia de acceso (única, sin excepción):
 * deny/grant usuario > deny/grant grupo > permisos del rol > denegar.
 * Solo claves con permite_override=true admiten override individual.
 */
const OV = true;
const NO = false;

/** @type {{ clave: string, nombre_visible: string, modulo: string, capa: 'app' | 'admin', permite_override: boolean }[]} */
export const PERMISSION_CATALOG = [
  // Expedientes
  { clave: "expedientes:ver_propios", nombre_visible: "Ver expedientes propios", modulo: "expedientes", capa: "app", permite_override: NO },
  { clave: "expedientes:crear", nombre_visible: "Crear expedientes", modulo: "expedientes", capa: "app", permite_override: NO },
  { clave: "expedientes:editar", nombre_visible: "Editar expedientes", modulo: "expedientes", capa: "app", permite_override: NO },
  { clave: "expedientes:eliminar", nombre_visible: "Eliminar expedientes", modulo: "expedientes", capa: "app", permite_override: NO },
  { clave: "expedientes:compartir", nombre_visible: "Compartir expedientes", modulo: "expedientes", capa: "app", permite_override: NO },
  { clave: "expedientes:ver_equipo", nombre_visible: "Ver expedientes del equipo", modulo: "expedientes", capa: "app", permite_override: NO },
  // Herramientas (app)
  { clave: "herramientas:survey", nombre_visible: "Usar Survey", modulo: "herramientas", capa: "app", permite_override: OV },
  { clave: "herramientas:survey_configurar_preguntas", nombre_visible: "Configurar preguntas del Survey", modulo: "herramientas", capa: "app", permite_override: OV },
  { clave: "herramientas:vacaciones", nombre_visible: "Usar Proyección de Vacaciones", modulo: "herramientas", capa: "app", permite_override: OV },
  { clave: "herramientas:worksheet", nombre_visible: "Usar Worksheet", modulo: "herramientas", capa: "app", permite_override: OV },
  { clave: "herramientas:analysis", nombre_visible: "Usar Analysis", modulo: "herramientas", capa: "app", permite_override: OV },
  // Ventas
  { clave: "ventas:registrar", nombre_visible: "Registrar ventas", modulo: "ventas", capa: "app", permite_override: NO },
  { clave: "ventas:editar", nombre_visible: "Editar ventas", modulo: "ventas", capa: "app", permite_override: NO },
  { clave: "ventas:cancelar", nombre_visible: "Cancelar ventas", modulo: "ventas", capa: "app", permite_override: NO },
  { clave: "sales:view_modal", nombre_visible: "Ver modal de venta", modulo: "ventas", capa: "app", permite_override: OV },
  { clave: "sales:view_detail", nombre_visible: "Ver detalle ampliado de venta", modulo: "ventas", capa: "app", permite_override: OV },
  { clave: "sales:history", nombre_visible: "Acceso a historial de ventas", modulo: "ventas", capa: "app", permite_override: OV },
  { clave: "ventas:ver_equipo", nombre_visible: "Ver ventas de otros vendedores", modulo: "ventas", capa: "app", permite_override: NO },
  // Dashboard / agenda / metas
  { clave: "dashboard:ver_propio", nombre_visible: "Ver dashboard propio", modulo: "dashboard", capa: "app", permite_override: NO },
  { clave: "dashboard:ver_equipo", nombre_visible: "Ver dashboard del equipo", modulo: "dashboard", capa: "app", permite_override: NO },
  { clave: "agenda:usar", nombre_visible: "Usar agenda", modulo: "dashboard", capa: "app", permite_override: NO },
  { clave: "metas:ver_editar_propias", nombre_visible: "Ver y editar metas propias", modulo: "dashboard", capa: "app", permite_override: NO },
  { clave: "metas:ver_equipo", nombre_visible: "Ver metas del equipo", modulo: "dashboard", capa: "app", permite_override: NO },
  // Red
  { clave: "red:usar", nombre_visible: "Usar red de contactos", modulo: "red", capa: "app", permite_override: NO },
  { clave: "mensajes:usar", nombre_visible: "Usar mensajería", modulo: "red", capa: "app", permite_override: NO },
  // Config
  { clave: "notificaciones:configurar_propias", nombre_visible: "Configurar notificaciones propias", modulo: "config", capa: "app", permite_override: NO },
  { clave: "config:propia", nombre_visible: "Configuración propia", modulo: "config", capa: "app", permite_override: NO },
  // Admin (secciones) — delegables sí; estructurales no
  ...ADMIN_SECTION_PERMISSIONS.map((p) => ({
    ...p,
    permite_override: ![
      "ver_logs",
      "gestionar_roles_permisos",
    ].includes(p.clave),
  })),
  // Excepción: métricas financieras por usuario (no overrideable)
  {
    clave: "ver_metricas_financieras_usuarios",
    nombre_visible: "Ver métricas financieras por usuario",
    modulo: "admin",
    capa: "admin",
    permite_override: NO,
  },
];

/** Catálogo de módulos de herramienta (Tema 1). */
export const MODULE_CATALOG = [
  { clave: "survey", nombre_visible: "Survey", permission_key: "herramientas:survey", requiere_plan: null },
  { clave: "vacaciones", nombre_visible: "Proyección de Vacaciones", permission_key: "herramientas:vacaciones", requiere_plan: null },
  { clave: "worksheet", nombre_visible: "Worksheet", permission_key: "herramientas:worksheet", requiere_plan: null },
  { clave: "money_box", nombre_visible: "Money Box", permission_key: null, requiere_plan: "pro" },
  { clave: "analysis", nombre_visible: "Analysis", permission_key: "herramientas:analysis", requiere_plan: null },
];

export const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.clave);

export const APP_PERMISSION_KEYS = PERMISSION_CATALOG.filter((p) => p.capa === "app").map((p) => p.clave);

export const ADMIN_PERMISSION_KEYS = PERMISSION_CATALOG.filter((p) => p.capa === "admin").map((p) => p.clave);

/** Features toggables en modal Usuario (ventas + herramientas). */
export const OVERRIDABLE_APP_FEATURES = [
  "sales:view_modal",
  "sales:view_detail",
  "sales:history",
  "herramientas:survey",
  "herramientas:survey_configurar_preguntas",
  "herramientas:vacaciones",
  "herramientas:worksheet",
  "herramientas:analysis",
];

/** Permisos por defecto del rol Vendedor (sin ver_equipo). */
export const VENDEDOR_DEFAULT_PERMISSIONS = APP_PERMISSION_KEYS.filter(
  (k) => !k.endsWith(":ver_equipo"),
);

/** Admin sistema: app + secciones operativas (sin logs ni roles). */
export const ADMIN_DEFAULT_PERMISSIONS = [
  ...VENDEDOR_DEFAULT_PERMISSIONS,
  "ver_resumen",
  "gestionar_usuarios",
  "gestionar_metas",
  "ver_metricas",
  "gestionar_soporte",
];

/** Rol sistema Soporte: app base + solo soporte. */
export const SOPORTE_DEFAULT_PERMISSIONS = [
  ...VENDEDOR_DEFAULT_PERMISSIONS,
  "gestionar_soporte",
];

/** Solo Superadmin por defecto (dato sensible / no asignar a Admin). */
export const SUPERADMIN_ONLY_KEYS = [
  "ver_metricas_financieras_usuarios",
  "gestionar_roles_permisos",
  "ver_logs",
];

/** Acciones de auditoría admin (claves estables). */
export const ADMIN_AUDIT_ACTIONS = {
  CAMBIO_ROL: "cambio_rol",
  CAMBIO_PLAN: "cambio_plan",
  CREACION_ROL: "creacion_rol",
  EDICION_ROL: "edicion_rol",
  ELIMINACION_ROL: "eliminacion_rol",
  EDICION_PERMISOS_USUARIO: "edicion_permisos_usuario",
  ACTIVACION_CUENTA: "activacion_cuenta",
  DESACTIVACION_CUENTA: "desactivacion_cuenta",
  RESPUESTA_TICKET_SOPORTE: "respuesta_ticket_soporte",
  CAMBIO_ESTADO_TICKET: "cambio_estado_ticket",
};

export function permissionsByModule() {
  const map = new Map();
  for (const mod of PERMISSION_MODULES) map.set(mod.id, []);
  for (const p of PERMISSION_CATALOG) {
    if (!map.has(p.modulo)) map.set(p.modulo, []);
    map.get(p.modulo).push(p);
  }
  return PERMISSION_MODULES.map((m) => ({ ...m, permissions: map.get(m.id) || [] }));
}
