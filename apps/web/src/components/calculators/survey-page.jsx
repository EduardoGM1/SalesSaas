import { useEffect, useMemo, useRef, useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { SaveToolModal } from "@/components/calculators/save-tool-modal";
import { ensureProspectIdentity } from "@/lib/clients";
import { computeSurvey } from "@/lib/calculations/survey";
import { SharedToolBanner } from "@/components/calculators/shared-tool-banner.jsx";
import { COUNTRY_CITY, COUNTRY_FLAGS } from "@/lib/constants";
import { selectOnFocus } from "@/lib/focus-select.js";
import { formatSingleNameInput, isValidSingleName, SINGLE_NAME_MAX_LENGTH } from "@/lib/format/single-name-input.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { useToolSession } from "@/hooks/use-tool-session.js";
import { useFlushLibreToolOnLeave } from "@/hooks/use-flush-libre-tool-on-leave.js";
import { CollabField, collabFieldId } from "@/components/clients/collab-field.jsx";
import { applyRemoteFormState, fieldKeyFromCollabId, markFieldsDirty, clearDirtyFields } from "@/lib/collab-form-merge.js";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";
import {
  countAnswered,
  parseDiscovery,
  serializeDiscovery,
} from "@/lib/survey/discovery-storage.js";
import { useSurveyQuestions } from "@/hooks/use-survey-questions.js";
import { MotivacionesPanel } from "@/components/calculators/survey/motivaciones-panel.jsx";
import { TimesharePanel } from "@/components/calculators/survey/timeshare-panel.jsx";
import { GastosPanel } from "@/components/calculators/survey/gastos-panel.jsx";
import { ResumenPanel } from "@/components/calculators/survey/resumen-panel.jsx";
import { ConfigureQuestionsModal } from "@/components/calculators/survey/configure-questions-modal.jsx";

const EMPTY_DATA: Record<string, string> = {
  nights: "", total: "", hpct: "",
  sh1c: "", sh1y: "", sh1n: "", sh1a: "",
  sh2c: "", sh2y: "", sh2n: "", sh2a: "",
  sh3c: "", sh3y: "", sh3n: "", sh3a: "",
  sf1c: "", sf1y: "", sf1n: "", sf1a: "",
  sf2c: "", sf2y: "", sf2n: "", sf2a: "",
  sf3c: "", sf3y: "", sf3n: "", sf3a: "",
  svp_name1: "", svp_country: "", svp_occ1: "", svp_city: "",
  disc_json: "",
};

const TABS = [
  { id: "motivaciones", labelKey: "tools.survey.tab.motivaciones" },
  { id: "timeshare", labelKey: "tools.survey.tab.timeshare" },
  { id: "gastos", labelKey: "tools.survey.tab.gastos" },
  { id: "resumen", labelKey: "tools.survey.tab.resumen" },
];

interface SurveyPageProps {
  clientId?;
  shared?;
}

export function SurveyPage({ clientId, shared }: SurveyPageProps) {
  const { t } = useI18n();
  const session = useToolSession({ clientId, shared, section: "survey" });
  const {
    ready, readOnly, backHref, getBucket, saveBucket, syncProspectFields,
    isFileMode, isShared, prospectId, peers, toolsRevision, collab,
  } = session;
  const fid = (key) => collabFieldId("survey", key);
  const saveClient = useDbStore((s) => s.saveClient);
  const getClient = useDbStore((s) => s.getClient);
  const moneySettings = useDbStore((s) => s.db.settings, shallow);
  const { fmt, fmtD } = useMoney();

  const [data, setData] = useState<Record<string, string>>({ ...EMPTY_DATA });
  const [sType, setSType] = useState("hotel");
  const [futureType, setFutureType] = useState<"real" | "dream">("real");
  const [tab, setTab] = useState("motivaciones");
  const [saved, setSaved] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configSection, setConfigSection] = useState("motivaciones");
  const [saveToolOpen, setSaveToolOpen] = useState(false);
  const {
    grouped,
    progressIds,
    canConfigure,
    userId,
    mergedAll,
    reload: reloadQuestions,
  } = useSurveyQuestions();
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const dirtyKeysRef = useRef(new Set());
  const hydratedRef = useRef(false);
  const focusedKeyRef = useRef(null);
  const skipAutosaveRef = useRef(true);
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
      Object.entries(bucket).forEach(([k, v]) => { loaded[k] = String(v ?? ""); });
      if (bucket.stype != null && !dirtyKeysRef.current.has("__stype")) {
        setSType(String(bucket.stype) || "hotel");
      }
      if (bucket.futureType != null && !dirtyKeysRef.current.has("__futureType")) {
        setFutureType(bucket.futureType === "dream" ? "dream" : "real");
      }
    }
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
    skipAutosaveRef.current = true;
  }, [ready, clientId, isFileMode, isShared, getBucket, getClient, prospectId, shared?.prospectId, toolsRevision]);

  const client = isFileMode ? (isShared ? session.prospect : (clientId ? getClient(clientId) : undefined)) : undefined;
  const countries = Object.keys(COUNTRY_CITY);
  const cities = data.svp_country ? (COUNTRY_CITY[data.svp_country] || ["Otro"]) : [];

  const result = useMemo(
    () => computeSurvey(data, sType),
    [data, sType, moneySettings?.currency, moneySettings?.exchangeRate, moneySettings?.language],
  );

  const discovery = useMemo(() => parseDiscovery(data.disc_json), [data.disc_json]);
  const answered = countAnswered(discovery, progressIds);
  const totalQuestions = progressIds.length;
  const progressPct = totalQuestions ? Math.round((answered / totalQuestions) * 100) : 0;

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

  const patchDiscovery = (partial) => {
    markFieldsDirty(dirtyKeysRef, "disc_json");
    setData((d) => {
      const current = parseDiscovery(d.disc_json);
      const next = {
        answers: partial.answers ?? current.answers,
        contexts: partial.contexts ?? current.contexts,
        hasTs: partial.hasTs !== undefined ? partial.hasTs : current.hasTs,
        memberships: partial.memberships ?? current.memberships,
      };
      return { ...d, disc_json: serializeDiscovery(next) };
    });
  };

  const persistBucket = async (payload, { silent } = {}) => {
    await saveBucket("survey", payload);
    if (!silent) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    }
  };

  const handleSave = async ({ openToolModal = true } = {}) => {
    if (readOnly) return false;
    const errors: Record<string, string> = {};
    const name = data.svp_name1?.trim() || "";
    if (!name) errors.svp_name1 = t("tools.survey.validationRequired");
    else if (!isValidSingleName(name)) errors.svp_name1 = t("tools.survey.validationSingleName");
    setValidationErrors(errors);
    if (Object.keys(errors).length) return false;
    await persistBucket({ ...data, stype: sType, futureType });
    if (isFileMode) await syncProspectFields(prospectPatchFromData(data));
    clearDirtyFields(dirtyKeysRef);
    hydratedRef.current = true;
    // Modal “guardar en expediente” solo al finalizar (o Guardar en Resumen), no al continuar tabs.
    if (!isFileMode && openToolModal) setSaveToolOpen(true);
    return true;
  };

  const TAB_FLOW_NEXT = {
    motivaciones: "timeshare",
    timeshare: "gastos",
  };

  const handleSaveFlow = async () => {
    if (readOnly) return;
    const advancing = Boolean(TAB_FLOW_NEXT[tab]);
    const ok = await handleSave({ openToolModal: !advancing });
    if (!ok) return;
    const next = TAB_FLOW_NEXT[tab];
    if (!next) return;
    setTab(next);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      const panel = document.querySelector(".survey-calc-page .disc-panel, .survey-calc-page .tool-calc-card, .survey-calc-page fieldset");
      panel?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    });
  };

  const saveFlowLabel = tab === "gastos"
    ? t("survey.disc.saveFinish")
    : (tab === "motivaciones" || tab === "timeshare")
      ? t("survey.disc.saveContinue")
      : t("common.save");

  const saveFlowHandler = (tab === "motivaciones" || tab === "timeshare" || tab === "gastos")
    ? handleSaveFlow
    : handleSave;

  // Autoguardado con el mismo bucket survey (tras hidratar; sin validar nombre para no bloquear captura).
  useEffect(() => {
    if (!ready || readOnly) return;
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    if (!hydratedRef.current && dirtyKeysRef.current.size === 0) return;
    const timer = setTimeout(() => {
      void (async () => {
        await saveBucket("survey", { ...data, stype: sType, futureType });
      })();
    }, 700);
    return () => clearTimeout(timer);
  }, [data, sType, futureType, ready, readOnly, saveBucket]);

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

  const openConfig = (sectionId) => {
    setConfigSection(sectionId === "timeshare" ? "timeshare" : "motivaciones");
    setConfigOpen(true);
  };

  const markSType = (v) => {
    markFieldsDirty(dirtyKeysRef, "__stype");
    setSType(v);
  };
  const markFutureType = (v) => {
    markFieldsDirty(dirtyKeysRef, "__futureType");
    setFutureType(v);
  };

  return (
    <>
      <Topbar title={t("tools.survey")} subtitle={isFileMode ? t("tools.sub.surveyClient") : t("tools.sub.free")} />
      <div className={`sales-page tool-calc-page survey-calc-page${!readOnly ? " tool-calc-page--with-save" : ""}`}>
        <div className="page-toolbar page-toolbar--between">
          <PageBack inline href={backHref} hasUnsavedChanges={() => dirtyKeysRef.current.size > 0} />
          {!readOnly && (
            <PageBack inline label={t("common.clear")} onClick={handleClear} showIcon={false} />
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

          <div className="disc-progress-bar" aria-live="polite">
            <span className="card-sub" style={{ marginBottom: 0 }}>
              {answered} de {totalQuestions} respondidas · {progressPct}%
            </span>
            <div className="progress" aria-hidden>
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <div className="seg disc-tabs" role="tablist" aria-label="Secciones del Discovery">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`seg-btn${tab === item.id ? " on" : ""}`}
                onClick={() => setTab(item.id)}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>

          <div className="card disc-tab-panel" role="tabpanel">
            {tab === "motivaciones" && (
              <MotivacionesPanel
                discovery={discovery}
                disabled={readOnly}
                onPatch={patchDiscovery}
                canConfigure={canConfigure && !readOnly}
                onConfigClick={() => openConfig("motivaciones")}
                beforeQuestions={grouped.motivacionesBefore}
                styleQuestions={grouped.styleQuestions}
                afterQuestions={grouped.motivacionesAfter}
              />
            )}
            {tab === "timeshare" && (
              <TimesharePanel
                discovery={discovery}
                disabled={readOnly}
                onPatch={patchDiscovery}
                canConfigure={canConfigure && !readOnly}
                onConfigClick={() => openConfig("timeshare")}
                timeshareQuestions={grouped.timeshareQuestions}
                hasTsQuestion={grouped.hasTsQuestion}
              />
            )}
            {tab === "gastos" && (
              <GastosPanel
                t={t}
                data={data}
                update={update}
                sType={sType}
                setSType={markSType}
                futureType={futureType}
                setFutureType={markFutureType}
                result={result}
                fmt={fmt}
                fmtD={fmtD}
                collab={collab}
                fid={fid}
                dirtyKeysRef={dirtyKeysRef}
                readOnly={readOnly}
                isFileMode={isFileMode}
              />
            )}
            {tab === "resumen" && (
              <ResumenPanel discovery={discovery} result={result} fmt={fmt} grouped={grouped} />
            )}
          </div>
        </fieldset>

        {!readOnly && (
          <div className="save-footer tool-save-footer">
            <span className={`save-confirm${saved ? " show" : ""}`}>{t("common.saved")}</span>
            <button type="button" className="btn btn-primary" onClick={saveFlowHandler}>
              {saveFlowLabel}
            </button>
          </div>
        )}
      </div>
      {!isShared && (
        <SaveToolModal open={saveToolOpen} onOpenChange={setSaveToolOpen} tool="survey" />
      )}
      <ConfigureQuestionsModal
        open={configOpen}
        onOpenChange={setConfigOpen}
        section={configSection}
        mergedAll={mergedAll}
        userId={userId}
        onSaved={reloadQuestions}
      />
    </>
  );
}
