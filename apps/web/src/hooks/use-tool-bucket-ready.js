import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";

/** Espera hidratación local y, en modo cliente, a que el expediente exista en el store. */
export function useToolBucketReady(clientId?) {
  const hydrated = useAppStore((s) => s.hydrated);
  const client = useDbStore((s) => (clientId ? s.db.clients[clientId] : undefined), shallow);
  const mode = clientId ? ("client") : ("libre");
  const ready = hydrated && (mode === "libre" || !!client);
  return { ready, mode };
}
