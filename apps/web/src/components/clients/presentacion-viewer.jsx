import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n.js";
import { isIosDevice } from "@/lib/pwa-install.js";

const PRESENTACION_SRC = "/presentacion/";

function canNativeFullscreen(el) {
  if (!el || isIosDevice()) return false;
  return typeof el.requestFullscreen === "function"
    || typeof el.webkitRequestFullscreen === "function";
}

/**
 * Visor embebido de la presentación RH: iframe con carga perezosa
 * (src solo al montar) y pantalla completa nativa o modo alterno iPhone.
 */
export function PresentacionViewer() {
  const { t } = useI18n();
  const shellRef = useRef(null);
  const [src, setSrc] = useState("");
  const [nativeFs, setNativeFs] = useState(false);
  const [pseudoFs, setPseudoFs] = useState(false);
  const isFs = nativeFs || pseudoFs;

  useEffect(() => {
    setSrc(PRESENTACION_SRC);
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      const doc = document;
      setNativeFs(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  useEffect(() => {
    if (!pseudoFs) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setPseudoFs(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [pseudoFs]);

  const enterFs = useCallback(async () => {
    const el = shellRef.current;
    if (!el) return;
    if (canNativeFullscreen(el)) {
      try {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        return;
      } catch {
        /* fallback below */
      }
    }
    setPseudoFs(true);
  }, []);

  const exitFs = useCallback(async () => {
    if (pseudoFs) {
      setPseudoFs(false);
      return;
    }
    const doc = document;
    try {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    } catch {
      /* ignore */
    }
  }, [pseudoFs]);

  const toggleFs = () => {
    if (isFs) void exitFs();
    else void enterFs();
  };

  return (
    <div className="exp-embedded-tool presentacion-viewer-root">
      <div className="page-toolbar page-toolbar--end exp-embedded-toolbar">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={toggleFs}
          data-testid="presentacion-fullscreen-btn"
          aria-pressed={isFs}
        >
          {isFs ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
          <span>
            {isFs
              ? t("exp.presentacion.exitFullscreen")
              : t("exp.presentacion.fullscreen")}
          </span>
        </button>
      </div>
      <div
        ref={shellRef}
        className={`presentacion-viewer-shell${pseudoFs ? " is-pseudo-fs" : ""}`}
        data-testid="presentacion-viewer-shell"
        data-fs-mode={pseudoFs ? "pseudo" : nativeFs ? "native" : "inline"}
      >
        {pseudoFs && (
          <button
            type="button"
            className="btn btn-ghost btn-sm presentacion-viewer-fs-exit"
            onClick={() => void exitFs()}
            data-testid="presentacion-pseudo-exit"
          >
            <Minimize2 size={16} aria-hidden />
            <span>{t("exp.presentacion.exitFullscreen")}</span>
          </button>
        )}
        {src ? (
          <iframe
            className="presentacion-viewer-iframe"
            title={t("exp.tool.presentacion")}
            src={src}
            loading="lazy"
            referrerPolicy="same-origin"
            data-testid="presentacion-iframe"
          />
        ) : (
          <div className="presentacion-viewer-placeholder" aria-busy="true">
            {t("exp.presentacion.loading")}
          </div>
        )}
      </div>
    </div>
  );
}
