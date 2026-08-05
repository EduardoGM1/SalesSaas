/**
 * Suspende reconcile outbound y cloud-persist mientras se aplica data remota.
 */
import { suspendCloudPersist } from "@/lib/cloud-persist-bridge.js";

let depth = 0;

export function runWithoutOutboundSync(fn) {
  depth += 1;
  if (depth === 1) suspendCloudPersist(true);
  try {
    return fn();
  } finally {
    depth -= 1;
    if (depth === 0) suspendCloudPersist(false);
  }
}

export function isOutboundSyncSuspended() {
  return depth > 0;
}
