import { useWorkspace } from "@/hooks/use-workspace.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { cn } from "@/lib/utils";
import { confirmDialog } from "@/lib/confirm";
import { toast } from "@/lib/toast";
import { emptyDatabase } from "@/lib/storage/types";
import { useDbStore } from "@/stores/db-store";
import { requestSyncRefresh } from "@/lib/sync-refresh.js";
import { fetchSession, notifyAuthChanged } from "@/lib/session-api.js";
import {
  startDashboardDataRealtime,
  stopDashboardDataRealtime,
} from "@/lib/dashboard-data-realtime.js";
import { useState } from "react";

function initials(name) {
  const s = String(name || "?").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

async function leaveActiveSala() {
  const res = await fetch("/api/v1/workspace/leave", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "No se pudo abandonar la sala.");
  return body.data ?? body;
}

/** Rail Slack: un ícono por workspace (personal + salas). */
export function WorkspaceRail() {
  const { t } = useI18n();
  const { workspaces, activeId, switchWorkspace, switching, ready } = useWorkspace();

  if (!ready || workspaces.length <= 1) return null;

  return (
    <div className="ws-rail" aria-label={t("workspace.railLabel")}>
      {workspaces.map((ws) => {
        const active = ws.id === activeId;
        const label = ws.tipo === "personal"
          ? (ws.nombre || t("workspace.personal"))
          : ws.nombre;
        return (
          <button
            key={ws.id}
            type="button"
            className={cn("ws-rail-btn", active && "ws-rail-btn--active")}
            title={label}
            aria-label={label}
            aria-current={active ? "true" : undefined}
            disabled={switching}
            onClick={() => switchWorkspace(ws.id)}
          >
            {ws.logo_url ? (
              <img src={ws.logo_url} alt="" className="ws-rail-img" />
            ) : (
              <span className="ws-rail-initials">{initials(label)}</span>
            )}
            {ws.tipo === "personal" && <span className="ws-rail-dot" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/** Chip con nombre del workspace activo (header) + abandonar sala. */
export function WorkspaceActiveBadge() {
  const { t } = useI18n();
  const { active, ready, switching } = useWorkspace();
  const [leaving, setLeaving] = useState(false);
  if (!ready || !active) return null;
  const label = active.tipo === "personal"
    ? `${t("workspace.personal")} · ${active.nombre}`
    : active.nombre;

  const onLeave = async () => {
    if (active.tipo !== "sala_de_venta" || leaving || switching) return;
    if (!await confirmDialog(t("workspace.leaveConfirm"))) return;
    setLeaving(true);
    try {
      await leaveActiveSala();
      const prevSettings = useDbStore.getState().db?.settings || {};
      useDbStore.getState().replaceDb({ ...emptyDatabase(), settings: prevSettings });
      notifyAuthChanged();
      const next = await fetchSession();
      window.dispatchEvent(new Event("workspace:changed"));
      await stopDashboardDataRealtime();
      await requestSyncRefresh({ force: true, reason: "workspace-leave" });
      const userId = next?.user?.id || next?.profile?.id;
      if (userId) await startDashboardDataRealtime(userId);
      toast.success(t("workspace.leaveOk"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("workspace.leave"));
    } finally {
      setLeaving(false);
    }
  };

  return (
    <span className="ws-active-badge-wrap">
      <span className="ws-active-badge" title={label}>
        {label}
      </span>
      {active.tipo === "sala_de_venta" && (
        <button
          type="button"
          className="btn btn-ghost btn-sm ws-leave-btn"
          disabled={leaving || switching}
          onClick={onLeave}
        >
          {leaving ? t("workspace.leavePending") : t("workspace.leave")}
        </button>
      )}
    </span>
  );
}
