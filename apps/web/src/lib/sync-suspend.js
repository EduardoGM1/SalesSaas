/**
 * Suspende el reconcile outbound del SyncProvider mientras se aplica data remota
 * (evita el eco: Realtime → saveToolBucket → reconcile → otro UPDATE).
 */
let depth = 0;

export function runWithoutOutboundSync(fn) {
  depth += 1;
  try {
    return fn();
  } finally {
    depth -= 1;
  }
}

export function isOutboundSyncSuspended() {
  return depth > 0;
}
