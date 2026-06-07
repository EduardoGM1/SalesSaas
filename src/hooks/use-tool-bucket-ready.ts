import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";

/** Espera hidratación local y, en modo cliente, a que el expediente exista en el store. */
export function useToolBucketReady(clientId?: string) {
  const hydrated = useAppStore((s) => s.hydrated);
  const client = useDbStore((s) => (clientId ? s.db.clients[clientId] : undefined));
  const mode = clientId ? ("client" as const) : ("libre" as const);
  const ready = hydrated && (mode === "libre" || !!client);
  return { ready, mode };
}
