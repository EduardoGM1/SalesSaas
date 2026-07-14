import { useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, LayoutGrid, Smartphone, Globe2, Pencil, Paperclip, CloudUpload, ShieldCheck, X } from "lucide-react";
import { isStandaloneApp, isAndroidDevice, isIosDevice } from "@/lib/pwa-install.js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";
import { supportApi } from "@/lib/support-api.js";

const MAX_CHARS = 1000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp";

function detectPlatform() {
  if (typeof window === "undefined") return "web";
  if (isStandaloneApp() || isAndroidDevice() || isIosDevice()) return "mobile";
  return "web";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

export function HelpSettings() {
  const { t } = useI18n();
  const fileRef = useRef(null);
  const detected = useMemo(() => detectPlatform(), []);

  const [requestType, setRequestType] = useState("problem");
  const [appArea, setAppArea] = useState("clients");
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

    setPending(true);
    try {
      if (!isSupabaseConfigured()) {
        throw new Error(t("settings.help.requiresCloud"));
      }
      let screenshotDataUrl = null;
      if (file) screenshotDataUrl = await readFileAsDataUrl(file);

      await supportApi.create({
        request_type: requestType,
        app_area: appArea,
        platform,
        description: text,
        screenshot_data_url: screenshotDataUrl,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      });

      toast.success(t("settings.help.sentOk"));
      setDescription("");
      setFile(null);
      setRequestType("problem");
      setAppArea("clients");
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
            <option value="problem">{t("settings.help.type.problem")}</option>
            <option value="question">{t("settings.help.type.question")}</option>
            <option value="suggestion">{t("settings.help.type.suggestion")}</option>
            <option value="account">{t("settings.help.type.account")}</option>
            <option value="other">{t("settings.help.type.other")}</option>
          </select>
        </div>
      </div>

      <div className="help-field">
        <div className="help-field-icon tone-blue" aria-hidden="true">
          <LayoutGrid size={18} />
        </div>
        <div className="help-field-body">
          <label className="help-label" htmlFor="help-app-area">{t("settings.help.appArea")}</label>
          <select
            id="help-app-area"
            value={appArea}
            onChange={(e) => setAppArea(e.target.value)}
          >
            <option value="clients">{t("settings.help.area.clients")}</option>
            <option value="calendar">{t("settings.help.area.calendar")}</option>
            <option value="sales">{t("settings.help.area.sales")}</option>
            <option value="network">{t("settings.help.area.network")}</option>
            <option value="messages">{t("settings.help.area.messages")}</option>
            <option value="tools">{t("settings.help.area.tools")}</option>
            <option value="settings">{t("settings.help.area.settings")}</option>
            <option value="notifications">{t("settings.help.area.notifications")}</option>
            <option value="other">{t("settings.help.area.other")}</option>
          </select>
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
