import { useI18n } from "@/hooks/use-i18n.js";
import { notifyAuthChanged } from "@/lib/session-api.js";

/**
 * Fallo de infraestructura al resolver permisos o flags de sala — no es “acceso denegado”.
 * @param {{ variant?: "banner" | "panel", kind?: "permissions" | "flags" }} props
 */
export function PermissionsUnavailableNotice({ variant = "banner", kind = "permissions" }) {
  const { t } = useI18n();
  const retry = () => notifyAuthChanged();
  const titleKey = kind === "flags"
    ? "workspace.flagsUnavailableTitle"
    : "workspace.permissionsUnavailableTitle";
  const bodyKey = kind === "flags"
    ? "workspace.flagsUnavailableBody"
    : "workspace.permissionsUnavailableBody";

  if (variant === "panel") {
    return (
      <div className="perm-unavailable-panel" role="alert">
        <strong>{t(titleKey)}</strong>
        <p>{t(bodyKey)}</p>
        <button type="button" className="btn btn-primary" onClick={retry}>
          {t("workspace.permissionsUnavailableRetry")}
        </button>
      </div>
    );
  }

  return (
    <div className="perm-unavailable-banner" role="alert">
      <div className="perm-unavailable-banner-copy">
        <div className="perm-unavailable-banner-title">{t(titleKey)}</div>
        <div className="perm-unavailable-banner-sub">{t(bodyKey)}</div>
      </div>
      <button type="button" className="btn btn-primary perm-unavailable-banner-btn" onClick={retry}>
        {t("workspace.permissionsUnavailableRetry")}
      </button>
    </div>
  );
}
