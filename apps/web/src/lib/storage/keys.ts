/** Prefijo legado y namespaced: `sts4_v1:{workspaceId}`. La clave plana `sts4_v1` solo se lee en migración. */
export const STORAGE_KEY = "sts4_v1";
/** Preferencias globales al usuario (idioma, moneda, OneSignal) — no por workspace. */
export const USER_PREFS_KEY = "sts4_user_v1";
/** Último workspace_id activo en este dispositivo. */
export const ACTIVE_WORKSPACE_KEY = "sts4_active_workspace";
/** Versión del layout de localStorage (2 = namespaced por workspace). */
export const STORAGE_SCHEMA_KEY = "sts4_schema";
export const STORAGE_SCHEMA_VERSION = 2;
/** Blob legado pendiente de asignar al primer workspace_id conocido. */
export const STORAGE_LEGACY_PENDING_KEY = "sts4_v1:legacy_pending";
/** Outbox durable de sync (flag dirty / generation) — separado del blob CRM. */
export const OUTBOX_KEY = "sts4_outbound_v1";
export const OUTBOX_LEGACY_PENDING_KEY = "sts4_outbound_v1:legacy_pending";

export function workspaceStorageKey(workspaceId: string): string {
  return `${STORAGE_KEY}:${workspaceId}`;
}

export function outboxStorageKey(workspaceId: string): string {
  return `${OUTBOX_KEY}:${workspaceId}`;
}

export function isActiveWorkspaceStorageKey(key: string | null, workspaceId: string | null): boolean {
  if (!key || !workspaceId) return false;
  return key === workspaceStorageKey(workspaceId);
}
