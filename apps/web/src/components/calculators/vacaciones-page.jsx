
import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { SaveToolModal } from "@/components/calculators/save-tool-modal";
import { SharedToolBanner } from "@/components/calculators/shared-tool-banner.jsx";
import { computeVacaciones } from "@/lib/calculations/vacaciones";
import { selectOnFocus } from "@/lib/focus-select.js";
import { formatMoneyValue } from "@/lib/format/money";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { useToolSession } from "@/hooks/use-tool-session.js";
import { useDbStore } from "@/stores/db-store";

const EMPTY_FIELDS = { vv: "", vc: "", va: "", vi: "" };

interface VacacionesPageProps {
  clientId?;
  shared?;
}

export function VacacionesPage({ clientId, shared }: VacacionesPageProps) {
  const { t } = useI18n();
  const { ready, readOnly, backHref, getBucket, saveBucket, isFileMode, isShared } = useToolSession({ clientId, shared });
  const { fmt, fmtN } = useMoney();
  const moneySettings = useDbStore((s) => s.db.settings);
  const [fields, setFields] = useState({ ...EMPTY_FIELDS });
  const [saved, setSaved] = useState(false);
  const [saveToolOpen, setSaveToolOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const b = getBucket("vacaciones");
    if (Object.keys(b).length) {
      setFields({
        vv: String(b.vv ?? ""), vc: String(b.vc ?? ""), va: String(b.va ?? ""), vi: String(b.vi ?? ""),
      });
    } else {
      setFields({ ...EMPTY_FIELDS });
    }
  }, [ready, clientId, getBucket, shared?.prospectId]);

  const handleClear = async () => {
    if (readOnly) return;
    setFields({ ...EMPTY_FIELDS });
    if (ready) await saveBucket("vacaciones", { ...EMPTY_FIELDS });
  };

  const r = useMemo(
    () => computeVacaciones(fields),
    [fields, moneySettings?.currency, moneySettings?.exchangeRate, moneySettings?.language],
  );

  const handleSave = async () => {
    if (readOnly) return;
    await saveBucket("vacaciones", fields);
    if (!isFileMode) { setSaveToolOpen(true); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <>
      <Topbar title={t("tools.vacation")} subtitle={isFileMode ? t("tools.sub.inflation") : t("tools.sub.free")} />
      <div className="sales-page">
        <div className="page-toolbar page-toolbar--between">
          <PageBack inline href={backHref} />
          {!readOnly && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleClear}>{t("common.clear")}</button>
          )}
        </div>

        <SharedToolBanner show={readOnly} />

        <fieldset className="shared-tool-fieldset" disabled={readOnly}>
        <div className="g2">
          <div className="card">
            <div className="card-heading">{t("tools.vacation.inputTitle")}</div>
            <div className="frow"><div className="flabel">{t("tools.vacation.tripsPerYear")}</div>
              <input type="number" min={1} style={{ width: 80, padding: "7px 8px", border: "1px solid var(--border2)", borderRadius: 8, background: "var(--surface2)" }} value={fields.vv} onFocus={selectOnFocus} onChange={(e) => setFields({ ...fields, vv: e.target.value })} />
            </div>
            <div className="frow"><div className="flabel">{t("tools.vacation.costPerTrip")}</div>
              <div className="mfield"><span className="mpfx">$</span>
                <input type="text" value={fields.vc} onFocus={selectOnFocus} onChange={(e) => setFields({ ...fields, vc: e.target.value })} onBlur={(e) => setFields({ ...fields, vc: formatMoneyValue(e.target.value) })} />
              </div>
            </div>
            <div className="frow"><div className="flabel">{t("tools.vacation.yearsProject")}</div>
              <input type="number" min={1} max={60} style={{ width: 80, padding: "7px 8px", border: "1px solid var(--border2)", borderRadius: 8, background: "var(--surface2)" }} value={fields.va} onFocus={selectOnFocus} onChange={(e) => setFields({ ...fields, va: e.target.value })} />
            </div>
            <div className="frow"><div className="flabel">{t("tools.vacation.inflation")} — <strong style={{ color: "var(--blue)" }}>{(r.inf * 100).toFixed(1)}%</strong></div>
              <input type="range" min={0} max={20} step={0.5} value={fields.vi} onChange={(e) => setFields({ ...fields, vi: e.target.value })} style={{ width: 130, accentColor: "var(--blue)" }} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card">
              <div className="card-heading" style={{ marginBottom: 16 }}>{t("tools.vacation.futureTitle")}</div>
              <div className="vacation-compare-grid">
                <div className="vbox blue">
                  <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".8px", fontWeight: 700, marginBottom: 8 }}>{t("tools.vacation.currentYear")}</div>
                  <div className="vbox-val">{t("tools.vacation.perYear", { cost: fmt(r.ga) })}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{t("tools.vacation.tripsLine", { cost: fmtN(r.costo), trips: r.viajes })}</div>
                </div>
                <div className="vacation-compare-arrow" aria-hidden="true">→</div>
                <div className="vbox yellow">
                  <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".8px", fontWeight: 700, marginBottom: 8 }}>{t("tools.vacation.futureYear", { year: r.futAno })}</div>
                  <div className="vbox-val">{t("tools.vacation.perYear", { cost: fmt(r.cf) })}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{t("tools.vacation.inflationAccum")}</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="vbox yellow" style={{ textAlign: "center", padding: 20 }}>
                  <div className="vbox-val" style={{ fontSize: 36, letterSpacing: "-2px" }}>{fmt(r.tc)}</div>
                  <div className="vbox-label" style={{ fontSize: 12, marginTop: 8 }}>{t("tools.vacation.totalInflation")}</div>
                  <div className="vbox-sub">{t("tools.vacation.totalInflationSub", { years: r.anios })}</div>
                </div>
                <div className="g2">
                  <div className="vbox blue"><div className="vbox-val">{fmt(r.ts)}</div><div className="vbox-label">{t("tools.vacation.withoutInflation")}</div><div className="vbox-sub">{t("tools.vacation.noInflationLine", { cost: fmtN(r.ga), years: r.anios })}</div></div>
                  <div className="vbox red"><div className="vbox-val">{fmt(Math.max(0, r.tc - r.ts))}</div><div className="vbox-label">{t("tools.vacation.inflationImpact")}</div><div className="vbox-sub">{t("tools.vacation.inflationExtra")}</div></div>
                </div>
              </div>
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
