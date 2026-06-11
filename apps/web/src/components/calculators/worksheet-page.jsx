
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SalesModal } from "@/components/ui/sales-modal";
import { SaveToolModal } from "@/components/calculators/save-tool-modal";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { WS_CONFIG_IDS, WS_DEFAULTS } from "@/lib/constants";
import { computeWorksheet, ensureWSConfig } from "@/lib/calculations/worksheet";
import { resolveToolBackHref } from "@/lib/calculator-nav.js";
import { selectOnFocus } from "@/lib/focus-select.js";
import { formatMoneyValue } from "@/lib/format/money";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { useToolBucketReady } from "@/hooks/use-tool-bucket-ready";
import { useDbStore } from "@/stores/db-store";

const EMPTY_FIELDS = { wv: "", we: "", wcc: "", wob: "" };

interface WorksheetPageProps {
  clientId?;
}

export function WorksheetPage({ clientId }: WorksheetPageProps) {
  const { t } = useI18n();
  const backHref = resolveToolBackHref(clientId);
  const { fmt } = useMoney();
  const moneySettings = useDbStore((s) => s.db.settings);
  const { ready, mode } = useToolBucketReady(clientId);
  const db = useDbStore((s) => s.db);
  const getToolBucket = useDbStore((s) => s.getToolBucket);
  const saveToolBucket = useDbStore((s) => s.saveToolBucket);
  const [fields, setFields] = useState({ ...EMPTY_FIELDS });
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({ ...WS_DEFAULTS });
  const [saved, setSaved] = useState(false);
  const [saveToolOpen, setSaveToolOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const b = getToolBucket("worksheet", mode, clientId);
    const globalCfg = db.settings?.worksheetConfig || {};
    const cfg = ensureWSConfig({ ...globalCfg, ...b });
    setConfig(Object.fromEntries(WS_CONFIG_IDS.map((k) => [k, String(cfg[k] ?? WS_DEFAULTS[k])])));
    setFields({
      wv: String(b.wv ?? ""), we: String(b.we ?? ""),
      wcc: String(b.wcc ?? ""), wob: String(b.wob ?? ""),
    });
  }, [ready, clientId, getToolBucket, mode, db.settings?.worksheetConfig]);

  const handleClear = () => {
    setFields({ ...EMPTY_FIELDS });
    if (ready) saveToolBucket("worksheet", mode, { ...EMPTY_FIELDS, ...config }, clientId);
  };

  const result = useMemo(
    () => computeWorksheet(fields, config),
    [fields, config, moneySettings?.currency, moneySettings?.exchangeRate, moneySettings?.language],
  );

  const saveAll = () => {
    saveToolBucket("worksheet", mode, { ...fields, ...config }, clientId);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const handleSave = () => {
    saveToolBucket("worksheet", mode, { ...fields, ...config }, clientId);
    if (!clientId) { setSaveToolOpen(true); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const moneyField = (key: keyof typeof fields) => (
    <div className="mfield"><span className="mpfx">$</span>
      <input type="text" value={fields[key]} onFocus={selectOnFocus} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} onBlur={(e) => setFields({ ...fields, [key]: formatMoneyValue(e.target.value) })} />
    </div>
  );

  return (
    <>
      <Topbar title={t("tools.worksheet")} subtitle={clientId ? t("tools.sub.financing") : t("tools.sub.free")} />
      <div className="sales-page">
        <div className="page-head tool-page-head">
          <div className="tool-page-head-main">
            <PageBack inline={true} href={backHref} />
            <div className="tool-page-head-titles">
              <div className="page-title">{t("tools.worksheet")}</div>
              <div className="page-sub">{clientId ? t("tools.sub.file") : t("tools.sub.free")}</div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleClear}>{t("common.clear")}</button>
        </div>

        <div className="g2">
          <div className="card">
            <div className="card-heading">{t("tools.worksheet.saleData")}</div>
            <div className="frow"><div className="flabel">{t("tools.worksheet.saleAmount")}</div>{moneyField("wv")}</div>
            <div className="frow"><div className="flabel">{t("tools.worksheet.downPct")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" min={0} max={100} style={{ width: 65, padding: "7px 8px", border: "1px solid var(--border2)", borderRadius: 8, background: "var(--surface2)" }} value={fields.we} onFocus={selectOnFocus} onChange={(e) => setFields({ ...fields, we: e.target.value })} />
                <span style={{ color: "var(--muted)", fontSize: 13 }}>%</span>
              </div>
            </div>
            <div className="frow"><div className="flabel">{t("tools.worksheet.contractCost")}</div>{moneyField("wcc")}</div>
            <div className="frow"><div className="flabel">{t("tools.worksheet.prevBalance")}</div>{moneyField("wob")}</div>
            <div className="g2" style={{ marginTop: 14 }}>
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
              <button type="button" className="config-btn" onClick={() => setConfigOpen(true)} title={t("tools.worksheet.configTitle")} aria-label={t("tools.worksheet.configTitle")}>
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

        <div className="save-footer">
          <span className={`save-confirm${saved ? " show" : ""}`}>{t("common.saved")}</span>
          <button type="button" className="btn btn-primary" onClick={handleSave}>{t("common.save")}</button>
        </div>
        {clientId && (
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
              <div className="opt-body">
                <div className="opt-field"><label>{t("tools.worksheet.months")}</label>
                  <input type="number" min={1} value={config[`wo${n}m`]} onFocus={selectOnFocus} onChange={(e) => setConfig({ ...config, [`wo${n}m`]: e.target.value })} />
                </div>
                <div className="opt-field"><label>{t("tools.worksheet.annualRate")}</label>
                  <input type="number" min={0} step={0.01} value={config[`wo${n}r`]} onFocus={selectOnFocus} onChange={(e) => setConfig({ ...config, [`wo${n}r`]: e.target.value })} />
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
      <SaveToolModal open={saveToolOpen} onOpenChange={setSaveToolOpen} tool="worksheet" />
    </>
  );
}
