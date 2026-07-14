
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SalesModal } from "@/components/ui/sales-modal";
import { SaveToolModal } from "@/components/calculators/save-tool-modal";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { SharedToolBanner } from "@/components/calculators/shared-tool-banner.jsx";
import { WS_CONFIG_IDS, WS_DEFAULTS } from "@/lib/constants";
import { computeWorksheet, ensureWSConfig } from "@/lib/calculations/worksheet";
import { selectOnFocus } from "@/lib/focus-select.js";
import { formatMoneyValue } from "@/lib/format/money";
import { formatDecimalInput } from "@/lib/format/numeric-input.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { useToolSession } from "@/hooks/use-tool-session.js";
import { useFlushLibreToolOnLeave } from "@/hooks/use-flush-libre-tool-on-leave.js";
import { CollabField, collabFieldId } from "@/components/clients/collab-field.jsx";
import { applyRemoteFormState, fieldKeyFromCollabId, markFieldsDirty, clearDirtyFields } from "@/lib/collab-form-merge.js";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";

const EMPTY_FIELDS = { wv: "", we: "", wcc: "", wob: "" };

interface WorksheetPageProps {
  clientId?;
  shared?;
}

export function WorksheetPage({ clientId, shared }: WorksheetPageProps) {
  const { t } = useI18n();
  const session = useToolSession({ clientId, shared, section: "worksheet" });
  const { ready, readOnly, backHref, getBucket, saveBucket, isFileMode, isShared, peers, lockedBy, toolsRevision, collab } = session;
  const fid = (key) => collabFieldId("worksheet", key);
  const { fmt } = useMoney();
  const moneySettings = useDbStore((s) => s.db.settings, shallow);
  const worksheetConfig = useDbStore((s) => s.db.settings?.worksheetConfig, shallow);
  const [fields, setFields] = useState({ ...EMPTY_FIELDS });
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({ ...WS_DEFAULTS });
  const [saved, setSaved] = useState(false);
  const [saveToolOpen, setSaveToolOpen] = useState(false);
  const dirtyKeysRef = useRef(new Set());
  const hydratedRef = useRef(false);
  const focusedKeyRef = useRef(null);
  focusedKeyRef.current = fieldKeyFromCollabId(collab?.myFocusedField, "worksheet");

  useFlushLibreToolOnLeave({
    enabled: ready && !isFileMode,
    tool: "worksheet",
    getSnapshot: () => ({ ...fields, ...config }),
    hasChanges: () => dirtyKeysRef.current.size > 0,
  });

  useEffect(() => {
    if (!ready) return;
    const b = getBucket("worksheet");
    const globalCfg = worksheetConfig || {};
    const cfg = ensureWSConfig({ ...globalCfg, ...b });
    setConfig((prev) => {
      const next = Object.fromEntries(WS_CONFIG_IDS.map((k) => [k, String(cfg[k] ?? WS_DEFAULTS[k])]));
      const keys = Object.keys(next);
      if (keys.every((k) => prev[k] === next[k])) return prev;
      return next;
    });
    const next = {
      wv: String(b.wv ?? ""), we: String(b.we ?? ""),
      wcc: String(b.wcc ?? ""), wob: String(b.wob ?? ""),
    };
    setFields((prev) => applyRemoteFormState(prev, next, {
      dirtyKeys: dirtyKeysRef.current,
      focusedKey: focusedKeyRef.current,
      hydratedRef,
    }));
  }, [ready, clientId, getBucket, worksheetConfig, shared?.prospectId, toolsRevision]);

  const handleClear = async () => {
    if (readOnly) return;
    setFields({ ...EMPTY_FIELDS });
    clearDirtyFields(dirtyKeysRef);
    if (ready) await saveBucket("worksheet", { ...EMPTY_FIELDS, ...config });
  };

  const result = useMemo(
    () => computeWorksheet(fields, config),
    [fields, config, moneySettings?.currency, moneySettings?.exchangeRate, moneySettings?.language],
  );

  const setField = (key, value) => {
    markFieldsDirty(dirtyKeysRef, key);
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const saveAll = async () => {
    if (readOnly) return;
    await saveBucket("worksheet", { ...fields, ...config });
    clearDirtyFields(dirtyKeysRef);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const handleSave = async () => {
    if (readOnly) return;
    await saveBucket("worksheet", { ...fields, ...config });
    clearDirtyFields(dirtyKeysRef);
    if (!isFileMode) { setSaveToolOpen(true); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const moneyField = (key: keyof typeof fields) => (
    <div className="mfield"><span className="mpfx">$</span>
      <CollabField collab={collab} fieldId={fid(key)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
        {(lp) => (
          <input type="text" inputMode="decimal" value={fields[key]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={(e) => { lp.onBlur?.(e); setField(key, formatMoneyValue(e.target.value)); }} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => setField(key, formatDecimalInput(e.target.value))} />
        )}
      </CollabField>
    </div>
  );

  return (
    <>
      <Topbar title={t("tools.worksheet")} subtitle={isFileMode ? t("tools.sub.financing") : t("tools.sub.free")} />
      <div className="sales-page tool-calc-page">
        <div className="page-toolbar page-toolbar--between">
          <PageBack inline href={backHref} />
          {!readOnly && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleClear}>{t("common.clear")}</button>
          )}
        </div>

        <SharedToolBanner show={ready && isShared && readOnly} peers={peers} />

        <fieldset className="shared-tool-fieldset" disabled={readOnly}>
        <div className="g2">
          <div className="card tool-calc-card">
            <div className="card-heading">{t("tools.worksheet.saleData")}</div>
            <div className="tool-calc-fields">
              <div className="frow frow-first tool-frow">
                <div className="flabel">{t("tools.worksheet.saleAmount")}</div>
                {moneyField("wv")}
              </div>
              <div className="frow tool-frow">
                <div className="flabel">{t("tools.worksheet.downPct")}</div>
                <div className="frow-inline">
                  <CollabField collab={collab} fieldId={fid("we")} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                    {(lp) => (
                      <input type="number" inputMode="numeric" className={`tool-num-input ${lp.className || ""}`.trim()} min={0} max={100} value={fields.we} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => setField("we", e.target.value)} />
                    )}
                  </CollabField>
                  <span className="frow-suffix">%</span>
                </div>
              </div>
              <div className="frow tool-frow">
                <div className="flabel">{t("tools.worksheet.contractCost")}</div>
                {moneyField("wcc")}
              </div>
              <div className="frow tool-frow">
                <div className="flabel">{t("tools.worksheet.prevBalance")}</div>
                {moneyField("wob")}
              </div>
            </div>
            <div className="g2 survey-result-pair" style={{ marginTop: 14 }}>
              <div className="vbox blue"><div className="vbox-val">{fmt(result.eng)}</div><div className="vbox-label">{t("tools.worksheet.down")}</div></div>
              <div className="vbox green"><div className="vbox-val">{fmt(result.engCc)}</div><div className="vbox-label">{t("tools.worksheet.downContract")}</div></div>
              <div className="vbox yellow span2"><div className="vbox-val">{fmt(result.bal)}</div><div className="vbox-label">{t("tools.worksheet.toFinance")}</div><div className="vbox-sub">{t("tools.worksheet.balanceFormula")}</div></div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div className="card-heading">{t("tools.worksheet.options")}</div>
                <div className="card-sub">{t("tools.worksheet.optionsSub")}</div>
              </div>
              <button type="button" className="config-btn" onClick={() => setConfigOpen(true)} title={t("tools.worksheet.configTitle")} aria-label={t("tools.worksheet.configTitle")} disabled={readOnly}>
                <Settings />
              </button>
            </div>
            {result.options.map((opt, i) => (
              <div key={i} className="opt-block">
                <div className="opt-head">
                  <div>
                    <div className="opt-tag">{t("tools.worksheet.optionN", { n: i + 1 })}</div>
                    <div className="opt-info">{t("tools.worksheet.optionLine", { months: config[`wo${i + 1}m`], rate: config[`wo${i + 1}r`] })}</div>
                  </div>
                  <div className="opt-result">{fmt(opt.monthly)}{t("tools.worksheet.perMonth")}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        </fieldset>

        {!readOnly && (
          <div className="save-footer">
            <span className={`save-confirm${saved ? " show" : ""}`}>{t("common.saved")}</span>
            <button type="button" className="btn btn-primary" onClick={handleSave}>{t("common.save")}</button>
          </div>
        )}
        {clientId && !isShared && (
          <div className="save-footer" style={{ marginTop: 8 }}>
            <Link to={`/clients/${clientId}?openSale=1&from=worksheet`} className="btn btn-primary">{t("tools.worksheet.registerSale")}</Link>
          </div>
        )}
      </div>

      <SalesModal open={configOpen} onOpenChange={setConfigOpen} title={t("tools.worksheet.configTitle")} sub={t("tools.worksheet.configSub")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[1, 2, 3].map((n) => (
            <div key={n} className="opt-block" style={{ marginTop: 0 }}>
              <div className="opt-head">
                <div><div className="opt-tag">{t("tools.worksheet.optionN", { n })}</div><div className="opt-info">{t("tools.worksheet.configSub")}</div></div>
              </div>
              <div className="opt-body worksheet-opt-body">
                <div className="opt-field">
                  <label>{t("tools.worksheet.months")}</label>
                  <input type="text" inputMode="numeric" value={config[`wo${n}m`]} onFocus={selectOnFocus} onChange={(e) => setConfig({ ...config, [`wo${n}m`]: e.target.value.replace(/[^\d]/g, "") })} />
                </div>
                <div className="opt-field">
                  <label>{t("tools.worksheet.annualRate")}</label>
                  <span className="settings-pct-field">
                    <input type="text" inputMode="decimal" value={config[`wo${n}r`]} onFocus={selectOnFocus} onChange={(e) => setConfig({ ...config, [`wo${n}r`]: e.target.value.replace(/[^\d.]/g, "") })} />
                    <span className="settings-pct-suffix">%</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={() => setConfigOpen(false)}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-primary" onClick={() => { setConfigOpen(false); saveAll(); }}>{t("common.save")}</button>
        </div>
      </SalesModal>
      {!isShared && (
        <SaveToolModal open={saveToolOpen} onOpenChange={setSaveToolOpen} tool="worksheet" />
      )}
    </>
  );
}
