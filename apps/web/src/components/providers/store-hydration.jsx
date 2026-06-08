
import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";

export function StoreHydration({ children }: { children }) {
  const hydrate = useDbStore((s) => s.hydrate);
  const setHydrated = useAppStore((s) => s.setHydrated);

  useEffect(() => {
    const now = new Date();
    useAppStore.getState().setCalMonth(now.getFullYear(), now.getMonth());
    hydrate();
    setHydrated(true);
  }, [hydrate, setHydrated]);

  return <>{children}</>;
}
