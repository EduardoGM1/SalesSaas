import { create } from "zustand";

export type SyncStatus = "disabled" | "loading" | "syncing" | "saved" | "offline" | "error";

interface SyncState {
  status: SyncStatus;
  lastError: string | null;
  lastSyncedAt: number | null;
  setStatus: (status: SyncStatus, error?: string | null) => void;
  setSynced: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: "disabled",
  lastError: null,
  lastSyncedAt: null,
  setStatus: (status, error = null) => set({ status, lastError: error }),
  setSynced: () => set({ status: "saved", lastError: null, lastSyncedAt: Date.now() }),
}));
