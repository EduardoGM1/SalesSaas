/**
 * Sync / storage / outbox — web y API.
 * Las claves sts4_* y los paths HTTP no se renombran.
 * La UI React sale por provider.js; lo puro por fachada-node.js.
 */
export { SyncProvider } from "./provider.js";
export { useSyncStore } from "./store.js";
export type { SyncStatus } from "./ui/sync-store";
