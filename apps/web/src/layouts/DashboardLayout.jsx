import { Outlet } from "react-router-dom";
import { StoreHydration } from "@/components/providers/store-hydration.jsx";
import { SyncProvider } from "@/components/providers/sync-provider.jsx";
import { ExchangeRateSync } from "@/components/providers/exchange-rate-sync.jsx";
import { PresenceProvider } from "@/components/providers/presence-provider.jsx";
import { SidebarClient } from "@/components/layout/sidebar-client.jsx";

export function DashboardLayout() {
  return (
    <StoreHydration>
      <SyncProvider>
        <ExchangeRateSync />
        <PresenceProvider>
          <div className="app">
            <SidebarClient />
            <div className="main">
              <main><Outlet /></main>
            </div>
          </div>
        </PresenceProvider>
      </SyncProvider>
    </StoreHydration>
  );
}
