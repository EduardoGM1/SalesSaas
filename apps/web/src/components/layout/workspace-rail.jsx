import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, LoaderCircle, LogOut } from "lucide-react";
import { WorkspaceBrandMark } from "@/components/layout/workspace-brand-mark.jsx";
import { publishWorkspaceTransition, useWorkspace } from "@/hooks/use-workspace.js";
import { workspaceIconUrl } from "@/lib/workspace-logo.js";
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

function workspaceLabel(workspace, t) {
  return workspace?.nombre || (workspace?.tipo === "personal" ? t("workspace.personal") : t("workspace.sala"));
}

function workspaceType(workspace, t) {
  if (workspace?.tipo === "personal") return t("workspace.personal");
  return t("workspace.sala");
}

async function leaveActiveSala() {
  const response = await fetch("/api/v1/workspace/leave", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudo abandonar la sala.");
  return payload.data ?? payload;
}

async function performLeaveSala(t) {
  publishWorkspaceTransition({ switching: true, target: null });
  try {
    await leaveActiveSala();
    const previousSettings = useDbStore.getState().db?.settings || {};
    useDbStore.getState().replaceDb({ ...emptyDatabase(), settings: previousSettings });
    notifyAuthChanged();
    const nextSession = await fetchSession();
    window.dispatchEvent(new Event("workspace:changed"));
    await stopDashboardDataRealtime();
    await requestSyncRefresh({ force: true, reason: "workspace-leave" });
    const userId = nextSession?.user?.id || nextSession?.profile?.id;
    const workspaceId = nextSession?.workspace_activo_id || nextSession?.workspace_activo?.id || null;
    if (userId) await startDashboardDataRealtime(userId, { workspaceId, force: true });
    toast.success(t("workspace.leaveOk"));
  } finally {
    publishWorkspaceTransition({ switching: false, target: null });
  }
}

/**
 * Hoja modal para cambiar de workspace o abandonar la sala activa.
 * Reutilizada por el rail de desktop y por el avatar del header móvil.
 */
export function WorkspaceSheet({ open, onClose }) {
  const { t } = useI18n();
  const { ready, workspaces, active, activeId, switchWorkspace, switching } = useWorkspace();
  const [leaving, setLeaving] = useState(false);
  const firstOptionRef = useRef(null);
  const titleId = useId();
  const options = useMemo(
    () => workspaces.filter((workspace) => workspace.id !== activeId),
    [activeId, workspaces],
  );

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => firstOptionRef.current?.focus(), 0);
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || !ready || !active) return null;

  const activeName = workspaceLabel(active, t);
  const activeType = workspaceType(active, t);

  const onPick = async (workspace) => {
    if (switching || workspace.id === activeId) return;
    onClose();
    try {
      await switchWorkspace(workspace.id);
      toast.success(t("workspace.switchComplete", { name: workspaceLabel(workspace, t) }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("workspace.switchError"));
    }
  };

  const onLeave = async () => {
    if (active.tipo !== "sala_de_venta" || leaving || switching) return;
    if (!await confirmDialog(t("workspace.leaveConfirm"))) return;
    setLeaving(true);
    try {
      await performLeaveSala(t);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("workspace.leave"));
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="ws-sheet-root" role="presentation">
      <button type="button" className="ws-sheet-backdrop" aria-label={t("common.cancel")} onClick={onClose} />
      <section className="ws-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ws-sheet-handle" aria-hidden />
        <header className="ws-sheet-active">
          <span className="ws-switcher-avatar" aria-hidden>
            <WorkspaceBrandMark
              src={workspaceIconUrl(active)}
              name={activeName}
              imgClassName="ws-switcher-avatar-img"
              initialsClassName="ws-switcher-avatar-initials"
            />
          </span>
          <div>
            <span className="ws-sheet-kicker">{t("workspace.active")}</span>
            <h2 id={titleId} className="ws-sheet-title">{activeName}</h2>
            <p className="ws-sheet-sub">{activeType}{active.empresa_nombre ? ` · ${active.empresa_nombre}` : ""}</p>
          </div>
        </header>

        {options.length ? (
          <div className="ws-sheet-options">
            <span className="ws-sheet-options-label">{t("workspace.available")}</span>
            <ul className="ws-sheet-list">
              {options.map((workspace, index) => {
                const name = workspaceLabel(workspace, t);
                return (
                  <li key={workspace.id}>
                    <button
                      ref={index === 0 ? firstOptionRef : undefined}
                      type="button"
                      className="ws-sheet-item"
                      disabled={switching}
                      onClick={() => void onPick(workspace)}
                    >
                      <span className="ws-switcher-avatar" aria-hidden>
                        <WorkspaceBrandMark
                          src={workspaceIconUrl(workspace)}
                          name={name}
                          imgClassName="ws-switcher-avatar-img"
                          initialsClassName="ws-switcher-avatar-initials"
                        />
                      </span>
                      <span className="ws-sheet-item-copy">
                        <span className="ws-sheet-item-name">{name}</span>
                        <span className="ws-sheet-item-meta">
                          {workspaceType(workspace, t)}
                          {workspace.empresa_nombre ? ` · ${workspace.empresa_nombre}` : ""}
                        </span>
                      </span>
                      <ChevronDown size={14} className="ws-sheet-item-arrow" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {active.tipo === "sala_de_venta" ? (
          <button type="button" className="ws-sheet-leave" disabled={leaving || switching} onClick={() => void onLeave()}>
            <LogOut size={16} aria-hidden />
            {leaving ? t("workspace.leavePending") : t("workspace.leave")}
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost ws-sheet-close" onClick={onClose}>{t("common.cancel")}</button>
      </section>
    </div>
  );
}

/** Selector de workspace del sidebar (desktop). */
export function WorkspaceRail({ className }) {
  const { t } = useI18n();
  const { ready, workspaces, active, activeId, switching } = useWorkspace();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const options = useMemo(
    () => workspaces.filter((workspace) => workspace.id !== activeId),
    [activeId, workspaces],
  );

  if (!ready || !active) return null;

  const activeName = workspaceLabel(active, t);
  const activeType = workspaceType(active, t);
  const canOpen = options.length > 0 || active.tipo === "sala_de_venta";
  const triggerTitle = canOpen
    ? `${activeName} · ${activeType}`
    : `${activeName} · ${activeType}. ${t("workspace.noOtherWorkspace")}`;

  const closeMenu = () => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  return (
    <div className={cn("ws-rail", className)}>
      <button
        ref={triggerRef}
        type="button"
        className={cn("ws-rail-trigger", switching && "is-switching")}
        title={triggerTitle}
        aria-label={`${activeName}, ${activeType}. ${canOpen ? t("workspace.switchTitle") : t("workspace.noOtherWorkspace")}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={switching || !canOpen}
        onClick={() => setOpen(true)}
      >
        <span className="ws-rail-trigger-avatar" aria-hidden>
          {switching ? (
            <LoaderCircle size={17} className="ws-rail-spinner" />
          ) : (
            <WorkspaceBrandMark
              src={workspaceIconUrl(active)}
              name={activeName}
              imgClassName="ws-rail-img"
              initialsClassName="ws-rail-initials"
            />
          )}
        </span>
        <span className="ws-rail-trigger-copy">
          <strong>{activeName}</strong>
          <span>{activeType}</span>
        </span>
        {canOpen ? <ChevronDown size={13} className="ws-rail-trigger-chevron" aria-hidden /> : null}
      </button>

      <WorkspaceSheet open={open} onClose={closeMenu} />
    </div>
  );
}
