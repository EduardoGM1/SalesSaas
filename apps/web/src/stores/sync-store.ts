/** Shim legacy: la implementación vive en modulos/sync. */
export { useSyncStore } from "@/modulos/sync/store.js";
export type SyncStatus = "disabled" | "loading" | "syncing" | "saved" | "offline" | "error";
