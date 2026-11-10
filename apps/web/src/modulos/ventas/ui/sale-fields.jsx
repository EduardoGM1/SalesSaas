import { selectOnFocus } from "@/lib/focus-select.js";
import { formatMoneyValue, parseMoney } from "@/lib/format/money";
import { formatMoneyInput } from "@/lib/format/numeric-input.js";
import { resolveSaleProcessDate } from "../dominio/validez-formulario.ts";

function requiredFieldClass(showErrors, isMissing) {
  return `prospect-field required-field${showErrors && isMissing ? " field-missing" : ""}`;
}

const SALE_STATUS_OPTIONS = [
  { value: "venta", key: "exp.sale.statusProcessable" },
  { value: "pendiente", key: "exp.sale.statusNotProcessable" },
  { value: "cerrado", key: "exp.sale.statusProcessed" },
  { value: "cancelada", key: "exp.sale.statusCancelled" },
];

export function SaleFields({ saleForm, onChange, t, showErrors }) {
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
          <div className="mfield">
            <span className="mpfx">$</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={saleForm.vol}
              onFocus={selectOnFocus}
              onChange={(e) => onChange({ ...saleForm, vol: formatMoneyInput(e.target.value) })}
              onBlur={(e) => onChange({ ...saleForm, vol: formatMoneyValue(e.target.value) })}
            />
          </div>
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
      <div className="prospect-field full"><label>{t("exp.sale.notes")}</label><textarea rows={2} placeholder={t("exp.sale.notesPlaceholder")} value={saleForm.note} onFocus={selectOnFocus} onChange={(e) => onChange({ ...saleForm, note: e.target.value })} /></div>
    </div>
  );
}
