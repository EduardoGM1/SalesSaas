import { useEffect, useState } from "react";

function initialsFrom(name) {
  const s = String(name || "?").trim();
  if (!s) return "?";
  return s.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

/**
 * Logo de workspace con fallback a iniciales si la URL falla (hotlink, 404, etc.).
 */
export function WorkspaceBrandMark({
  src,
  name,
  className,
  imgClassName,
  initialsClassName,
  alt = "",
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImg = Boolean(src) && !failed;

  if (showImg) {
    return (
      <img
        src={src}
        alt={alt}
        className={imgClassName || className}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={initialsClassName || className} aria-hidden={alt ? undefined : true}>
      {initialsFrom(name)}
    </span>
  );
}
