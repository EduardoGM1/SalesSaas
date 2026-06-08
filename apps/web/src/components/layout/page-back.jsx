
import {  useNavigate  } from "react-router-dom";

export function PageBack({
  label = "← Volver",
  href,
  onClick,
}: {
  label?;
  href?;
  onClick?: () => void;
}) {
  const navigate = useNavigate();
  const handleClick = () => {
    if (onClick) onClick();
    else if (href) navigate(href);
    else router.back();
  };
  return (
    <div className="page-back-row">
      <button type="button" className="btn btn-ghost btn-sm" onClick={handleClick}>
        {label}
      </button>
    </div>
  );
}
