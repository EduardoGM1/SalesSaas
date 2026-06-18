import { useCallback, useEffect, useState } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";
import {
  canOfferPwaInstall,
  dismissInstallPrompt,
  isAndroidDevice,
  isIosDevice,
  isStandaloneApp,
  registerOpenInstallPrompt,
  wasInstallPromptDismissed,
} from "@/lib/pwa-install.js";
import { useI18n } from "@/hooks/use-i18n.js";

export function InstallAppPrompt() {
  const { t } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  const ios = isIosDevice();
  const android = isAndroidDevice();
  const installed = isStandaloneApp();

  const openGuide = useCallback((options = {}) => {
    const { force = false } = options;
    if (installed) return;

    if (force) {
      if (ios) {
        setShowIosGuide(true);
        return;
      }
      if (android && deferredPrompt) {
        setInstalling(true);
        void deferredPrompt.prompt()
          .then(() => deferredPrompt.userChoice)
          .finally(() => setInstalling(false));
        return;
      }
      setShowIosGuide(true);
      return;
    }

    if (ios) {
      setShowIosGuide(true);
      return;
    }
    if (deferredPrompt) {
      setInstalling(true);
      void deferredPrompt.prompt()
        .then(() => deferredPrompt.userChoice)
        .finally(() => setInstalling(false));
      return;
    }
    setShowBanner(true);
  }, [deferredPrompt, installed, ios, android]);

  useEffect(() => {
    registerOpenInstallPrompt(openGuide);
    return () => registerOpenInstallPrompt(null);
  }, [openGuide]);

  useEffect(() => {
    if (!canOfferPwaInstall() || wasInstallPromptDismissed()) return;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const timer = window.setTimeout(() => {
      if (!wasInstallPromptDismissed() && canOfferPwaInstall()) {
        setShowBanner(true);
      }
    }, ios ? 2500 : 5000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.clearTimeout(timer);
    };
  }, [ios]);

  const handleDismiss = () => {
    dismissInstallPrompt();
    setShowBanner(false);
    setShowIosGuide(false);
  };

  const handleInstallClick = () => {
    if (ios) {
      setShowIosGuide(true);
      return;
    }
    if (deferredPrompt) {
      setInstalling(true);
      void deferredPrompt.prompt()
        .then(() => deferredPrompt.userChoice)
        .finally(() => setInstalling(false));
      return;
    }
    setShowIosGuide(true);
  };

  if (installed) return null;

  return (
    <>
      {showBanner && !showIosGuide && (
        <div className="pwa-install-banner" role="region" aria-label="Instalar aplicación">
          <div className="pwa-install-banner-icon" aria-hidden>
            <Smartphone size={20} />
          </div>
          <div className="pwa-install-banner-copy">
            <div className="pwa-install-banner-title">Instala Sales Timeshare</div>
            <div className="pwa-install-banner-sub">
              {ios
                ? "Acceso rápido desde tu pantalla de inicio, como una app nativa."
                : android && deferredPrompt
                  ? "Un toque para instalar, sin pasar por la configuración del navegador."
                  : "Añádela a tu inicio para abrirla a pantalla completa."}
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-sm pwa-install-banner-btn" onClick={handleInstallClick} disabled={installing}>
            {installing ? "Instalando…" : ios ? "Cómo instalar" : "Instalar"}
          </button>
          <button type="button" className="pwa-install-banner-close" onClick={handleDismiss} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
      )}

      {showIosGuide && (
        <div className="pwa-install-overlay" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
          <div className="pwa-install-modal">
            <button type="button" className="pwa-install-modal-close" onClick={handleDismiss} aria-label="Cerrar">
              <X size={18} />
            </button>
            <div className="pwa-install-modal-icon" aria-hidden>
              <Download size={22} />
            </div>
            <h2 id="pwa-install-title" className="pwa-install-modal-title">
              {ios ? t("settings.pwa.modalTitleIos") : android ? t("settings.pwa.modalTitleAndroid") : t("settings.pwa.modalTitleDesktop")}
            </h2>
            <p className="pwa-install-modal-sub">
              {ios
                ? t("settings.pwa.modalSubIos")
                : android
                  ? t("settings.pwa.modalSubAndroid")
                  : t("settings.pwa.modalSubDesktop")}
            </p>
            <ol className="pwa-install-steps">
              {ios ? (
                <>
                  <li>
                    <span className="pwa-install-step-num">1</span>
                    <span>
                      Toca <strong>Compartir</strong>
                      <Share size={14} className="pwa-install-inline-icon" aria-hidden />
                      en la barra inferior de Safari.
                    </span>
                  </li>
                  <li>
                    <span className="pwa-install-step-num">2</span>
                    <span>Desplázate y elige <strong>Agregar a pantalla de inicio</strong>.</span>
                  </li>
                  <li>
                    <span className="pwa-install-step-num">3</span>
                    <span>Confirma con <strong>Agregar</strong>. ¡Listo!</span>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <span className="pwa-install-step-num">1</span>
                    <span>Abre el menú del navegador (⋮ o …).</span>
                  </li>
                  <li>
                    <span className="pwa-install-step-num">2</span>
                    <span>Elige <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>.</span>
                  </li>
                </>
              )}
            </ol>
            {ios && (
              <p className="pwa-install-note">
                Debes usar <strong>Safari</strong> para instalar en iPhone. Si estás en otro navegador, abre esta página en Safari.
              </p>
            )}
            <button type="button" className="btn btn-primary btn-full" onClick={handleDismiss}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
