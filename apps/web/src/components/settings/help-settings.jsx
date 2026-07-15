import { useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, LayoutGrid, Smartphone, Globe2, Pencil, Paperclip, CloudUpload, ShieldCheck, X, ChevronDown, ChevronRight } from "lucide-react";
import {
  SUPPORT_REQUEST_TYPES,
  SUPPORT_SITE_MAP,
  findSupportAreaOption,
} from "@salesapp/shared/support/site-map.js";
import { isStandaloneApp, isAndroidDevice, isIosDevice } from "@/lib/pwa-install.js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";
import { supportApi } from "@/lib/support-api.js";
import { compressSupportScreenshot, SUPPORT_MAX_SOURCE_BYTES } from "@/lib/support-image.js";

const MAX_CHARS = 1000;
const MAX_FILE_BYTES = SUPPORT_MAX_SOURCE_BYTES;
const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp";

function detectPlatform() {
  if (typeof window === "undefined") return "web";
  if (isStandaloneApp() || isAndroidDevice() || isIosDevice()) return "mobile";
  return "web";
}

function typeLabel(type, lang) {
  return lang === "en" ? type.labelEn : type.labelEs;
}

function moduleLabel(mod, lang) {
  return lang === "en" ? mod.labelEn : mod.labelEs;
}

function leafLabel(leaf, lang) {
  return lang === "en" ? leaf.labelEn : leaf.labelEs;
}

