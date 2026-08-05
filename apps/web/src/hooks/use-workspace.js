import { useEffect, useMemo, useState, useCallback } from "react";
import { fetchSession, watchSession, notifyAuthChanged } from "@/lib/session-api.js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { emptyDatabase } from "@/lib/storage/types";
import { useDbStore } from "@/stores/db-store";
import { requestSyncRefresh } from "@/lib/sync-refresh.js";
import {
  startDashboardDataRealtime,
  stopDashboardDataRealtime,
} from "@/lib/dashboard-data-realtime.js";

const SALETSE_BRAND = {
  primary: "#1e5eff",
  accent: "#0f2044",
  logo_url: null,
  nombre: "Saletse",
};

let workspaceTransition = { switching: false, target: null };
const workspaceTransitionListeners = new Set();

export function publishWorkspaceTransition(next) {
  workspaceTransition = next;
  workspaceTransitionListeners.forEach((listener) => listener(next));
}

function useWorkspaceTransition() {
  const [transition, setTransition] = useState(workspaceTransition);
  useEffect(() => {
    workspaceTransitionListeners.add(setTransition);
    return () => workspaceTransitionListeners.delete(setTransition);
  }, []);
  return transition;
}

export function applyWorkspaceBrand(brand) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const b = brand || SALETSE_BRAND;
  const primary = b.primary || SALETSE_BRAND.primary;
  const accent = b.accent || SALETSE_BRAND.accent;
  root.style.setProperty("--ws-brand-primary", primary);
  root.style.setProperty("--ws-brand-accent", accent);
  root.style.setProperty("--blue", primary);
  root.style.setProperty("--blue-lt", primary);
  root.style.setProperty("--blue-xlt", `color-mix(in srgb, ${primary} 16%, white)`);
  root.style.setProperty("--blue-glow", `color-mix(in srgb, ${primary} 22%, transparent)`);
  root.style.setProperty("--navy", accent);
  root.style.setProperty("--navy2", accent);
  root.dataset.workspaceBrand = b.nombre || "Saletse";
}

export function useWorkspace() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const transition = useWorkspaceTransition();

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setReady(true);
      return undefined;
    }
    return watchSession((s) => {
      setSession(s);
      setReady(true);
      applyWorkspaceBrand(s?.workspace_activo?.brand);
    });
  }, []);

  const workspaces = useMemo(
    () => (Array.isArray(session?.workspaces) ? session.workspaces : []),
    [session],
  );
  const active = session?.workspace_activo || null;
  const activeId = session?.workspace_activo_id || active?.id || null;

  const switchWorkspace = useCallback(async (workspaceId) => {
    if (!workspaceId || workspaceId === activeId || workspaceTransition.switching) return;
    const target = workspaces.find((workspace) => workspace.id === workspaceId) || null;
    publishWorkspaceTransition({ switching: true, target });
    try {
      const res = await fetch("/api/v1/auth/workspace", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo cambiar de workspace.");
      }

      const nextSession = await fetchSession();
      applyWorkspaceBrand(nextSession?.workspace_activo?.brand);

      // Evitar mezclar datos del workspace anterior
      const prevSettings = useDbStore.getState().db?.settings || {};
      useDbStore.getState().replaceDb({
        ...emptyDatabase(),
        settings: prevSettings,
      });

      notifyAuthChanged();
      window.dispatchEvent(new Event("workspace:changed"));

      const userId = nextSession?.user?.id || nextSession?.profile?.id;
      const nextWorkspaceId = nextSession?.workspace_activo_id || nextSession?.workspace_activo?.id || workspaceId;
      await stopDashboardDataRealtime();
      await requestSyncRefresh({ force: true, reason: "workspace-switch" });
      if (userId) {
        await startDashboardDataRealtime(userId, { workspaceId: nextWorkspaceId, force: true });
      }
    } finally {
      publishWorkspaceTransition({ switching: false, target: null });
    }
  }, [activeId, workspaces]);

  return {
    ready,
    switching: transition.switching,
    switchingTarget: transition.target,
    workspaces,
    active,
    activeId,
    brand: active?.brand || SALETSE_BRAND,
    switchWorkspace,
  };
}
