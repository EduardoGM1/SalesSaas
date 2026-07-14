import { useEffect, useRef } from "react";
import { useDbStore } from "@/stores/db-store";
import { isNonEmptyToolBucket } from "@/lib/tools/tool-bucket-utils";

/**
 * Al salir de una calculadora libre, persiste el estado en pantalla en `db.libre`
 * para que "+ Nuevo cliente" adopte los valores actuales (no una versión anterior).
 */
export function useFlushLibreToolOnLeave({ enabled, tool, getSnapshot, hasChanges }) {
  const getSnapshotRef = useRef(getSnapshot);
  const hasChangesRef = useRef(hasChanges);
  getSnapshotRef.current = getSnapshot;
  hasChangesRef.current = hasChanges;

  useEffect(() => {
    if (!enabled) return undefined;
    return () => {
      if (hasChangesRef.current && !hasChangesRef.current()) return;
      const snap = getSnapshotRef.current?.();
      if (!isNonEmptyToolBucket(snap)) return;
      useDbStore.getState().saveToolBucket(tool, "libre", snap);
    };
  }, [enabled, tool]);
}