function AppAreaPicker({ value, onChange, lang, t }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const rootRef = useRef(null);
  const selected = findSupportAreaOption(value, lang);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  const openPicker = () => {
    setOpen(true);
    // Al abrir, expandir solo el módulo de la selección actual (sigue pudiendo cerrarse).
    if (selected?.moduleId) {
      setExpanded(new Set([selected.moduleId]));
    }
  };

  const toggleModule = (moduleId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  const pick = (id) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className="help-area-picker" ref={rootRef}>
      <button
        type="button"
        id="help-app-area"
        className={`help-area-trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <span className={selected ? "help-area-trigger-value" : "help-area-trigger-placeholder"}>
          {selected ? selected.pathLabel : t("settings.help.appAreaPlaceholder")}
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>

      {selected && (
        <p className="help-area-path" aria-live="polite">
          {selected.pathLabel}
        </p>
      )}

      {open && (
        <div className="help-area-panel" role="listbox" aria-label={t("settings.help.appArea")}>
          <div className="help-area-panel-scroll">
            {SUPPORT_SITE_MAP.map((mod) => {
              const isOpen = expanded.has(mod.moduleId);
              return (
                <div key={mod.moduleId} className="help-area-module">
                  <button
                    type="button"
                    className="help-area-module-btn"
                    onClick={() => toggleModule(mod.moduleId)}
                    aria-expanded={isOpen}
                  >
                    <ChevronRight
                      size={16}
                      className={`help-area-chevron${isOpen ? " is-open" : ""}`}
                      aria-hidden="true"
                    />
                    <span>{moduleLabel(mod, lang)}</span>
                  </button>
                  {isOpen && (
                    <ul className="help-area-leaves">
                      {mod.children.map((child) => {
                        const path = `${moduleLabel(mod, lang)} > ${leafLabel(child, lang)}`;
                        const active = child.id === value;
                        return (
                          <li key={child.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={active}
                              className={`help-area-leaf${active ? " is-active" : ""}`}
                              onClick={() => pick(child.id)}
                            >
                              {leafLabel(child, lang)}
                              <span className="help-area-leaf-path">{path}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function HelpSettings() {
  const { t, lang } = useI18n();
  const fileRef = useRef(null);
  const detected = useMemo(() => detectPlatform(), []);

  const [requestType, setRequestType] = useState("problem");
  const [appArea, setAppArea] = useState("clientes_expediente");
  const [requestTypeOther, setRequestTypeOther] = useState("");
  const [appAreaOther, setAppAreaOther] = useState("");
  const [platform, setPlatform] = useState(detected);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pickFile = (next) => {
    if (!next) {
      setFile(null);
      return;
    }
    if (!ACCEPT.split(",").includes(next.type) && !/\.(png|jpe?g|webp)$/i.test(next.name)) {
      toast.error(t("settings.help.fileTypeError"));
      return;
    }
    if (next.size > MAX_FILE_BYTES) {
      toast.error(t("settings.help.fileSizeError"));
      return;
    }
    setFile(next);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) pickFile(dropped);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = description.trim();
    if (text.length < 10) {
      toast.error(t("settings.help.descTooShort"));
      return;
    }
    if (text.length > MAX_CHARS) {
      toast.error(t("settings.help.descTooLong"));
      return;
    }
    if (requestType === "other" && !requestTypeOther.trim()) {
      toast.error(t("settings.help.otherTypeRequired"));
      return;
    }
    if (appArea === "otro" && !appAreaOther.trim()) {
      toast.error(t("settings.help.otherAreaRequired"));
      return;
    }

    const areaOption = findSupportAreaOption(appArea, lang);
    let pathLabel = areaOption?.pathLabel || appArea;
    if (appArea === "otro" && appAreaOther.trim()) {
      pathLabel = `${pathLabel}: ${appAreaOther.trim()}`;
    }

    setPending(true);
    try {
      if (!isSupabaseConfigured()) {
        throw new Error(t("settings.help.requiresCloud"));
      }
      let screenshotDataUrl = null;
      if (file) {
        try {
          const compressed = await compressSupportScreenshot(file);
          screenshotDataUrl = compressed.dataUrl;
        } catch (compressErr) {
          const code = compressErr?.code;
          if (code === "FILE_TOO_LARGE") {
            toast.error(t("settings.help.fileSizeError"));
            return;
          }
          throw compressErr;
        }
      }

      let finalDescription = text;
      if (requestType === "other" && requestTypeOther.trim()) {
        finalDescription = `[Tipo (otro): ${requestTypeOther.trim()}]\n\n${text}`;
      }

      await supportApi.create({
        request_type: requestType,
        app_area: appArea,
        app_area_label: pathLabel,
        platform,
        description: finalDescription,
        screenshot_data_url: screenshotDataUrl,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      });

      toast.success(t("settings.help.sentOk"));
      setDescription("");
      setFile(null);
      setRequestType("problem");
      setAppArea("clientes_expediente");
      setRequestTypeOther("");
      setAppAreaOther("");
      setPlatform(detected);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.help.sentError"));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="help-panel" onSubmit={handleSubmit}>
      <div className="help-panel-head">
        <h2 className="help-panel-title">{t("settings.help.title")}</h2>
        <p className="help-panel-sub">{t("settings.help.sub")}</p>
      </div>

      <div className="help-field">
        <div className="help-field-icon tone-blue" aria-hidden="true">
          <HelpCircle size={18} />
        </div>
        <div className="help-field-body">
          <label className="help-label" htmlFor="help-request-type">{t("settings.help.requestType")}</label>
          <select
            id="help-request-type"
            value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
          >
            {SUPPORT_REQUEST_TYPES.map((type) => (
              <option key={type.id} value={type.id}>{typeLabel(type, lang)}</option>
            ))}
          </select>
          {requestType === "other" && (
            <input
              className="help-other-input"
              type="text"
              value={requestTypeOther}
              onChange={(e) => setRequestTypeOther(e.target.value)}
              placeholder={t("settings.help.otherTypePlaceholder")}
              maxLength={120}
            />
          )}
        </div>
      </div>

      <div className="help-field help-field--top">
        <div className="help-field-icon tone-blue" aria-hidden="true">
          <LayoutGrid size={18} />
        </div>
        <div className="help-field-body">
          <label className="help-label" htmlFor="help-app-area">{t("settings.help.appArea")}</label>
          <AppAreaPicker value={appArea} onChange={setAppArea} lang={lang} t={t} />
          {appArea === "otro" && (
            <input
              className="help-other-input"
              type="text"
              value={appAreaOther}
              onChange={(e) => setAppAreaOther(e.target.value)}
              placeholder={t("settings.help.otherAreaPlaceholder")}
              maxLength={160}
            />
          )}
        </div>
      </div>

      <div className="help-field">
        <div className="help-field-icon tone-green" aria-hidden="true">
          <Smartphone size={18} />
        </div>
        <div className="help-field-body">
          <div className="help-label">{t("settings.help.platform")}</div>
          <div className="help-platform-seg" role="group" aria-label={t("settings.help.platform")}>
            <button
              type="button"
              className={`help-platform-btn${platform === "web" ? " is-active" : ""}`}
              onClick={() => setPlatform("web")}
            >
              <Globe2 size={15} /> {t("settings.help.platformWeb")}
            </button>
            <button
              type="button"
              className={`help-platform-btn${platform === "mobile" ? " is-active" : ""}`}
              onClick={() => setPlatform("mobile")}
            >
              <Smartphone size={15} /> {t("settings.help.platformMobile")}
            </button>
          </div>
          <p className="help-hint">{t("settings.help.platformHint")}</p>
        </div>
      </div>

      <div className="help-field help-field--top">
        <div className="help-field-icon tone-purple" aria-hidden="true">
          <Pencil size={18} />
        </div>
        <div className="help-field-body">
          <label className="help-label" htmlFor="help-description">{t("settings.help.description")}</label>
          <div className="help-textarea-wrap">
            <textarea
              id="help-description"
              value={description}
              maxLength={MAX_CHARS}
              rows={5}
              placeholder={t("settings.help.descriptionPlaceholder")}
              onChange={(e) => setDescription(e.target.value)}
            />
            <span className="help-char-count">{description.length}/{MAX_CHARS}</span>
          </div>
        </div>
      </div>

      <div className="help-field help-field--top">
        <div className="help-field-icon tone-amber" aria-hidden="true">
          <Paperclip size={18} />
        </div>
        <div className="help-field-body">
          <div className="help-label">{t("settings.help.attach")}</div>
          <div
            className={`help-dropzone${dragOver ? " is-over" : ""}${previewUrl ? " has-file" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
          >
            {previewUrl ? (
              <div className="help-preview">
                <img src={previewUrl} alt="" />
                <div className="help-preview-meta">
                  <span className="help-preview-name">{file?.name}</span>
                  <button
                    type="button"
                    className="help-preview-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    aria-label={t("settings.help.removeFile")}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="help-dropzone-inner">
                <CloudUpload size={22} strokeWidth={1.8} />
                <span>{t("settings.help.dropHint")}</span>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              pickFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <p className="help-hint">{t("settings.help.attachFormats")}</p>
        </div>
      </div>

      <div className="help-footer">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? t("common.loading") : t("settings.help.submit")}
        </button>
        <div className="help-trust">
          <ShieldCheck size={15} />
          <span>{t("settings.help.trust")}</span>
        </div>
      </div>
    </form>
  );
}
