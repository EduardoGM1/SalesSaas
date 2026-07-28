import { useEffect, useId, useState } from "react";
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
import { ChevronDown, LogOut } from "lucide-react";
import { WorkspaceBrandMark } from "@/components/layout/workspace-brand-mark.jsx";

function initials(name) {
  const s = String(name || "?").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

function workspaceLabel(ws, t) {
  if (!ws) return "";
  if (ws.tipo === "personal") return ws.nombre || t("workspace.personal");
  return ws.nombre || t("workspace.personal");
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

async function performLeaveSala(t) {
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
}

/** Rail Slack: un ícono por workspace (personal + salas). Solo desktop (sidebar). */
export function WorkspaceRail() {
  const { t } = useI18n();
  const { workspaces, activeId, switchWorkspace, switching, ready } = useWorkspace();

  if (!ready || workspaces.length <= 1) return null;

  return (
    <div className="ws-rail" aria-label={t("workspace.railLabel")}>
      {workspaces.map((ws) => {
        const active = ws.id === activeId;
        const label = workspaceLabel(ws, t);
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
              <WorkspaceBrandMark
                src={ws.logo_url}
                name={label}
                imgClassName="ws-rail-img"
                initialsClassName="ws-rail-initials"
              />
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

/**
 * Selector de workspace (móvil + desktop compacto).
 * En móvil es la única forma de cambiar de sala (el rail vive en el sidebar oculto).
 */
export function WorkspaceSwitcher({ compact = false, className }) {
  const { t } = useI18n();
  const { ready, workspaces, active, activeId, switchWorkspace, switching } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!ready || !active) return null;

  const label = workspaceLabel(active, t);
  const canSwitch = workspaces.length > 1;
  const canLeave = active.tipo === "sala_de_venta";

  const onPick = async (id) => {
    if (id === activeId) {
      setOpen(false);
      return;
    }
    await switchWorkspace(id);
    setOpen(false);
  };

  const onLeave = async () => {
    if (!canLeave || leaving || switching) return;
    if (!await confirmDialog(t("workspace.leaveConfirm"))) return;
    setLeaving(true);
    try {
      await performLeaveSala(t);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("workspace.leave"));
    } finally {
      setLeaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={cn("ws-switcher-trigger", compact && "ws-switcher-trigger--compact", className)}
        onClick={() => setOpen(true)}
        disabled={switching}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
      >
        <span className="ws-switcher-avatar" aria-hidden>
          <WorkspaceBrandMark
            src={active.logo_url}
            name={label}
            imgClassName="ws-switcher-avatar-img"
            initialsClassName="ws-switcher-avatar-initials"
          />
        </span>
        <span className="ws-switcher-copy">
          <span className="ws-switcher-name">{label}</span>
          {active.tipo === "personal" ? (
            <span className="ws-switcher-meta">{t("workspace.personal")}</span>
          ) : active.empresa_nombre ? (
            <span className="ws-switcher-meta">{active.empresa_nombre}</span>
          ) : null}
        </span>
        {(canSwitch || canLeave) && (
          <ChevronDown size={14} className="ws-switcher-chevron" aria-hidden />
        )}
      </button>

      {open && (
        <div className="ws-sheet-root" role="presentation">
          <button
            type="button"
            className="ws-sheet-backdrop"
            aria-label={t("common.cancel")}
            onClick={() => setOpen(false)}
          />
          <div
            className="ws-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="ws-sheet-handle" aria-hidden />
            <div className="ws-sheet-head">
              <h2 id={titleId} className="ws-sheet-title">{t("workspace.switchTitle")}</h2>
              <p className="ws-sheet-sub">{t("workspace.switchSub")}</p>
            </div>
            <ul className="ws-sheet-list">
              {workspaces.map((ws) => {
                const name = workspaceLabel(ws, t);
                const selected = ws.id === activeId;
                return (
                  <li key={ws.id}>
                    <button
                      type="button"
                      className={cn("ws-sheet-item", selected && "ws-sheet-item--active")}
                      disabled={switching}
                      onClick={() => onPick(ws.id)}
                    >
                      <span className="ws-switcher-avatar" aria-hidden>
                        <WorkspaceBrandMark
                          src={ws.logo_url}
                          name={name}
                          imgClassName="ws-switcher-avatar-img"
                          initialsClassName="ws-switcher-avatar-initials"
                        />
                      </span>
                      <span className="ws-sheet-item-copy">
                        <span className="ws-sheet-item-name">{name}</span>
                        <span className="ws-sheet-item-meta">
                          {ws.tipo === "personal"
                            ? t("workspace.personal")
                            : (ws.empresa_nombre || t("workspace.sala"))}
                        </span>
                      </span>
                      {selected && <span className="ws-sheet-check" aria-hidden>✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            {canLeave && (
              <button
                type="button"
                className="ws-sheet-leave"
                disabled={leaving || switching}
                onClick={onLeave}
              >
                <LogOut size={16} aria-hidden />
                {leaving ? t("workspace.leavePending") : t("workspace.leave")}
              </button>
            )}
            <button type="button" className="btn btn-ghost ws-sheet-close" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Chip compacto del workspace activo (desktop subtitle). Abre el switcher. */
export function WorkspaceActiveBadge() {
  const { ready, active, workspaces } = useWorkspace();
  if (!ready || !active) return null;
  if (workspaces.length <= 1 && active.tipo === "personal") {
    return (
      <span className="ws-active-badge" title={active.nombre}>
        {active.nombre}
      </span>
    );
  }
  return <WorkspaceSwitcher compact className="ws-active-badge-switcher" />;
}
