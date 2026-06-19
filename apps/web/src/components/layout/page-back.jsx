import { Link, useNavigate, useLocation } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";

export function PageBack({
  href,
  fallback = "/",
  onClick,
  label,
  inline = false,
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const text = label ?? t("common.back");

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (href !== undefined) {
      navigate(href);
      return;
    }
    if (location.key !== "default") {
      navigate(-1);
      return;
    }
    navigate(fallback);
  };

  if (href !== undefined && !onClick) {
    const linkBtn = (
      <Link to={href} className="btn btn-ghost btn-sm">
        {text}
      </Link>
    );
    return inline ? linkBtn : <div className="page-back-row">{linkBtn}</div>;
  }

  const btn = (
    <button type="button" className="btn btn-ghost btn-sm" onClick={handleClick}>
      {text}
    </button>
  );
  return inline ? btn : <div className="page-back-row">{btn}</div>;
}
