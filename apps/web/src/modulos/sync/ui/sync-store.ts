import { create } from "zustand";
import {
  getOutboxBlockedCount,
  getOutboxState,
  isOutboxDirty,
} from "../servicios/sync-outbox.js";

export type SyncStatus = "disabled" | "loading" | "syncing" | "saved" | "offline" | "error";

interface SyncState {
  status: SyncStatus;
  lastError: string | null;
  lastSyncedAt: number | null;
  /** Outbox durable: hay cambios locales pendientes de PUT /sync. */
  pendingOutbound: boolean;
  /** Filas con rechazo permanente (pendientes sin subir). */
  blockedOutboundCount: number;
  /** Hay un expediente abierto cuyo tool respondió 403. No es un fallo de sync. */
  toolEditDenied: boolean;
  setStatus: (status: SyncStatus, error?: string | null) => void;
  setToolEditDenied: (denied: boolean) => void;
  setSynced: () => void;
  setPendingOutbound: (pending: boolean) => void;
  refreshPendingFromOutbox: () => void;
}

function readPendingFlags() {
  if (typeof window === "undefined") {
    return { pendingOutbound: false, blockedOutboundCount: 0 };
  }
  const s = getOutboxState();
  return {
    pendingOutbound: s.dirty || s.blocked.length > 0,
    blockedOutboundCount: s.blocked.length,
  };
}

export const useSyncStore = create<SyncState>((set) => ({
  status: "disabled",
  lastError: null,
  lastSyncedAt: null,
  pendingOutbound: typeof window !== "undefined" ? isOutboxDirty() : false,
  blockedOutboundCount: typeof window !== "undefined" ? getOutboxBlockedCount() : 0,
  toolEditDenied: false,
  setStatus: (status, error = null) => set({ status, lastError: error }),
  setToolEditDenied: (denied) => set({ toolEditDenied: denied }),
  setSynced: () =>
    set({
      status: "saved",
      lastError: null,
      lastSyncedAt: Date.now(),
      ...readPendingFlags(),
    }),
  setPendingOutbound: (pending) => set({ pendingOutbound: pending }),
  refreshPendingFromOutbox: () => {
    set(readPendingFlags());
  },
}));
