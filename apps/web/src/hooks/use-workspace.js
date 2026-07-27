import { useEffect, useMemo, useState, useCallback } from "react";
import { fetchSession, watchSession, notifyAuthChanged } from "@/lib/session-api.js";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const SALETSE_BRAND = {
  primary: "#1e5eff",
  accent: "#0f2044",
  logo_url: null,
  nombre: "Saletse",
};

export function applyWorkspaceBrand(brand) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const b = brand || SALETSE_BRAND;
  root.style.setProperty("--ws-brand-primary", b.primary || SALETSE_BRAND.primary);
  root.style.setProperty("--ws-brand-accent", b.accent || SALETSE_BRAND.accent);
  root.dataset.workspaceBrand = b.nombre || "Saletse";
}

export function useWorkspace() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [switching, setSwitching] = useState(false);

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
    if (!workspaceId || workspaceId === activeId) return;
    setSwitching(true);
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
      notifyAuthChanged();
      await fetchSession();
      // Forzar recarga de stores scoped
      window.dispatchEvent(new Event("workspace:changed"));
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } finally {
      setSwitching(false);
    }
  }, [activeId]);

  return {
    ready,
    switching,
    workspaces,
    active,
    activeId,
    brand: active?.brand || SALETSE_BRAND,
    switchWorkspace,
  };
}
