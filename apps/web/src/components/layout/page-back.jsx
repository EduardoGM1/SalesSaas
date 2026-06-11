import { useNavigate } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";

export function PageBack({
  href = "/",
  onClick,
  label,
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
  return (
    <div className="page-back-row">
      <button type="button" className="btn btn-ghost btn-sm" onClick={handleClick}>
        {label ?? t("common.back")}
      </button>
    </div>
  );
}
