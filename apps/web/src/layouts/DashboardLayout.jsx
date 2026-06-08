import { Outlet } from "react-router-dom";
import { StoreHydration } from "@/components/providers/store-hydration.jsx";
import { SyncProvider } from "@/components/providers/sync-provider.jsx";
import { SidebarClient } from "@/components/layout/sidebar-client.jsx";

export function DashboardLayout() {
  return (
    <StoreHydration>
      <SyncProvider>
        <div className="app">
          <SidebarClient />
          <div className="main">
            <main><Outlet /></main>
          </div>
        </div>
      </SyncProvider>
    </StoreHydration>
  );
}
