import {
  canOfferPwaInstall,
  isAndroidDevice,
  isIosDevice,
  wasInstallPromptDismissed,
} from "@/lib/pwa-install.js";

const DISMISS_KEY = "push_prompt_dismissed_at";
const DENIED_KEY = "push_prompt_blocked";
const AUTO_REQUEST_KEY = "push_auto_requested";
const SNOOZE_DAYS = 7;
const CONTEXTUAL_SNOOZE_HOURS = 24;

function readDismissedAt() {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return null;
  const ts = Number(raw);
  return Number.isFinite(ts) ? ts : null;
}

export function wasPushPromptPermanentlyBlocked() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(DENIED_KEY) === "1";
}

export function markPushPromptPermanentlyBlocked() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(DENIED_KEY, "1");
}

/** true tras el primer intento automático de permiso nativo (aceptado, rechazado o cerrado). */
export function wasAutoPushRequested() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(AUTO_REQUEST_KEY) === "1";
}

export function markAutoPushRequested() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(AUTO_REQUEST_KEY, "1");
}

export function wasPushPromptSnoozed({ contextual = false } = {}) {
  if (wasPushPromptPermanentlyBlocked()) return true;
  const dismissedAt = readDismissedAt();
  if (!dismissedAt) return false;
  const windowMs = contextual
    ? CONTEXTUAL_SNOOZE_HOURS * 60 * 60 * 1000
    : SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - dismissedAt < windowMs;
}

export function dismissPushPrompt() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

/**
 * Evita competir con el banner de instalación PWA en el primer contacto.
 * Solo en móvil: en desktop Chrome/Edge `BeforeInstallPromptEvent` existe y el
 * banner de instalar a menudo nunca se dismissa, lo que bloqueaba el permiso push para siempre.
 */
export function canOfferPushPromptAlongsidePwa() {
  if (!isIosDevice() && !isAndroidDevice()) return true;
  if (!canOfferPwaInstall()) return true;
  return wasInstallPromptDismissed();
}

export function nudgePushPrompt(detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("push:nudge", { detail }));
}
