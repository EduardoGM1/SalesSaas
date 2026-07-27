import { useWorkspace } from "@/hooks/use-workspace.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { cn } from "@/lib/utils";

function initials(name) {
  const s = String(name || "?").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
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

/** Chip con nombre del workspace activo (header). */
export function WorkspaceActiveBadge() {
  const { t } = useI18n();
  const { active, ready } = useWorkspace();
  if (!ready || !active) return null;
  const label = active.tipo === "personal"
    ? `${t("workspace.personal")} · ${active.nombre}`
    : active.nombre;
  return (
    <span className="ws-active-badge" title={label}>
      {label}
    </span>
  );
}
