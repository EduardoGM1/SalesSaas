/**
 * Settings del blob CRM: unas claves son del usuario (siguen al cambiar de sala)
 * y otras son de la sala/workspace (no deben viajar al switch).
 */

export const USER_GLOBAL_SETTING_KEYS = [
  "language",
  "userName",
  "userInitials",
  "notifications",
  "onesignal_subscription_ids",
  "currency",
  "exchangeRate",
  "exchangeMode",
  "usdToMxnRate",
  "exchangeRateUpdatedAt",
  "activeCaptureCurrency",
];

export const WORKSPACE_SETTING_KEYS = [
  "worksheetConfig",
  "moneyBoxConfig",
  "tourTypes",
];

const DEFAULT_USER_SETTINGS = {
  language: "es",
  currency: "USD",
  exchangeRate: 1,
  exchangeMode: "auto",
  userName: "Usuario",
  userInitials: "U",
};

function pickKeys(source, keys) {
  if (!source || typeof source !== "object") return {};
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

export function pickUserGlobalSettings(settings) {
  return pickKeys(settings, USER_GLOBAL_SETTING_KEYS);
}

export function pickWorkspaceSettings(settings) {
  return pickKeys(settings, WORKSPACE_SETTING_KEYS);
}

export function hasWorkspaceSettings(settings) {
  const scoped = pickWorkspaceSettings(settings);
  if (scoped.worksheetConfig && typeof scoped.worksheetConfig === "object" && Object.keys(scoped.worksheetConfig).length) {
    return true;
  }
  if (scoped.moneyBoxConfig && typeof scoped.moneyBoxConfig === "object" && Object.keys(scoped.moneyBoxConfig).length) {
    return true;
  }
  if (Array.isArray(scoped.tourTypes) && scoped.tourTypes.length) return true;
  return false;
}

export function composeSettings(userGlobals, workspaceSettings) {
  return {
    ...DEFAULT_USER_SETTINGS,
    ...pickUserGlobalSettings(userGlobals),
    ...pickWorkspaceSettings(workspaceSettings),
  };
}

/**
 * Combina settings locales + remotos sin reinyectar worksheet/moneyBox/tourTypes
 * del blob plano de profiles.settings (ese blob es por usuario, no por sala).
 *
 * Si el remoto ya trae `workspaces[workspaceId]`, se usa como semilla solo cuando
 * el blob local de esa sala aún no tiene config propia.
 */
export function mergeSettingsForWorkspace(localSettings, remoteSettings, workspaceId) {
  const globals = {
    ...pickUserGlobalSettings(remoteSettings),
    ...pickUserGlobalSettings(localSettings),
  };
  const localWs = pickWorkspaceSettings(localSettings);
  const nestedRemote =
    workspaceId && remoteSettings?.workspaces && typeof remoteSettings.workspaces === "object"
      ? remoteSettings.workspaces[workspaceId]
      : null;
  const remoteWs = pickWorkspaceSettings(nestedRemote);
  const workspace = hasWorkspaceSettings(localWs) ? localWs : remoteWs;
  return composeSettings(globals, workspace);
}

/**
 * Payload para PATCH /profile: globales al usuario + mapa por workspace.
 * No envía worksheetConfig/moneyBoxConfig/tourTypes en la raíz (evita el leak
 * si un cliente viejo o un merge remoto las reaplicara).
 */
export function buildProfileSettingsBody(settings, workspaceId, existingWorkspaces = {}) {
  const globals = pickUserGlobalSettings(settings);
  const scoped = pickWorkspaceSettings(settings);
  const prev = existingWorkspaces && typeof existingWorkspaces === "object" ? existingWorkspaces : {};
  return {
    ...globals,
    workspaces: {
      ...prev,
      ...(workspaceId ? { [workspaceId]: scoped } : {}),
    },
  };
}
