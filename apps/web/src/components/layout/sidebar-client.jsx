import { lazy, Suspense } from "react";

const Sidebar = lazy(() => import("@/components/layout/sidebar.jsx").then((m) => ({ default: m.Sidebar })));

export function SidebarClient() {
  return (
    <Suspense fallback={null}>
      <Sidebar />
    </Suspense>
  );
}
