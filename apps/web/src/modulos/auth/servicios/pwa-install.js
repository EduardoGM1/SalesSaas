const DISMISS_KEY = "pwa_install_dismissed_at";
const DISMISS_DAYS = 14;

/** @typedef {'ios' | 'android' | 'desktop'} InstallPlatform */

export function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: fullscreen)").matches
    || window.navigator.standalone === true
  );
}

export function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isAndroidDevice() {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

/** Plataforma detectada para guiar la instalación PWA. */
export function getInstallPlatform() {
  if (isIosDevice()) return "ios";
  if (isAndroidDevice()) return "android";
  return "desktop";
}

/** Mostrar entrada de instalación en Ajustes (móvil y navegadores con PWA). */
export function shouldShowPwaInstallInSettings() {
  if (typeof window === "undefined") return false;
  if (isIosDevice() || isAndroidDevice()) return true;
  return "serviceWorker" in navigator;
}

export function canOfferPwaInstall() {
  if (typeof window === "undefined") return false;
  if (isStandaloneApp()) return false;
  return isIosDevice() || isAndroidDevice() || "BeforeInstallPromptEvent" in window;
}

export function wasInstallPromptDismissed() {
  if (typeof localStorage === "undefined") return false;
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (!Number.isFinite(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export function dismissInstallPrompt() {
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

let openInstallPromptHandler = null;

export function registerOpenInstallPrompt(handler) {
  openInstallPromptHandler = handler;
}

export function openInstallPrompt(options = {}) {
  openInstallPromptHandler?.(options);
}
