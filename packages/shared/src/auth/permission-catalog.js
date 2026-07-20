/** Catálogo canónico de permisos (Fase 2). */

export const PERMISSION_MODULES = [
  { id: "expedientes", label: "Expedientes / Clientes" },
  { id: "herramientas", label: "Herramientas" },
  { id: "ventas", label: "Ventas" },
  { id: "dashboard", label: "Dashboard / Agenda / Metas" },
  { id: "red", label: "Red / Mensajes" },
  { id: "config", label: "Configuración / Notificaciones" },
  { id: "admin", label: "Panel de administración" },
];

/** @type {{ clave: string, nombre_visible: string, modulo: string, capa: 'app' | 'admin' }[]} */
export const PERMISSION_CATALOG = [
  // Expedientes
  { clave: "expedientes:ver_propios", nombre_visible: "Ver expedientes propios", modulo: "expedientes", capa: "app" },
  { clave: "expedientes:crear", nombre_visible: "Crear expedientes", modulo: "expedientes", capa: "app" },
  { clave: "expedientes:editar", nombre_visible: "Editar expedientes", modulo: "expedientes", capa: "app" },
  { clave: "expedientes:eliminar", nombre_visible: "Eliminar expedientes", modulo: "expedientes", capa: "app" },
  { clave: "expedientes:compartir", nombre_visible: "Compartir expedientes", modulo: "expedientes", capa: "app" },
  { clave: "expedientes:ver_equipo", nombre_visible: "Ver expedientes del equipo", modulo: "expedientes", capa: "app" },
  // Herramientas
  { clave: "herramientas:survey", nombre_visible: "Usar Survey", modulo: "herramientas", capa: "app" },
  { clave: "herramientas:survey_configurar_preguntas", nombre_visible: "Configurar preguntas del Survey", modulo: "herramientas", capa: "app" },
  { clave: "herramientas:vacaciones", nombre_visible: "Usar Proyección de Vacaciones", modulo: "herramientas", capa: "app" },
  { clave: "herramientas:worksheet", nombre_visible: "Usar Worksheet", modulo: "herramientas", capa: "app" },
  { clave: "herramientas:analysis", nombre_visible: "Usar Analysis", modulo: "herramientas", capa: "app" },
  // Ventas (claves legacy sales:* conservadas)
  { clave: "ventas:registrar", nombre_visible: "Registrar ventas", modulo: "ventas", capa: "app" },
  { clave: "ventas:editar", nombre_visible: "Editar ventas", modulo: "ventas", capa: "app" },
  { clave: "ventas:cancelar", nombre_visible: "Cancelar ventas", modulo: "ventas", capa: "app" },
  { clave: "sales:view_modal", nombre_visible: "Ver modal de venta", modulo: "ventas", capa: "app" },
  { clave: "sales:view_detail", nombre_visible: "Ver detalle ampliado de venta", modulo: "ventas", capa: "app" },
  { clave: "sales:history", nombre_visible: "Acceso a historial de ventas", modulo: "ventas", capa: "app" },
  { clave: "ventas:ver_equipo", nombre_visible: "Ver ventas de otros vendedores", modulo: "ventas", capa: "app" },
  // Dashboard / agenda / metas
  { clave: "dashboard:ver_propio", nombre_visible: "Ver dashboard propio", modulo: "dashboard", capa: "app" },
  { clave: "dashboard:ver_equipo", nombre_visible: "Ver dashboard del equipo", modulo: "dashboard", capa: "app" },
  { clave: "agenda:usar", nombre_visible: "Usar agenda", modulo: "dashboard", capa: "app" },
  { clave: "metas:ver_editar_propias", nombre_visible: "Ver y editar metas propias", modulo: "dashboard", capa: "app" },
  { clave: "metas:ver_equipo", nombre_visible: "Ver metas del equipo", modulo: "dashboard", capa: "app" },
  // Red
  { clave: "red:usar", nombre_visible: "Usar red de contactos", modulo: "red", capa: "app" },
  { clave: "mensajes:usar", nombre_visible: "Usar mensajería", modulo: "red", capa: "app" },
  // Config
  { clave: "notificaciones:configurar_propias", nombre_visible: "Configurar notificaciones propias", modulo: "config", capa: "app" },
  { clave: "config:propia", nombre_visible: "Configuración propia", modulo: "config", capa: "app" },
  // Admin (claves existentes)
  { clave: "dashboard:read", nombre_visible: "Admin: ver resumen", modulo: "admin", capa: "admin" },
  { clave: "users:read", nombre_visible: "Admin: ver usuarios", modulo: "admin", capa: "admin" },
  { clave: "users:deactivate", nombre_visible: "Admin: desactivar cuentas", modulo: "admin", capa: "admin" },
  { clave: "users:activate", nombre_visible: "Admin: activar cuentas", modulo: "admin", capa: "admin" },
  { clave: "users:export", nombre_visible: "Admin: exportar usuarios", modulo: "admin", capa: "admin" },
  { clave: "users:role", nombre_visible: "Admin: cambiar rol / plan", modulo: "admin", capa: "admin" },
  { clave: "users:permissions", nombre_visible: "Admin: editar permisos", modulo: "admin", capa: "admin" },
  { clave: "goals:read", nombre_visible: "Admin: ver metas globales", modulo: "admin", capa: "admin" },
  { clave: "tools:analytics", nombre_visible: "Admin: analytics de herramientas", modulo: "admin", capa: "admin" },
  { clave: "support:read", nombre_visible: "Admin: ver soporte (legacy)", modulo: "admin", capa: "admin" },
  { clave: "ver_tickets_soporte", nombre_visible: "Ver tickets de soporte", modulo: "admin", capa: "admin" },
  { clave: "responder_tickets_soporte", nombre_visible: "Responder tickets de soporte", modulo: "admin", capa: "admin" },
  { clave: "ver_logs_administracion", nombre_visible: "Ver logs de administración", modulo: "admin", capa: "admin" },
  { clave: "admin:roles", nombre_visible: "Admin: gestionar roles", modulo: "admin", capa: "admin" },
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

/** Admin sistema: app completa + admin delegables (sin users:role/permissions/admin:roles/logs). */
export const ADMIN_DEFAULT_PERMISSIONS = [
  ...VENDEDOR_DEFAULT_PERMISSIONS,
  "dashboard:read",
  "users:read",
  "users:deactivate",
  "users:activate",
  "users:export",
  "goals:read",
  "tools:analytics",
  "support:read",
  "ver_tickets_soporte",
  "responder_tickets_soporte",
];

/** Rol sistema Soporte: app base + solo tickets. */
export const SOPORTE_DEFAULT_PERMISSIONS = [
  ...VENDEDOR_DEFAULT_PERMISSIONS,
  "ver_tickets_soporte",
  "responder_tickets_soporte",
  "support:read",
];

export const SUPERADMIN_ONLY_KEYS = ["users:role", "users:permissions", "admin:roles", "ver_logs_administracion"];

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
