import { SidebarClient } from "@/components/layout/sidebar-client";
import { StoreHydration } from "@/components/providers/store-hydration";
import { SyncProvider } from "@/components/providers/sync-provider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreHydration>
      <SyncProvider>
        <div className="app">
          <SidebarClient />
          <div className="main">
            <main>{children}</main>
          </div>
        </div>
      </SyncProvider>
    </StoreHydration>
  );
}
