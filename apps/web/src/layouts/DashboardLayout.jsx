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
import { useWorkspace } from "@/hooks/use-workspace.js";
import { useI18n } from "@/hooks/use-i18n.js";

function WorkspaceSwitchOverlay() {
  const { t } = useI18n();
  const { switching } = useWorkspace();
  if (!switching) return null;
  return (
    <div className="ws-switch-overlay" role="status" aria-live="polite">
      <div className="ws-switch-card">{t("workspace.switching")}</div>
    </div>
  );
}

export function DashboardLayout() {
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
