import { Outlet } from "react-router-dom";
import { StoreHydration } from "@/components/providers/store-hydration.jsx";
import { SyncProvider } from "@/components/providers/sync-provider.jsx";
import { ExchangeRateSync } from "@/components/providers/exchange-rate-sync.jsx";
import { PresenceProvider } from "@/components/providers/presence-provider.jsx";
import { OneSignalProvider } from "@/components/providers/onesignal-provider.jsx";
import { PushPermissionPrompt } from "@/components/notifications/push-permission-prompt.jsx";
import { SidebarClient } from "@/components/layout/sidebar-client.jsx";

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
            </div>
            <PushPermissionPrompt />
          </OneSignalProvider>
        </PresenceProvider>
      </SyncProvider>
    </StoreHydration>
  );
}
