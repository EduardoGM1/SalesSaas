import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";
import { confirmDialog } from "@/lib/confirm";

/**
 * Botón global «← Volver» (SDD-02).
 * Flecha + texto juntos por defecto; también sirve para acciones del mismo estilo (ej. Limpiar) con showIcon={false}.
 */
export function PageBack({
  href,
  fallback = "/",
  onClick,
  label,
  inline = false,
  hasUnsavedChanges = false,
  unsavedMessage,
  className = "",
  showIcon = true,
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const text = label ?? t("common.back");
  // common.back ya incluye «← » en algunos catálogos; mostramos flecha Lucide + palabra Volver.
  const visibleLabel = String(text).replace(/^←\s*/, "").trim() || t("common.backWord");

  const confirmIfNeeded = async () => {
    const dirty = typeof hasUnsavedChanges === "function"
      ? Boolean(hasUnsavedChanges())
      : Boolean(hasUnsavedChanges);
    if (!dirty) return true;
    return confirmDialog(unsavedMessage || t("common.unsavedConfirm"));
  };

  const goBack = async () => {
    if (!(await confirmIfNeeded())) return;

    if (onClick) {
      onClick();
      return;
    }
    if (href !== undefined) {
      navigate(href);
      return;
    }
    if (location.key !== "default" && typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(fallback);
  };

  const classes = ["page-back-btn", className].filter(Boolean).join(" ");
  const content = (
    <>
      {showIcon ? <ArrowLeft size={18} strokeWidth={2.25} aria-hidden="true" /> : null}
      <span>{visibleLabel}</span>
    </>
  );

  if (href !== undefined && !onClick && !hasUnsavedChanges) {
    const linkBtn = (
      <Link to={href} className={classes}>
        {content}
      </Link>
    );
    return inline ? linkBtn : <div className="page-back-row">{linkBtn}</div>;
  }

  const btn = (
    <button type="button" className={classes} onClick={() => void goBack()}>
      {content}
    </button>
  );
  return inline ? btn : <div className="page-back-row">{btn}</div>;
}
