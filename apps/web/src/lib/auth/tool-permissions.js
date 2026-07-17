/** Mapa herramienta → clave de permiso (Fase 2). Money Box = plan PRO, no RBAC. */
export const TOOL_PERMISSION_KEYS = {
  survey: "herramientas:survey",
  vacaciones: "herramientas:vacaciones",
  worksheet: "herramientas:worksheet",
  analysis: "herramientas:analysis",
};

export function toolPermissionKey(tool) {
  return TOOL_PERMISSION_KEYS[tool] || null;
}
