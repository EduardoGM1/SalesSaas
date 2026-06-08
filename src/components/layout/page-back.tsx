"use client";

import { useRouter } from "next/navigation";

export function PageBack({
  label = "← Volver",
  href,
  onClick,
}: {
  label?: string;
  href?: string;
  onClick?: () => void;
}) {
  const router = useRouter();
  const handleClick = () => {
    if (onClick) onClick();
    else if (href) router.push(href);
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
