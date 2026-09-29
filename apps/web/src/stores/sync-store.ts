import { create } from "zustand";
import { getOutboxState, isOutboxDirty } from "@/lib/sync-outbox.js";

export type SyncStatus = "disabled" | "loading" | "syncing" | "saved" | "offline" | "error";

interface SyncState {
  status: SyncStatus;
  lastError: string | null;
  lastSyncedAt: number | null;
  /** Outbox durable: hay cambios locales pendientes de PUT /sync. */
  pendingOutbound: boolean;
  /** Hay un expediente abierto cuyo tool respondió 403. No es un fallo de sync. */
  toolEditDenied: boolean;
  setStatus: (status: SyncStatus, error?: string | null) => void;
  setToolEditDenied: (denied: boolean) => void;
  setSynced: () => void;
  setPendingOutbound: (pending: boolean) => void;
  refreshPendingFromOutbox: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: "disabled",
  lastError: null,
  lastSyncedAt: null,
  pendingOutbound: typeof window !== "undefined" ? isOutboxDirty() : false,
  toolEditDenied: false,
  setStatus: (status, error = null) => set({ status, lastError: error }),
  setToolEditDenied: (denied) => set({ toolEditDenied: denied }),
  setSynced: () =>
    set({
      status: "saved",
      lastError: null,
      lastSyncedAt: Date.now(),
      pendingOutbound: isOutboxDirty(),
    }),
  setPendingOutbound: (pending) => set({ pendingOutbound: pending }),
  refreshPendingFromOutbox: () => {
    const s = getOutboxState();
    set({ pendingOutbound: s.dirty });
  },
}));
