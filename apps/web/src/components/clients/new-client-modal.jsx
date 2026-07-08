import { useEffect, useRef, useState } from "react";
import { SalesModal } from "@/components/ui/sales-modal";
import { useI18n } from "@/hooks/use-i18n.js";
import { selectOnFocus } from "@/lib/focus-select.js";
import { DEFAULT_TOUR_TYPES } from "@/lib/store-empty.js";
import { useDbStore } from "@/stores/db-store";
import { createProspectFromName } from "@/actions/clients.js";
import { shallow } from "zustand/shallow";

export function NewClientModal({ open, onOpenChange, onCreated }) {
  const { t } = useI18n();
  const tourTypes = useDbStore((s) => s.db.settings?.tourTypes ?? DEFAULT_TOUR_TYPES, shallow);
  const [name, setName] = useState("");
  const [tourCuantificable, setTourCuantificable] = useState(true);
  const [tipoTour, setTipoTour] = useState("");
  const [missingName, setMissingName] = useState(false);
  const [invalidName, setInvalidName] = useState(false);
  const [missingTipoTour, setMissingTipoTour] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setMissingName(false);
    setInvalidName(false);
    setMissingTipoTour(false);
    const timer = window.setTimeout(() => nameRef.current?.focus(), 300);
    return () => window.clearTimeout(timer);
  }, [open]);

  const reset = () => {
    setName("");
    setTourCuantificable(true);
    setTipoTour("");
    setMissingName(false);
    setInvalidName(false);
    setMissingTipoTour(false);
  };

  const handleOpenChange = (next) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const handleCreate = () => {
    let hasError = false;
    const trimmed = name.trim();
    if (!trimmed) {
      setMissingName(true);
      setInvalidName(false);
      nameRef.current?.focus();
      hasError = true;
    } else if (/\s/.test(trimmed)) {
      setInvalidName(true);
      setMissingName(false);
      nameRef.current?.focus();
      hasError = true;
    }
    if (!tipoTour) {
      setMissingTipoTour(true);
      hasError = true;
    }
    if (hasError) return;

    const result = createProspectFromName(name.trim(), tipoTour, tourCuantificable);
    if (!result.ok) {
      if (result.reason === "missing_name") {
        setMissingName(true);
        setInvalidName(false);
        nameRef.current?.focus();
      } else if (result.reason === "invalid_name") {
        setInvalidName(true);
        setMissingName(false);
        nameRef.current?.focus();
      } else if (result.reason === "missing_tour_type") {
        setMissingTipoTour(true);
      }
      return;
    }

    onCreated?.(result.client);
    handleOpenChange(false);
  };

  return (
    <SalesModal
      open={open}
      onOpenChange={handleOpenChange}
      title={t("clients.modalTitle")}
      sub={t("clients.modalSub")}
    >
      <div className={`newclient-field required-field${missingName || invalidName ? " field-missing" : ""}`}>
        <label className="required-label">
          {t("clients.name")}
          <span className="req-star">*</span>
        </label>
        <input
          ref={nameRef}
          id="nc-name"
          type="text"
          value={name}
          placeholder={t("clients.namePlaceholder")}
          onFocus={selectOnFocus}
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) setMissingName(false);
            if (!/\s/.test(e.target.value.trim())) setInvalidName(false);
          }}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
        />
        {invalidName && <div className="field-inline-error">{t("clients.singleNameOnly")}</div>}
      </div>
      <div className="newclient-field">
        <label>{t("clients.isTourQuantifiable")}</label>
        <div className="seg newclient-seg" role="group" aria-label={t("clients.isTourQuantifiable")}>
          <button
            type="button"
            className={`seg-btn${tourCuantificable ? " on" : ""}`}
            onClick={() => setTourCuantificable(true)}
          >
            {t("clients.yes")}
          </button>
          <button
            type="button"
            className={`seg-btn${!tourCuantificable ? " on" : ""}`}
            onClick={() => setTourCuantificable(false)}
          >
            {t("clients.no")}
          </button>
        </div>
      </div>
      <div className={`newclient-field required-field${missingTipoTour ? " field-missing" : ""}`}>
        <label className="required-label">
          {t("clients.tourType")}
          <span className="req-star">*</span>
        </label>
        <select
          value={tipoTour}
          onChange={(e) => {
            setTipoTour(e.target.value);
            if (e.target.value) setMissingTipoTour(false);
          }}
        >
          <option value="">{t("clients.tourTypePlaceholder")}</option>
          {tourTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>
      <div className="btn-row" style={{ marginTop: 20 }}>
        <button type="button" className="btn btn-ghost" onClick={() => handleOpenChange(false)}>{t("common.cancel")}</button>
        <button type="button" className="btn btn-primary" onClick={handleCreate}>{t("clients.createExpediente")}</button>
      </div>
    </SalesModal>
  );
}
