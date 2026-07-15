
import { useEffect, useMemo, useRef, useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { SaveToolModal } from "@/components/calculators/save-tool-modal";
import { ensureProspectIdentity } from "@/lib/clients";
import { computeSurvey } from "@/lib/calculations/survey";
import { SharedToolBanner } from "@/components/calculators/shared-tool-banner.jsx";
import { COUNTRY_CITY, COUNTRY_FLAGS } from "@/lib/constants";
import { selectOnFocus } from "@/lib/focus-select.js";
import { formatDecimalInput } from "@/lib/format/numeric-input.js";
import { formatMoneyValue } from "@/lib/format/money";
import { formatSingleNameInput, isValidSingleName, SINGLE_NAME_MAX_LENGTH } from "@/lib/format/single-name-input.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { useToolSession } from "@/hooks/use-tool-session.js";
import { useFlushLibreToolOnLeave } from "@/hooks/use-flush-libre-tool-on-leave.js";
import { CollabField, collabFieldId } from "@/components/clients/collab-field.jsx";
import { applyRemoteFormState, fieldKeyFromCollabId, markFieldsDirty, clearDirtyFields } from "@/lib/collab-form-merge.js";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";

const HIST = ["sh1", "sh2", "sh3"];
const FUT = ["sf1", "sf2", "sf3"];

const EMPTY_DATA: Record<string, string> = {
  nights: "", total: "", hpct: "",
  sh1c: "", sh1y: "", sh1n: "", sh1a: "",
  sh2c: "", sh2y: "", sh2n: "", sh2a: "",
  sh3c: "", sh3y: "", sh3n: "", sh3a: "",
  sf1c: "", sf1y: "", sf1n: "", sf1a: "",
  sf2c: "", sf2y: "", sf2n: "", sf2a: "",
  sf3c: "", sf3y: "", sf3n: "", sf3a: "",
  svp_name1: "", svp_country: "", svp_occ1: "", svp_city: "",
};

interface SurveyPageProps {
  clientId?;
  shared?;
}

export function SurveyPage({ clientId, shared }: SurveyPageProps) {
  const { t } = useI18n();
  const session = useToolSession({ clientId, shared, section: "survey" });
  const {
    ready, readOnly, backHref, getBucket, saveBucket, syncProspectFields,
    isFileMode, isShared, prospectId, peers, lockedBy, toolsRevision, collab,
  } = session;
  const fid = (key) => collabFieldId("survey", key);
  const saveClient = useDbStore((s) => s.saveClient);
  const getClient = useDbStore((s) => s.getClient);
  const moneySettings = useDbStore((s) => s.db.settings, shallow);
  const { fmt, fmtD } = useMoney();

  const [data, setData] = useState<Record<string, string>>({ ...EMPTY_DATA });
  const [sType, setSType] = useState("hotel");
  const [futureType, setFutureType] = useState<"real" | "dream">("real");
  const [saved, setSaved] = useState(false);
  const [saveToolOpen, setSaveToolOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const dirtyKeysRef = useRef(new Set());
  const hydratedRef = useRef(false);
  const focusedKeyRef = useRef(null);
  focusedKeyRef.current = fieldKeyFromCollabId(collab?.myFocusedField, "survey");

  useFlushLibreToolOnLeave({
    enabled: ready && !isFileMode,
    tool: "survey",
    getSnapshot: () => ({ ...data, stype: sType, futureType }),
    hasChanges: () => dirtyKeysRef.current.size > 0,
  });

  useEffect(() => {
    if (!ready) return;
    const bucket = getBucket("survey");
    const loaded: Record<string, string> = { ...EMPTY_DATA };
    if (Object.keys(bucket).length) {
      Object.entries(bucket).forEach(([k, v]) => { loaded[k] = String(v); });
      if (bucket.stype != null && !dirtyKeysRef.current.has("__stype")) {
        setSType(String(bucket.stype) || "hotel");
      }
      if (bucket.futureType != null && !dirtyKeysRef.current.has("__futureType")) {
        setFutureType(bucket.futureType === "dream" ? "dream" : "real");
      }
    }
    // Relleno desde prospecto SOLO en la primera hidratación (si no, pisa ediciones locales).
    if (!hydratedRef.current) {
      if (isFileMode && clientId) {
        const c = getClient(clientId);
        if (c) {
          loaded.svp_name1 = loaded.svp_name1 || c.name1 || c.name || "";
          loaded.svp_country = loaded.svp_country || c.country || "";
          loaded.svp_occ1 = loaded.svp_occ1 || c.occupation1 || "";
          loaded.svp_city = loaded.svp_city || c.city || "";
        }
      } else if (isFileMode && isShared && session.prospect) {
        const c = session.prospect;
        loaded.svp_name1 = loaded.svp_name1 || c.name1 || c.name || "";
        loaded.svp_country = loaded.svp_country || c.country || "";
        loaded.svp_occ1 = loaded.svp_occ1 || c.occupation1 || "";
        loaded.svp_city = loaded.svp_city || c.city || "";
      }
    }
    setData((prev) => applyRemoteFormState(prev, loaded, {
      dirtyKeys: dirtyKeysRef.current,
      focusedKey: focusedKeyRef.current,
      hydratedRef,
    }));
    // Importante: NO depender de myFocusedField — rehidratar al enfocar provocaba carreras.
  }, [ready, clientId, isFileMode, isShared, getBucket, getClient, prospectId, shared?.prospectId, toolsRevision]);

  const client = isFileMode ? (isShared ? session.prospect : (clientId ? getClient(clientId) : undefined)) : undefined;
  const countries = Object.keys(COUNTRY_CITY);
  const cities = data.svp_country ? (COUNTRY_CITY[data.svp_country] || ["Otro"]) : [];

  const result = useMemo(
    () => computeSurvey(data, sType),
    [data, sType, moneySettings?.currency, moneySettings?.exchangeRate, moneySettings?.language],
  );

  const syncProspectToClient = (next: Record<string, string>) => {
    if (!clientId || isShared) return;
    const c = getClient(clientId);
    if (!c) return;
    const name1 = next.svp_name1 || "";
    saveClient(ensureProspectIdentity({
      ...c,
      name1,
      name: name1 || c.name || "Prospecto",
      country: next.svp_country || "",
      city: next.svp_city || "",
      occupation1: next.svp_occ1 || "",
    }));
  };

  const prospectPatchFromData = (next: Record<string, string>) => {
    const name1 = next.svp_name1 || "";
    return {
      name1,
      name: name1 || "Prospecto",
      country: next.svp_country || "",
      city: next.svp_city || "",
      occupation1: next.svp_occ1 || "",
    };
  };

  const update = (k, v) => {
    markFieldsDirty(dirtyKeysRef, k === "svp_country" ? [k, "svp_city"] : k);
    setData((d) => {
      const next = { ...d, [k]: v };
      if (k === "svp_country") next.svp_city = "";
      if (k.startsWith("svp_")) syncProspectToClient(next);
      return next;
    });
    if (validationErrors[k]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    }
  };

  const onEditStart = (key) => markFieldsDirty(dirtyKeysRef, key);

  const handleSave = async () => {
    if (readOnly) return;
    const errors: Record<string, string> = {};
    const name = data.svp_name1?.trim() || "";
    if (!name) errors.svp_name1 = t("tools.survey.validationRequired");
    else if (!isValidSingleName(name)) errors.svp_name1 = t("tools.survey.validationSingleName");
    setValidationErrors(errors);
    if (Object.keys(errors).length) return;
    await saveBucket("survey", { ...data, stype: sType, futureType });
    if (isFileMode) await syncProspectFields(prospectPatchFromData(data));
    clearDirtyFields(dirtyKeysRef);
    hydratedRef.current = true;
    if (!isFileMode) { setSaveToolOpen(true); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const handleClear = async () => {
    if (readOnly) return;
    const cleared = { ...EMPTY_DATA };
    setData(cleared);
    setSType("hotel");
    setFutureType("real");
    clearDirtyFields(dirtyKeysRef);
    if (ready) {
      await saveBucket("survey", { ...cleared, stype: "hotel", futureType: "real" });
    }
  };

  return (
    <>
      <Topbar title={t("tools.survey")} subtitle={isFileMode ? t("tools.sub.surveyClient") : t("tools.sub.free")} />
      <div className="sales-page tool-calc-page survey-calc-page">
        <div className="page-toolbar page-toolbar--between">
          <PageBack inline href={backHref} hasUnsavedChanges={() => dirtyKeysRef.current.size > 0} />
          {!readOnly && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleClear}>{t("common.clear")}</button>
          )}
        </div>

        <SharedToolBanner show={ready && isShared && readOnly} peers={peers} />

        <fieldset className="shared-tool-fieldset" disabled={readOnly}>
        <div className={`card client-survey-prospect${isFileMode ? " show" : ""}`}>
          <div className="card-heading">{t("tools.survey.prospectTitle")}</div>
          <div className="card-sub">{t("tools.survey.prospectSub")}</div>
          <div className="client-survey-compact">
            <div className="client-survey-cfield">
              <label>{t("tools.survey.name")}</label>
              <CollabField collab={collab} fieldId={fid("svp_name1")} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                {(lp) => (
                  <input
                    type="text"
                    inputMode="text"
                    id="svp-name1"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={SINGLE_NAME_MAX_LENGTH}
                    placeholder={t("tools.survey.namePlaceholder")}
                    value={data.svp_name1 || ""}
                    onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }}
                    onBlur={lp.onBlur}
                    disabled={lp.disabled}
                    readOnly={lp.readOnly}
                    onChange={(e) => update("svp_name1", formatSingleNameInput(e.target.value))}
                    onKeyDown={(e) => { if (e.key === " ") e.preventDefault(); }}
                    className={[validationErrors.svp_name1 ? "input-error" : "", lp.className].filter(Boolean).join(" ")}
                  />
                )}
              </CollabField>
            </div>
            {validationErrors.svp_name1 && <div className="client-survey-name-error">{validationErrors.svp_name1}</div>}
            <div className="client-survey-crow">
              <div className="client-survey-cfield">
                <label>{t("tools.survey.country")}</label>
                <CollabField collab={collab} fieldId={fid("svp_country")} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                  {(lp) => (
                    <select
                      id="svp-country"
                      value={data.svp_country || ""}
                      onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }}
                      onBlur={lp.onBlur}
                      disabled={lp.disabled}
                      onChange={(e) => update("svp_country", e.target.value)}
                      className={lp.className}
                    >
                      <option value="">{t("tools.survey.selectCountry")}</option>
                      {countries.map((country) => (
                        <option key={country} value={country}>{COUNTRY_FLAGS[country] || "🌐"} {country}</option>
                      ))}
                      {data.svp_country && !countries.includes(data.svp_country) && (
                        <option value={data.svp_country}>{data.svp_country}</option>
                      )}
                    </select>
                  )}
                </CollabField>
              </div>
              <div className="client-survey-cfield">
                <label>{t("tools.survey.city")}</label>
                <CollabField collab={collab} fieldId={fid("svp_city")} dirtyKeysRef={dirtyKeysRef} disabled={readOnly || !data.svp_country}>
                  {(lp) => (
                    <select
                      id="svp-city"
                      value={data.svp_city || ""}
                      onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }}
                      onBlur={lp.onBlur}
                      disabled={lp.disabled}
                      onChange={(e) => update("svp_city", e.target.value)}
                      className={lp.className}
                    >
                      <option value="">{t("tools.survey.selectCity")}</option>
                      {cities.map((city) => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                      {data.svp_city && !cities.includes(data.svp_city) && (
                        <option value={data.svp_city}>{data.svp_city}</option>
                      )}
                    </select>
                  )}
                </CollabField>
              </div>
            </div>
            <div className="client-survey-cfield">
              <label>{t("tools.survey.occupation")}</label>
              <CollabField collab={collab} fieldId={fid("svp_occ1")} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                {(lp) => (
                  <input
                    type="text"
                    inputMode="text"
                    id="svp-occ1"
                    placeholder={t("tools.survey.occPlaceholder")}
                    value={data.svp_occ1 || ""}
                    onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }}
                    onBlur={lp.onBlur}
                    disabled={lp.disabled}
                    readOnly={lp.readOnly}
                    onChange={(e) => update("svp_occ1", e.target.value)}
                    className={lp.className}
                  />
                )}
              </CollabField>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-heading">{t("tools.survey.currentTrip")}</div>
          <div className="card-sub">{t("tools.survey.currentTripSub")}</div>
          <div className="g2 survey-trip-grid">
            <div className="tool-calc-fields">
              <div className="frow frow-first tool-frow">
                <div className="flabel">{t("tools.survey.nights")}</div>
                <CollabField collab={collab} fieldId={fid("nights")} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                  {(lp) => (
                    <input type="number" inputMode="numeric" className={`input-compact tool-num-input ${lp.className || ""}`.trim()} id="sv-nights" min={1} value={data.nights} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update("nights", e.target.value)} />
                  )}
                </CollabField>
              </div>
              <div className="frow tool-frow">
                <div className="flabel">{t("tools.survey.expenseType")}</div>
                <div className="seg">
                  <button type="button" className={`seg-btn${sType === "hotel" ? " on" : ""}`} onClick={() => setSType("hotel")}>{t("tools.survey.hotelOnly")}</button>
                  <button type="button" className={`seg-btn${sType === "paquete" ? " on" : ""}`} onClick={() => setSType("paquete")}>{t("tools.survey.hotelFlight")}</button>
                </div>
              </div>
              <div className="frow tool-frow">
                <div className="flabel">{t("tools.survey.totalPaid")}</div>
                <div className="mfield">
                  <span className="mpfx">$</span>
                  <CollabField collab={collab} fieldId={fid("total")} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                    {(lp) => (
                      <input type="text" inputMode="decimal" id="sv-total" value={data.total} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={(e) => { lp.onBlur?.(e); update("total", formatMoneyValue(e.target.value)); }} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update("total", formatDecimalInput(e.target.value))} />
                    )}
                  </CollabField>
                </div>
              </div>
              <div id="sv-split" style={{ display: sType === "paquete" ? "block" : "none" }}>
                <div className="frow tool-frow">
                  <div className="flabel">{t("tools.survey.hotelPct")}</div>
                  <div className="frow-inline">
                    <CollabField collab={collab} fieldId={fid("hpct")} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                      {(lp) => (
                        <input type="number" inputMode="numeric" className={`input-compact tool-num-input ${lp.className || ""}`.trim()} id="sv-hpct" min={1} max={99} value={data.hpct} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update("hpct", e.target.value)} />
                      )}
                    </CollabField>
                    <span className="frow-suffix">%</span>
                  </div>
                </div>
                <div className="g2 survey-result-pair" style={{ marginTop: 10 }}>
                  <div className="vbox blue"><div className="vbox-val">{fmt(result.split.hval)}</div><div className="vbox-label">{t("tools.survey.splitHotel", { pct: result.split.hpct })}</div></div>
                  <div className="vbox blue"><div className="vbox-val">{fmt(result.split.vval)}</div><div className="vbox-label">{t("tools.survey.splitFlight", { pct: 100 - result.split.hpct })}</div></div>
                </div>
              </div>
            </div>
            <div className="g2 survey-result-pair">
              <div className="vbox blue">
                <div className="vbox-val">{fmt(result.trip.dp)}</div>
                <div className="vbox-label">{t("tools.survey.suggestedDown")}</div>
                <div className="vbox-sub">{t("tools.survey.paidHint")}</div>
              </div>
              <div className="vbox green">
                <div className="vbox-val">{fmt(result.trip.mi)}</div>
                <div className="vbox-label">{t("tools.survey.idealMonthly")}</div>
                <div className="vbox-sub">{t("tools.survey.paidDiv12")}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="g2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-heading">{t("tools.survey.histTitle")}</div>
            <div className="card-sub">{t("tools.survey.histSub")}</div>
            <div className="table-scroll">
            <table className="mtbl">
              <thead><tr><th>{t("tools.survey.table.destination")}</th><th>{t("tools.survey.table.year")}</th><th>{t("tools.survey.table.nights")}</th><th>{t("tools.survey.table.amount")}</th></tr></thead>
              <tbody>
                {HIST.map((p) => (
                  <tr key={p}>
                    <td>
                      <CollabField collab={collab} fieldId={fid(`${p}c`)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                        {(lp) => (
                          <input type="text" inputMode="text" value={data[`${p}c`]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update(`${p}c`, e.target.value)} />
                        )}
                      </CollabField>
                    </td>
                    <td className="nc">
                      <CollabField collab={collab} fieldId={fid(`${p}y`)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                        {(lp) => (
                          <input type="number" inputMode="numeric" value={data[`${p}y`]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update(`${p}y`, e.target.value)} />
                        )}
                      </CollabField>
                    </td>
                    <td className="nc">
                      <CollabField collab={collab} fieldId={fid(`${p}n`)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                        {(lp) => (
                          <input type="number" inputMode="numeric" value={data[`${p}n`]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update(`${p}n`, e.target.value)} />
                        )}
                      </CollabField>
                    </td>
                    <td className="mc">
                      <div className="mfield"><span className="mpfx">$</span>
                        <CollabField collab={collab} fieldId={fid(`${p}a`)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                          {(lp) => (
                            <input type="text" inputMode="decimal" value={data[`${p}a`]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={(e) => { lp.onBlur?.(e); update(`${p}a`, formatMoneyValue(e.target.value)); }} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update(`${p}a`, formatDecimalInput(e.target.value))} />
                          )}
                        </CollabField>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="trow">
                  <td colSpan={2} style={{ color: "var(--muted2)", fontSize: 10 }}>{t("tools.survey.totals")}</td>
                  <td>{result.hist.nights}</td>
                  <td>{fmt(result.hist.spend)}</td>
                </tr>
              </tbody>
            </table>
            </div>
            <div className="g2 survey-result-pair" style={{ marginTop: 14 }}>
              <div className="vbox blue">
                <div className="vbox-val">{fmt(result.hist.dp)}</div>
                <div className="vbox-label">{t("tools.survey.suggestedDown")}</div>
                <div className="vbox-sub">{t("tools.survey.histAvgSub")}</div>
              </div>
              <div className="vbox green">
                <div className="vbox-val">{fmt(result.hist.mi)}</div>
                <div className="vbox-label">{t("tools.survey.idealMonthly")}</div>
                <div className="vbox-sub">{t("tools.survey.histMiSub")}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="survey-future-head">
              <div>
                <div className="card-heading" style={{ marginBottom: 4 }}>{t("tools.survey.futureTitle")}</div>
                <div className="card-sub" style={{ marginBottom: 0 }}>{t("tools.survey.futureSub")}</div>
              </div>
              <div className="choice-row" aria-label={t("tools.survey.futureTypeAria")}>
                <label className={`choice-pill${futureType === "real" ? " on" : ""}`} id="sf-real-pill">
                  <input type="checkbox" id="sf-real" checked={futureType === "real"} onChange={() => setFutureType("real")} /> {t("tools.survey.realTrips")}
                </label>
                <label className={`choice-pill${futureType === "dream" ? " on" : ""}`} id="sf-dream-pill">
                  <input type="checkbox" id="sf-dream" checked={futureType === "dream"} onChange={() => setFutureType("dream")} /> {t("tools.survey.dreamTrips")}
                </label>
              </div>
            </div>
            <div className="table-scroll">
            <table className="mtbl">
              <thead><tr><th>{t("tools.survey.table.destination")}</th><th>{t("tools.survey.table.year")}</th><th>{t("tools.survey.table.nights")}</th><th>{t("tools.survey.table.cost")}</th></tr></thead>
              <tbody>
                {FUT.map((p) => (
                  <tr key={p}>
                    <td>
                      <CollabField collab={collab} fieldId={fid(`${p}c`)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                        {(lp) => (
                          <input type="text" inputMode="text" value={data[`${p}c`]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update(`${p}c`, e.target.value)} />
                        )}
                      </CollabField>
                    </td>
                    <td className="nc">
                      <CollabField collab={collab} fieldId={fid(`${p}y`)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                        {(lp) => (
                          <input type="number" inputMode="numeric" value={data[`${p}y`]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update(`${p}y`, e.target.value)} />
                        )}
                      </CollabField>
                    </td>
                    <td className="nc">
                      <CollabField collab={collab} fieldId={fid(`${p}n`)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                        {(lp) => (
                          <input type="number" inputMode="numeric" value={data[`${p}n`]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update(`${p}n`, e.target.value)} />
                        )}
                      </CollabField>
                    </td>
                    <td className="mc">
                      <div className="mfield"><span className="mpfx">$</span>
                        <CollabField collab={collab} fieldId={fid(`${p}a`)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                          {(lp) => (
                            <input type="text" inputMode="decimal" placeholder="0" value={data[`${p}a`]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={(e) => { lp.onBlur?.(e); update(`${p}a`, formatMoneyValue(e.target.value)); }} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update(`${p}a`, e.target.value)} />
                          )}
                        </CollabField>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="trow">
                  <td colSpan={2} style={{ color: "var(--muted2)", fontSize: 10 }}>{t("tools.survey.totals")}</td>
                  <td>{result.future.nights}</td>
                  <td>{fmt(result.future.spend)}</td>
                </tr>
              </tbody>
            </table>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="vbox yellow">
                <div className="vbox-val">{fmt(result.future.spend)}</div>
                <div className="vbox-label">{t("tools.survey.futureTotal")}</div>
              </div>
            </div>
          </div>
        </div>

        {!isFileMode && (
          <div className="card" id="sv-pattern-card">
            <div className="card-heading">{t("tools.survey.patternTitle")}</div>
            <div className="card-sub">{t("tools.survey.patternSub")}</div>
            <div className="table-scroll">
            <table className="dtbl pattern-table">
              <thead>
                <tr>
                  <th>{t("tools.survey.pattern.source")}</th>
                  <th className="td-r">{t("tools.survey.pattern.vacYear")}</th>
                  <th className="td-r">{t("tools.survey.pattern.nightsYear")}</th>
                  <th className="td-r">{t("tools.survey.pattern.down")}</th>
                  <th className="td-r">{t("tools.survey.pattern.monthly")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t("tools.survey.pattern.current")}</td>
                  <td className="td-r td-blue">{result.current.vac}</td>
                  <td className="td-r td-blue">{fmtD(result.current.night)}</td>
                  <td className="td-r td-blue">{fmt(result.current.dp)}</td>
                  <td className="td-r td-green">{fmt(result.current.mi)}</td>
                </tr>
                <tr>
                  <td>{t("tools.survey.pattern.hist")}</td>
                  <td className="td-r td-blue">{fmtD(result.hist.vac)}</td>
                  <td className="td-r td-blue">{fmtD(result.hist.night)}</td>
                  <td className="td-r td-blue">{fmt(result.hist.dp)}</td>
                  <td className="td-r td-green">{fmt(result.hist.mi)}</td>
                </tr>
                <tr>
                  <td>{t("tools.survey.pattern.future")}</td>
                  <td className="td-r td-blue">{fmtD(result.future.vac)}</td>
                  <td className="td-r td-blue">{fmtD(result.future.night)}</td>
                  <td className="td-r td-blue">{fmt(result.future.dp)}</td>
                  <td className="td-r td-green">{fmt(result.future.mi)}</td>
                </tr>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                  <td>{t("tools.survey.pattern.blend")}</td>
                  <td className="td-r td-blue">{fmtD(result.pattern.vac)}</td>
                  <td className="td-r td-blue">{fmtD(result.pattern.night)}</td>
                  <td className="td-r td-blue">{fmt(result.pattern.dp)}</td>
                  <td className="td-r td-green">{fmt(result.pattern.mi)}</td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
        )}

        </fieldset>

        {!readOnly && (
          <div className="save-footer">
            <span className={`save-confirm${saved ? " show" : ""}`}>{t("common.saved")}</span>
            <button type="button" className="btn btn-primary" onClick={handleSave}>{t("common.save")}</button>
          </div>
        )}
      </div>
      {!isShared && (
        <SaveToolModal open={saveToolOpen} onOpenChange={setSaveToolOpen} tool="survey" />
      )}
    </>
  );
}