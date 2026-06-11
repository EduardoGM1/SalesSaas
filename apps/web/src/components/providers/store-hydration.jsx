
import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";
import { getLang } from "@/lib/i18n.js";

export function StoreHydration({ children }) {
  const hydrate = useDbStore((s) => s.hydrate);
  const setHydrated = useAppStore((s) => s.setHydrated);
  const language = useDbStore((s) => getLang(s.db.settings));

  useEffect(() => {
    const now = new Date();
    useAppStore.getState().setCalMonth(now.getFullYear(), now.getMonth());
    hydrate();
    setHydrated(true);
  }, [hydrate, setHydrated]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <>{children}</>;
}
