
import { useEffect, useState } from "react";
import { SalesModal } from "@/components/ui/sales-modal";
import { CountryCitySelects } from "./country-city-selects.jsx";
import { selectOnFocus } from "@/lib/focus-select.js";
import { formatSingleNameInput, isValidSingleName, SINGLE_NAME_MAX_LENGTH } from "@/lib/format/single-name-input.js";
import { isSaleFormValid, SaleFields } from "@/modulos/ventas";
import { useI18n } from "@/hooks/use-i18n.js";
import { DEFAULT_TOUR_TYPES } from "@/lib/store-empty.js";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";

function requiredFieldClass(showErrors, isMissing) {
  return `prospect-field required-field${showErrors && isMissing ? " field-missing" : ""}`;
}

const STATUS_OPTIONS = [
  { value: "", key: "status.empty" },
  { value: "venta", key: "status.sale" },
  { value: "bback", key: "status.bback" },
  { value: "pendiente", key: "status.notProcessable" },
  { value: "perdido", key: "status.lost" },
];

function isProspectFormValid(form) {
  const name = String(form?.name1 || form?.name || "").trim();
  return isValidSingleName(name) && Boolean(String(form?.tipo_tour || "").trim());
}

function getModalCopy(mode, t, clientName) {
  if (mode === "edit-data") {
    return {
      title: t("exp.edit.title"),
      sub: t("exp.edit.sub"),
      saveLabel: t("exp.edit.save"),
      ethic: t("exp.ethics.edit"),
    };
  }
  if (mode === "sale-edit") {
    return {
      title: t("exp.sale.titleEdit"),
      sub: t("exp.sale.modalEditSub", { name: clientName }),
      saveLabel: t("exp.sale.saveChanges"),
      ethic: t("exp.ethics.sale"),
    };
  }
  return {
    title: t("exp.sale.titleNew"),
    sub: t("exp.sale.modalNewSub", { name: clientName }),
    saveLabel: t("exp.sale.save"),
    ethic: t("exp.ethics.sale"),
  };
}

function ProspectFields({ form, onChange, t, showStatusFields, showErrors }) {
  const tourTypes = useDbStore((s) => s.db.settings?.tourTypes ?? DEFAULT_TOUR_TYPES, shallow);
  const nameValue = String(form?.name1 || form?.name || "");
  const missingName = !isValidSingleName(nameValue);
  const missingTipoTour = !String(form?.tipo_tour || "").trim();
  return (
    <div className="prospect-grid">
      <div className={requiredFieldClass(showErrors, missingName)}>
        <label className="field-required">{t("exp.edit.name")}</label>
        <input
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={SINGLE_NAME_MAX_LENGTH}
          placeholder={t("tools.survey.namePlaceholder")}
          value={form.name1 || ""}
          onFocus={selectOnFocus}
          onChange={(e) => onChange({ ...form, name1: formatSingleNameInput(e.target.value) })}
          onKeyDown={(e) => { if (e.key === " ") e.preventDefault(); }}
        />
        {showErrors && missingName ? (
          <div className="field-inline-error">{t("clients.singleNameOnly")}</div>
        ) : null}
      </div>
      <div className="prospect-field"><label>{t("exp.edit.occ1")}</label><input type="text" placeholder={t("tools.survey.occPlaceholder")} value={form.occupation1 || ""} onFocus={selectOnFocus} onChange={(e) => onChange({ ...form, occupation1: e.target.value })} /></div>
      <CountryCitySelects
        country={form.country || ""}
        city={form.city || ""}
        onChange={(patch) => onChange({ ...form, ...patch })}
      />
      <div className={requiredFieldClass(showErrors, missingTipoTour)}>
        <label className="field-required">{t("clients.tourType")}</label>
        <select value={form.tipo_tour || ""} onChange={(e) => onChange({ ...form, tipo_tour: e.target.value })}>
          <option value="">{t("clients.tourTypePlaceholder")}</option>
          {tourTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>
      <div className="prospect-field"><label>{t("clients.isTourQuantifiable")}</label>
        <select value={form.tour_cuantificable !== false ? "yes" : "no"} onChange={(e) => onChange({ ...form, tour_cuantificable: e.target.value === "yes" })}>
          <option value="yes">{t("clients.yes")}</option>
          <option value="no">{t("clients.no")}</option>
        </select>
      </div>
      {showStatusFields ? (
        <>
          <div className="prospect-field"><label>{t("exp.edit.contract")}</label><input type="text" placeholder={t("exp.sale.contractPlaceholder")} value={form.contract || ""} onFocus={selectOnFocus} onChange={(e) => onChange({ ...form, contract: e.target.value })} /></div>
          <div className="prospect-field"><label>{t("exp.edit.tourDate")}</label><input type="date" value={form.tourDate || ""} onFocus={selectOnFocus} onChange={(e) => onChange({ ...form, tourDate: e.target.value })} /></div>
          <div className="prospect-field"><label>{t("exp.edit.status")}</label>
            <select value={form.status || ""} onChange={(e) => onChange({ ...form, status: e.target.value })}>
              {STATUS_OPTIONS.map(({ value, key }) => (
                <option key={value || "empty"} value={value}>{t(key)}</option>
              ))}
            </select>
          </div>
          <div className="prospect-field"><label>{t("exp.edit.processDate")}</label><input type="date" value={form.processDate || ""} onFocus={selectOnFocus} onChange={(e) => onChange({ ...form, processDate: e.target.value })} /></div>
          <div className="prospect-field full"><label>{t("exp.edit.note")}</label><textarea rows={2} placeholder={t("exp.edit.notePlaceholder")} value={form.note || ""} onFocus={selectOnFocus} onChange={(e) => onChange({ ...form, note: e.target.value })} /></div>
        </>
      ) : null}
    </div>
  );
}

/** Formulario unificado: editar datos, nueva venta o editar venta. */
export function ClientRecordModal({
  open,
  onOpenChange,
  mode,
  clientName,
  prospectForm,
  onProspectChange,
  saleForm,
  onSaleChange,
  onSave,
  onCancel,
}) {
  const { t } = useI18n();
  const [showErrors, setShowErrors] = useState(false);
  const copy = getModalCopy(mode, t, clientName);
  const showSale = mode === "sale-new" || mode === "sale-edit";
  const canSave = mode === "edit-data"
    ? isProspectFormValid(prospectForm)
    : isProspectFormValid(prospectForm) && isSaleFormValid(saleForm);

  useEffect(() => {
    if (!open) setShowErrors(false);
  }, [open]);

  const handleSaveClick = () => {
    if (!canSave) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    onSave();
  };

  return (
    <SalesModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      sub={mode === "edit-data" ? undefined : copy.sub}
      popupId="m-client-record"
      maxWidth={760}
      modalClassName="modal-wide"
    >
      <div className="client-record-form">
        <div className="form-section-label">{t("exp.form.sectionProspect")}</div>
        <ProspectFields
          form={prospectForm}
          onChange={onProspectChange}
          t={t}
          showStatusFields={mode === "edit-data"}
          showErrors={showErrors}
        />
        {showSale && (
          <>
            <hr className="form-section-divider" />
            <div className="form-section-label">{t("exp.form.sectionSale")}</div>
            <SaleFields saleForm={saleForm} onChange={onSaleChange} t={t} showErrors={showErrors} />
          </>
        )}
      </div>
      <div className="ethic-box" style={{ marginTop: 12 }}>{t("exp.ethics.main")}</div>
      <div className="btn-row">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="btn btn-primary" onClick={handleSaveClick}>{copy.saveLabel}</button>
      </div>
    </SalesModal>
  );
}
