import { UserSettings } from "@/lib/storage/types";

const LIVE_PREVIEW_KEYS = ["language", "currency", "exchangeRate", "exchangeMode"];

/** Compara preferencias de vista previa en vivo (evita setState / replaceDb redundantes). */
export function livePreviewSettingsEqual(a, b) {
  if (!a || !b) return a === b;
  return LIVE_PREVIEW_KEYS.every((key) => Object.is(a[key], b[key]));
}

export function pickLivePreviewSettings(settings) {
  /** @type {Partial<UserSettings>} */
  const picked = {};
  for (const key of LIVE_PREVIEW_KEYS) {
    if (settings?.[key] !== undefined) picked[key] = settings[key];
  }
  return picked;
}

export { LIVE_PREVIEW_KEYS };
