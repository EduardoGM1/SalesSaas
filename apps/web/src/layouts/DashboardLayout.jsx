import { Outlet } from "react-router-dom";
import { StoreHydration } from "@/components/providers/store-hydration.jsx";
import { SyncProvider } from "@/components/providers/sync-provider.jsx";
import { ExchangeRateSync } from "@/components/providers/exchange-rate-sync.jsx";
import { PresenceProvider } from "@/components/providers/presence-provider.jsx";
import { OneSignalProvider } from "@/components/providers/onesignal-provider.jsx";
import { PushPermissionPrompt } from "@/components/notifications/push-permission-prompt.jsx";
import { AutoPushCoordinator } from "@/components/notifications/auto-push-coordinator.jsx";
import { SidebarClient } from "@/components/layout/sidebar-client.jsx";
import { BottomNav } from "@/components/layout/bottom-nav.jsx";

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
            </div>
            <PushPermissionPrompt />
            <AutoPushCoordinator />
          </OneSignalProvider>
        </PresenceProvider>
      </SyncProvider>
    </StoreHydration>
  );
}
