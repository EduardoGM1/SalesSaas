import { Sidebar } from "@/components/layout/sidebar";
import { StoreHydration } from "@/components/providers/store-hydration";
import { SyncProvider } from "@/components/providers/sync-provider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreHydration>
      <SyncProvider>
        <div className="flex min-h-screen bg-bg">
          <Sidebar />
          <main className="ml-0 flex min-h-screen flex-1 flex-col lg:ml-16">{children}</main>
        </div>
      </SyncProvider>
    </StoreHydration>
  );
}
