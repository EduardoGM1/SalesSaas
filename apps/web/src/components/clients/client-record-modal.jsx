
import { useEffect, useState } from "react";
import { SalesModal } from "@/components/ui/sales-modal";
import { CountryCitySelects } from "@/components/clients/country-city-selects.jsx";
import { selectOnFocus } from "@/lib/focus-select.js";
import { isSaleFormValid, resolveSaleProcessDate } from "@/lib/sales/form-valid";
import { parseMoney } from "@/lib/format/money";
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

const SALE_STATUS_OPTIONS = [
  { value: "venta", key: "exp.sale.statusProcessable" },
  { value: "pendiente", key: "exp.sale.statusNotProcessable" },
  { value: "cerrado", key: "exp.sale.statusProcessed" },
];

function isProspectFormValid(form) {
  return Boolean(String(form?.name1 || form?.name || "").trim())
    && Boolean(String(form?.tipo_tour || "").trim());
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
  const missingName = !String(form?.name1 || form?.name || "").trim();
  const missingTipoTour = !String(form?.tipo_tour || "").trim();
  return (
    <div className="prospect-grid">
      <div className={requiredFieldClass(showErrors, missingName)}>
        <label className="field-required">{t("exp.edit.name")}</label>
        <input type="text" placeholder={t("tools.survey.namePlaceholder")} value={form.name1 || ""} onFocus={selectOnFocus} onChange={(e) => onChange({ ...form, name1: e.target.value })} />
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
          <div className="prospect-field full"><label>{t("exp.edit.note")}</label><textarea rows={3} placeholder={t("exp.edit.notePlaceholder")} value={form.note || ""} onFocus={selectOnFocus} onChange={(e) => onChange({ ...form, note: e.target.value })} /></div>
        </>
      ) : null}
    </div>
  );
}

function SaleFields({ saleForm, onChange, t, showErrors }) {
  const missingDate = !String(saleForm.date || "").trim();
  const missingVolume = parseMoney(String(saleForm.vol ?? "")) <= 0;
  const missingContract = !String(saleForm.contract ?? "").trim();
  const missingProcessDate = saleForm.status === "pendiente" && !resolveSaleProcessDate(saleForm);
  return (
    <div className="prospect-grid">
      <div className={requiredFieldClass(showErrors, missingDate)}>
        <label className="field-required">{t("exp.sale.date")}</label>
        <input type="date" value={saleForm.date} onFocus={selectOnFocus} onChange={(e) => onChange({ ...saleForm, date: e.target.value })} />
      </div>
      <div className="prospect-geo-row">
        <div className={requiredFieldClass(showErrors, missingVolume)}>
          <label className="field-required">{t("exp.sale.volume")}</label>
          <div className="mfield"><span className="mpfx">$</span><input type="text" placeholder="0" value={saleForm.vol} onFocus={selectOnFocus} onChange={(e) => onChange({ ...saleForm, vol: e.target.value })} /></div>
        </div>
        <div className="prospect-field">
          <label>{t("exp.sale.tours")}</label>
          <input type="number" min={0} value={saleForm.tours} onFocus={selectOnFocus} onChange={(e) => onChange({ ...saleForm, tours: e.target.value })} />
        </div>
      </div>
      <div className="prospect-geo-row">
        <div className={requiredFieldClass(showErrors, missingContract)}>
          <label className="field-required">{t("exp.sale.contract")}</label>
          <input type="text" placeholder={t("exp.sale.contractPlaceholder")} value={saleForm.contract} onFocus={selectOnFocus} onChange={(e) => onChange({ ...saleForm, contract: e.target.value })} />
        </div>
        <div className="prospect-field">
          <label>{t("exp.sale.status")}</label>
          <select value={saleForm.status} onChange={(e) => onChange({
            ...saleForm,
            status: e.target.value,
            processDate: e.target.value === "pendiente"
              ? (saleForm.processDate || saleForm.date)
              : "",
            addProcessingFollowup: e.target.value === "pendiente" ? saleForm.addProcessingFollowup : false,
          })}>
            {SALE_STATUS_OPTIONS.map(({ value, key }) => (
              <option key={value} value={value}>{t(key)}</option>
            ))}
          </select>
        </div>
      </div>
      {saleForm.status === "pendiente" && (
        <>
          <div className={requiredFieldClass(showErrors, missingProcessDate)}>
            <label className="field-required">{t("exp.sale.processDate")}</label>
            <input type="date" value={saleForm.processDate} onFocus={selectOnFocus} onChange={(e) => onChange({ ...saleForm, processDate: e.target.value })} />
          </div>
          <div className="prospect-field sale-followup-field">
            <label>{t("exp.sale.followupLabel")}</label>
            <label className="sale-followup-box">
              <input type="checkbox" checked={saleForm.addProcessingFollowup} onChange={(e) => onChange({ ...saleForm, addProcessingFollowup: e.target.checked })} />
              <span>{t("exp.sale.followupCheck")}</span>
            </label>
          </div>
        </>
      )}
      <div className="prospect-field full"><label>{t("exp.sale.notes")}</label><textarea rows={3} placeholder={t("exp.sale.notesPlaceholder")} value={saleForm.note} onFocus={selectOnFocus} onChange={(e) => onChange({ ...saleForm, note: e.target.value })} /></div>
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
      {mode !== "edit-data" && (
        <div className="ethic-box" style={{ marginTop: 16 }}>{copy.ethic}</div>
      )}
      <div className="btn-row">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="btn btn-primary" onClick={handleSaveClick}>{copy.saveLabel}</button>
      </div>
    </SalesModal>
  );
}
