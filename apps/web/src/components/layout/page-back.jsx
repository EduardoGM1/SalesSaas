import { Link } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";

export function PageBack({
  href = "/",
  onClick,
  label,
  inline = false,
}) {
  const { t } = useI18n();
  const text = label ?? t("common.back");

  if (onClick) {
    const btn = (
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClick}>
        {text}
      </button>
    );
    return inline ? btn : <div className="page-back-row">{btn}</div>;
  }

  const btn = (
    <Link to={href} className="btn btn-ghost btn-sm">
      {text}
    </Link>
  );
  return inline ? btn : <div className="page-back-row">{btn}</div>;
}
