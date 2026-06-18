import { useEffect, useState } from "react";
import { CheckCircle2, Download, Share, Smartphone } from "lucide-react";
import {
  getInstallPlatform,
  isStandaloneApp,
  openInstallPrompt,
} from "@/lib/pwa-install.js";
import { useI18n } from "@/hooks/use-i18n.js";

export function PwaInstallSettings() {
  const { t } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(isStandaloneApp());
  const platform = getInstallPlatform();

  useEffect(() => {
    const syncInstalled = () => setInstalled(isStandaloneApp());
    syncInstalled();

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", syncInstalled);
    window.matchMedia("(display-mode: standalone)").addEventListener?.("change", syncInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", syncInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (installed) return;

    if (platform === "android" && deferredPrompt) {
      setInstalling(true);
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        setInstalled(isStandaloneApp());
      } finally {
        setInstalling(false);
      }
      return;
    }

    openInstallPrompt({ force: true });
  };

  if (installed) {
    return (
      <div className="pwa-settings-installed">
        <div className="pwa-settings-installed-icon" aria-hidden>
          <CheckCircle2 size={28} />
        </div>
        <div>
          <div className="settings-label">{t("settings.pwa.installedTitle")}</div>
          <div className="settings-help">{t("settings.pwa.installedDesc")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pwa-settings">
      <div className="pwa-settings-platform">
        <div className="pwa-settings-platform-icon" aria-hidden>
          <Smartphone size={20} />
        </div>
        <div>
          <div className="settings-label">{t(`settings.pwa.platform.${platform}`)}</div>
          <div className="settings-help">{t(`settings.pwa.platformDesc.${platform}`)}</div>
        </div>
      </div>

      {platform === "ios" && (
        <ol className="pwa-install-steps pwa-settings-steps">
          <li>
            <span className="pwa-install-step-num">1</span>
            <span>
              {t("settings.pwa.iosStep1")}
              <Share size={14} className="pwa-install-inline-icon" aria-hidden />
            </span>
          </li>
          <li>
            <span className="pwa-install-step-num">2</span>
            <span>{t("settings.pwa.iosStep2")}</span>
          </li>
          <li>
            <span className="pwa-install-step-num">3</span>
            <span>{t("settings.pwa.iosStep3")}</span>
          </li>
        </ol>
      )}

      {platform === "android" && !deferredPrompt && (
        <ol className="pwa-install-steps pwa-settings-steps">
          <li>
            <span className="pwa-install-step-num">1</span>
            <span>{t("settings.pwa.androidStep1")}</span>
          </li>
          <li>
            <span className="pwa-install-step-num">2</span>
            <span>{t("settings.pwa.androidStep2")}</span>
          </li>
        </ol>
      )}

      {platform === "desktop" && (
        <p className="settings-help pwa-settings-note">{t("settings.pwa.desktopNote")}</p>
      )}

      {platform === "ios" && (
        <p className="pwa-install-note">{t("settings.pwa.iosSafariNote")}</p>
      )}

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleInstall}
          disabled={installing}
        >
          <Download size={16} />
          {installing
            ? t("settings.pwa.installing")
            : platform === "ios"
              ? t("settings.pwa.showGuide")
              : deferredPrompt
                ? t("settings.pwa.installNow")
                : t("settings.pwa.openGuide")}
        </button>
      </div>
    </div>
  );
}
