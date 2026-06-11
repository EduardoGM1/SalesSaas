import { useNavigate } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";

export function PageBack({
  href = "/",
  onClick,
  label,
  inline = false,
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    navigate(href);
  };
  const btn = (
    <button type="button" className="btn btn-ghost btn-sm" onClick={handleClick}>
      {label ?? t("common.back")}
    </button>
  );
  if (inline) return btn;
  return <div className="page-back-row">{btn}</div>;
}
