import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";
import { enablePushNotifications, toastPushEnableResult } from "@/lib/push-enable.js";
import {
  canOfferPushPromptAlongsidePwa,
  clearAutoPushRequested,
  dismissPushPrompt,
  wasAutoPushRequested,
  wasPushPromptSnoozed,
} from "@/lib/push-prompt.js";
import { getPushStatus, isPushSupported, needsIosPwaInstall } from "@/lib/push-notifications.js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getInstallPlatform } from "@/lib/pwa-install.js";

async function shouldShowPushPrompt({ contextual = false } = {}) {
  if (!isSupabaseConfigured() || !isPushSupported() || needsIosPwaInstall()) {
    return false;
  }
  if (wasPushPromptSnoozed({ contextual })) return false;
  if (!canOfferPushPromptAlongsidePwa()) return false;

  const status = await getPushStatus();
  if (!status.pushConfigured) return false;
  if (status.subscribed) return false;
  if (status.permission === "denied") return false;

  // Flag antiguo incorrecto: permiso sigue default → permitir banner.
  if (wasAutoPushRequested() && status.permission === "default") {
    clearAutoPushRequested();
  } else if (!contextual && wasAutoPushRequested()) {
    return false;
  }

  if (status.needsResync) return true;
  return status.permission === "default";
}

export function PushPermissionPrompt() {
  const { t } = useI18n();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const evaluatingRef = useRef(false);
  const pendingRef = useRef(false);

  const evaluate = useCallback(async ({ contextual = false } = {}) => {
    if (evaluatingRef.current) return;
    if (location.pathname.startsWith("/settings")) return;

    evaluatingRef.current = true;
    try {
      const show = await shouldShowPushPrompt({ contextual });
      setVisible(show);
    } finally {
      evaluatingRef.current = false;
    }
  }, [location.pathname]);

  useEffect(() => {
    const onNudge = (event) => {
      void evaluate(event.detail || {});
    };
    window.addEventListener("push:nudge", onNudge);
    // Desktop: evaluar al montar (el auto nativo a menudo falla sin gesto).
    if (getInstallPlatform() === "desktop") {
      const timer = window.setTimeout(() => {
        void evaluate({ contextual: true });
      }, 1200);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("push:nudge", onNudge);
      };
    }
    return () => window.removeEventListener("push:nudge", onNudge);
  }, [evaluate]);

  const handleDismiss = () => {
    dismissPushPrompt();
    setVisible(false);
  };

  const handleEnable = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      const result = await enablePushNotifications();
      toastPushEnableResult(result, t);
      if (result.ok) {
        setVisible(false);
        return;
      }
      if (result.code === "PERMISSION_DENIED") {
        setVisible(false);
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="push-permission-banner" role="region" aria-label={t("pushPrompt.aria")}>
      <div className="push-permission-banner-icon" aria-hidden>
        <Bell size={20} />
      </div>
      <div className="push-permission-banner-copy">
        <div className="push-permission-banner-title">{t("pushPrompt.title")}</div>
        <div className="push-permission-banner-sub">{t("pushPrompt.sub")}</div>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-sm push-permission-banner-btn"
        data-push-enable
        onClick={handleEnable}
        disabled={pending}
      >
        {pending ? t("common.loading") : t("pushPrompt.enable")}
      </button>
      <button
        type="button"
        className="push-permission-banner-later"
        onClick={handleDismiss}
        disabled={pending}
      >
        {t("pushPrompt.later")}
      </button>
      <button
        type="button"
        className="push-permission-banner-close"
        onClick={handleDismiss}
        aria-label={t("pushPrompt.close")}
        disabled={pending}
      >
        <X size={16} />
      </button>
    </div>
  );
}
