import { useNavigate } from "react-router-dom";

export function PageBack({
  label = "← Volver",
  href = "/",
  onClick,
}) {
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
        {label}
      </button>
    </div>
  );
}
