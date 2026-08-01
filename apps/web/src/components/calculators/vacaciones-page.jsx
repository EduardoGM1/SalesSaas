
import { useEffect, useMemo, useRef, useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { SaveToolModal } from "@/components/calculators/save-tool-modal";
import { SharedToolBanner } from "@/components/calculators/shared-tool-banner.jsx";
import { VacationCumulativeChart } from "@/components/calculators/vacation-cumulative-chart.jsx";
import { buildVacacionesCumulativeSeries, computeVacaciones } from "@/lib/calculations/vacaciones";
import { buildOperationalFields, VACACIONES_MONEY_FIELDS } from "@/lib/currency/moneda-service";
import { selectOnFocus } from "@/lib/focus-select.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMonedaToolBucket } from "@/hooks/use-moneda-tool.js";
import { useToolSession } from "@/hooks/use-tool-session.js";
import { useFlushLibreToolOnLeave } from "@/hooks/use-flush-libre-tool-on-leave.js";
import { CollabField, collabFieldId } from "@/components/clients/collab-field.jsx";
import { SelectorMoneda } from "@/components/currency/selector-moneda.jsx";
import { CampoMonedaCaptura } from "@/components/currency/campo-moneda-captura.jsx";
import { applyRemoteFormState, fieldKeyFromCollabId, markFieldsDirty, clearDirtyFields } from "@/lib/collab-form-merge.js";

const DEFAULT_FIELDS = { vv: "", vc: "", va: "", vi: "8" };

interface VacacionesPageProps {
  clientId?;
  shared?;
}

export function VacacionesPage({ clientId, shared }: VacacionesPageProps) {
  const { t } = useI18n();
  const session = useToolSession({ clientId, shared, section: "vacaciones" });
  const { ready, readOnly, backHref, getBucket, saveBucket, isFileMode, isShared, peers, lockedBy, toolsRevision, collab } = session;
  const fid = (key) => collabFieldId("vacaciones", key);
  const {
    captureCurrency,
    currencyMeta,
    currencyMetaSerialized,
    moneda,
    appendMonedaPayload,
    resetMoneda,
    recordMoneyCapture,
    switchCaptureCurrency,
    alignLoadedFields,
  } = useMonedaToolBucket({ getBucket, toolKey: "vacaciones", ready, toolsRevision });
  const { fmtResult, fmtResultN } = moneda;
  const [fields, setFields] = useState({ ...DEFAULT_FIELDS });
  const [saved, setSaved] = useState(false);
  const [saveToolOpen, setSaveToolOpen] = useState(false);
  const dirtyKeysRef = useRef(new Set());
  const hydratedRef = useRef(false);
  const focusedKeyRef = useRef(null);
  focusedKeyRef.current = fieldKeyFromCollabId(collab?.myFocusedField, "vacaciones");

  useFlushLibreToolOnLeave({
    enabled: ready && !isFileMode,
    tool: "vacaciones",
    getSnapshot: () => appendMonedaPayload({ ...fields }),
    hasChanges: () => dirtyKeysRef.current.size > 0,
  });

  useEffect(() => {
    if (!ready) return;
    const b = getBucket("vacaciones");
    const base = Object.keys(b).length
      ? {
        vv: String(b.vv ?? ""),
        vc: String(b.vc ?? ""),
        va: String(b.va ?? ""),
        vi: b.vi === undefined || b.vi === null || String(b.vi) === "" ? "8" : String(b.vi),
      }
      : { ...DEFAULT_FIELDS };
    const next = alignLoadedFields(base, VACACIONES_MONEY_FIELDS);
    setFields((prev) => applyRemoteFormState(prev, next, {
      dirtyKeys: dirtyKeysRef.current,
      focusedKey: focusedKeyRef.current,
      hydratedRef,
    }));
  }, [ready, clientId, getBucket, shared?.prospectId, toolsRevision, alignLoadedFields]);

  const handleClear = async () => {
    if (readOnly) return;
    setFields({ ...DEFAULT_FIELDS });
    resetMoneda();
    clearDirtyFields(dirtyKeysRef);
    if (ready) await saveBucket("vacaciones", appendMonedaPayload({ ...DEFAULT_FIELDS }));
  };

  const setField = (key, value) => {
    markFieldsDirty(dirtyKeysRef, key);
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const onEditStart = (key) => markFieldsDirty(dirtyKeysRef, key);

  const operationalFields = useMemo(
    () => buildOperationalFields(fields, currencyMeta, captureCurrency, moneda.ctx, VACACIONES_MONEY_FIELDS),
    [fields, currencyMeta, captureCurrency, moneda.ctx],
  );

  const r = useMemo(
    () => computeVacaciones(operationalFields),
    [operationalFields],
  );

  const currentYear = new Date().getFullYear();
  const chartSeries = useMemo(
    () => buildVacacionesCumulativeSeries(operationalFields, currentYear),
    [operationalFields, currentYear],
  );
  const hasProjectionYears = String(fields.va).trim() !== "" && r.anios > 0;
  const futureYear = currentYear + r.anios;
  const inflationImpact = Math.max(0, r.tc - r.ts);

  const handleSave = async () => {
    if (readOnly) return;
    await saveBucket("vacaciones", appendMonedaPayload(fields));
    clearDirtyFields(dirtyKeysRef);
    if (!isFileMode) { setSaveToolOpen(true); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const handleMoneyBlur = () => {
    const formatted = moneda.formatCapture(fields.vc);
    setField("vc", formatted);
    recordMoneyCapture("vc", formatted);
  };

  const handleCaptureCurrencyChange = (next) => {
    markFieldsDirty(dirtyKeysRef, "__captureCurrency");
    switchCaptureCurrency(next, fields, VACACIONES_MONEY_FIELDS, setFields);
  };

  return (
    <>
      <Topbar title={t("tools.vacation")} subtitle={t("tools.vacationDesc")} />
      <div className="sales-page tool-calc-page">
        <div className="page-toolbar page-toolbar--between">
          <PageBack inline href={backHref} hasUnsavedChanges={() => dirtyKeysRef.current.size > 0} />
          {!readOnly && (
            <PageBack inline label={t("common.clear")} onClick={handleClear} showIcon={false} />
          )}
        </div>

        <SharedToolBanner show={ready && isShared && readOnly} peers={peers} />

        <fieldset className="shared-tool-fieldset" disabled={readOnly}>
        <SelectorMoneda
          value={captureCurrency}
          onChange={handleCaptureCurrencyChange}
          disabled={readOnly}
          className="tool-moneda-selector"
        />
        <div className="g2 vacation-calc-layout">
          <div className="card tool-calc-card">
            <div className="card-heading">{t("tools.vacation.inputTitle")}</div>
            <div className="tool-calc-fields">
              <div className="frow frow-first tool-frow">
                <div className="flabel">{t("tools.vacation.tripsPerYear")}</div>
                <CollabField collab={collab} fieldId={fid("vv")} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                  {(lp) => (
                    <input type="number" inputMode="numeric" className={`tool-num-input ${lp.className || ""}`.trim()} min={1} value={fields.vv} onFocus={(e) => { onEditStart("vv"); lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => setField("vv", e.target.value)} />
                  )}
                </CollabField>
              </div>
              <div className="frow tool-frow">
                <div className="flabel">{t("tools.vacation.costPerTrip")}</div>
                <CampoMonedaCaptura
                  currency={captureCurrency}
                  value={fields.vc}
                  onChange={(value) => setField("vc", value)}
                  onBlurCapture={handleMoneyBlur}
                  collab={collab}
                  fieldId={fid("vc")}
                  dirtyKeysRef={dirtyKeysRef}
                  readOnly={readOnly}
                />
              </div>
              <div className="frow tool-frow">
                <div className="flabel">{t("tools.vacation.yearsProject")}</div>
                <CollabField collab={collab} fieldId={fid("va")} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                  {(lp) => (
                    <input type="number" inputMode="numeric" className={`tool-num-input ${lp.className || ""}`.trim()} min={1} max={60} value={fields.va} onFocus={(e) => { onEditStart("va"); lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => setField("va", e.target.value)} />
                  )}
                </CollabField>
              </div>
              <div className="frow tool-frow tool-frow--range">
                <div className="flabel">{t("tools.vacation.inflation")} — <strong style={{ color: "var(--blue)" }}>{(r.inf * 100).toFixed(1)}%</strong></div>
                <CollabField collab={collab} fieldId={fid("vi")} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                  {(lp) => (
                    <input type="range" className={`tool-range-input ${lp.className || ""}`.trim()} min={0} max={20} step={0.5} value={fields.vi} onFocus={(e) => { onEditStart("vi"); lp.onFocus?.(e); }} onBlur={lp.onBlur} disabled={lp.disabled} onChange={(e) => setField("vi", e.target.value)} />
                  )}
                </CollabField>
              </div>
            </div>
          </div>

          <div className="vacation-projection">
            <div className="card vacation-results-card">
              <div className="card-heading vacation-results-heading">{t("tools.vacation.futureTitle")}</div>

              <div className="vacation-results-grid">
                <div className="vacation-year-row">
                  <div className="vacation-year-card vacation-year-card--current">
                    <div className="vacation-year-card-year">{currentYear}</div>
                    <div className="vbox-val vacation-amount-val">{fmtResult(r.ga)}</div>
                    <div className="vacation-year-card-detail">{t("tools.vacation.tripsLine", { cost: fmtResultN(r.costo), trips: r.viajes })}</div>
                  </div>
                  <div className="vacation-year-arrow" aria-hidden="true" title={t("tools.vacation.inflationAccum")}>→</div>
                  <div className="vacation-year-card vacation-year-card--future">
                    {hasProjectionYears && (
                      <div className="vacation-year-card-year">{futureYear}</div>
                    )}
                    <div className="vbox-val vacation-amount-val">{fmtResult(r.cf)}</div>
                    <div className="vacation-year-card-detail">{t("tools.vacation.inflationAccum")}</div>
                  </div>
                </div>

                <div className="vacation-total-card">
                  <div className="vbox-val vacation-amount-val">{fmtResult(r.tc)}</div>
                  <div className="vacation-total-label">{t("tools.vacation.totalInflation")}</div>
                  <div className="vacation-total-sub">{t("tools.vacation.totalInflationSub", { years: r.anios })}</div>
                </div>

                <div className="vacation-split-row">
                  <div className="vacation-panel vacation-panel--base">
                    <div className="vbox-val vacation-amount-val">{fmtResult(r.ts)}</div>
                    <div className="vacation-panel-label">{t("tools.vacation.withoutInflation")}</div>
                    <div className="vacation-panel-detail">{t("tools.vacation.noInflationLine", { cost: fmtResultN(r.ga), years: r.anios })}</div>
                  </div>
                  <div className="vacation-panel vacation-panel--impact">
                    <div className="vbox-val vacation-amount-val">{fmtResult(inflationImpact)}</div>
                    <div className="vacation-panel-label">{t("tools.vacation.inflationImpact")}</div>
                    <div className="vacation-panel-detail">{t("tools.vacation.inflationExtra")}</div>
                  </div>
                </div>
              </div>

              <VacationCumulativeChart series={chartSeries} fmtResult={fmtResult} fmtResultN={fmtResultN} />
            </div>
          </div>
        </div>
        </fieldset>

        {!readOnly && (
          <div className="save-footer">
            <span className={`save-confirm${saved ? " show" : ""}`}>{t("common.saved")}</span>
            <button type="button" className="btn btn-primary" onClick={handleSave}>{t("common.save")}</button>
          </div>
        )}
      </div>
      {!isShared && (
        <SaveToolModal open={saveToolOpen} onOpenChange={setSaveToolOpen} tool="vacaciones" />
      )}
    </>
  );
}
