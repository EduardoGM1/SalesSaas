import { Outlet } from "react-router-dom";
import { StoreHydration } from "@/components/providers/store-hydration.jsx";
import { SyncProvider } from "@/components/providers/sync-provider.jsx";
import { ExchangeRateSync } from "@/components/providers/exchange-rate-sync.jsx";
import { PresenceProvider } from "@/components/providers/presence-provider.jsx";
import { OneSignalProvider } from "@/components/providers/onesignal-provider.jsx";
import { PushPermissionPrompt } from "@/components/notifications/push-permission-prompt.jsx";
import { AutoPushCoordinator } from "@/components/notifications/auto-push-coordinator.jsx";
import { InAppNotificationsCoordinator } from "@/components/notifications/in-app-notifications-coordinator.jsx";
import { SidebarClient } from "@/components/layout/sidebar-client.jsx";
import { BottomNav } from "@/components/layout/bottom-nav.jsx";
import { PermissionsUnavailableNotice } from "@/components/auth/permissions-unavailable-notice.jsx";
import { useWorkspace } from "@/hooks/use-workspace.js";
import { useUserPermissions } from "@/hooks/use-user-permissions.js";
import { useFlags } from "@/hooks/use-flag.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { LoaderCircle } from "lucide-react";

function WorkspaceSwitchOverlay() {
  const { t } = useI18n();
  const { switching, switchingTarget } = useWorkspace();
  if (!switching) return null;
  const targetName = switchingTarget?.nombre
    || (switchingTarget?.tipo === "personal" ? t("workspace.personal") : t("workspace.sala"));
  return (
    <div className="ws-switch-overlay" role="status" aria-live="polite">
      <div className="ws-switch-card">
        <LoaderCircle size={20} className="ws-switch-card-spinner" aria-hidden />
        <div>
          <strong>{t("workspace.switching")}</strong>
          {targetName ? <span>{targetName}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function DashboardLayout() {
  const { permissionsStatus } = useUserPermissions();
  const { flagsStatus } = useFlags();
  const accessUnavailable = permissionsStatus === "unavailable" || flagsStatus === "unavailable";
  const noticeKind = permissionsStatus === "unavailable" ? "permissions" : "flags";
  return (
    <StoreHydration>
      <SyncProvider>
        <ExchangeRateSync />
        <PresenceProvider>
          <OneSignalProvider>
            <div className="app">
              <SidebarClient />
              <div className="main">
                <main><Outlet /></main>
              </div>
              <BottomNav />
              <WorkspaceSwitchOverlay />
              {accessUnavailable ? <PermissionsUnavailableNotice kind={noticeKind} /> : null}
            </div>
            <PushPermissionPrompt />
            <AutoPushCoordinator />
            <InAppNotificationsCoordinator />
          </OneSignalProvider>
        </PresenceProvider>
      </SyncProvider>
    </StoreHydration>
  );
}
