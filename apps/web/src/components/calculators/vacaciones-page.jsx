
import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { SaveToolModal } from "@/components/calculators/save-tool-modal";
import { SharedToolBanner } from "@/components/calculators/shared-tool-banner.jsx";
import { computeVacaciones } from "@/lib/calculations/vacaciones";
import { selectOnFocus } from "@/lib/focus-select.js";
import { formatDecimalInput } from "@/lib/format/numeric-input.js";
import { formatMoneyValue } from "@/lib/format/money";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { useToolSession } from "@/hooks/use-tool-session.js";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";

const EMPTY_FIELDS = { vv: "", vc: "", va: "", vi: "" };

interface VacacionesPageProps {
  clientId?;
  shared?;
}

export function VacacionesPage({ clientId, shared }: VacacionesPageProps) {
  const { t } = useI18n();
  const { ready, readOnly, backHref, getBucket, saveBucket, isFileMode, isShared } = useToolSession({ clientId, shared });
  const { fmt, fmtN } = useMoney();
  const moneySettings = useDbStore((s) => s.db.settings, shallow);
  const [fields, setFields] = useState({ ...EMPTY_FIELDS });
  const [saved, setSaved] = useState(false);
  const [saveToolOpen, setSaveToolOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const b = getBucket("vacaciones");
    const next = Object.keys(b).length
      ? {
        vv: String(b.vv ?? ""), vc: String(b.vc ?? ""), va: String(b.va ?? ""), vi: String(b.vi ?? ""),
      }
      : { ...EMPTY_FIELDS };
    setFields((prev) => (
      prev.vv === next.vv && prev.vc === next.vc && prev.va === next.va && prev.vi === next.vi ? prev : next
    ));
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

  const currentYear = new Date().getFullYear();
  const futureYear = currentYear + r.anios;
  const inflationImpact = Math.max(0, r.tc - r.ts);

  const handleSave = async () => {
    if (readOnly) return;
    await saveBucket("vacaciones", fields);
    if (!isFileMode) { setSaveToolOpen(true); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <>
      <Topbar title={t("tools.vacation")} subtitle={t("tools.vacationDesc")} />
      <div className="sales-page tool-calc-page">
        <div className="page-toolbar page-toolbar--between">
          <PageBack inline href={backHref} />
          {!readOnly && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleClear}>{t("common.clear")}</button>
          )}
        </div>

        <SharedToolBanner show={readOnly} />

        <fieldset className="shared-tool-fieldset" disabled={readOnly}>
        <div className="g2 vacation-calc-layout">
          <div className="card tool-calc-card">
            <div className="card-heading">{t("tools.vacation.inputTitle")}</div>
            <div className="tool-calc-fields">
              <div className="frow frow-first tool-frow">
                <div className="flabel">{t("tools.vacation.tripsPerYear")}</div>
                <input type="number" inputMode="numeric" className="tool-num-input" min={1} value={fields.vv} onFocus={selectOnFocus} onChange={(e) => setFields({ ...fields, vv: e.target.value })} />
              </div>
              <div className="frow tool-frow">
                <div className="flabel">{t("tools.vacation.costPerTrip")}</div>
                <div className="mfield">
                  <span className="mpfx">$</span>
                  <input type="text" inputMode="decimal" value={fields.vc} onFocus={selectOnFocus} onChange={(e) => setFields({ ...fields, vc: formatDecimalInput(e.target.value) })} onBlur={(e) => setFields({ ...fields, vc: formatMoneyValue(e.target.value) })} />
                </div>
              </div>
              <div className="frow tool-frow">
                <div className="flabel">{t("tools.vacation.yearsProject")}</div>
                <input type="number" inputMode="numeric" className="tool-num-input" min={1} max={60} value={fields.va} onFocus={selectOnFocus} onChange={(e) => setFields({ ...fields, va: e.target.value })} />
              </div>
              <div className="frow tool-frow tool-frow--range">
                <div className="flabel">{t("tools.vacation.inflation")} — <strong style={{ color: "var(--blue)" }}>{(r.inf * 100).toFixed(1)}%</strong></div>
                <input type="range" className="tool-range-input" min={0} max={20} step={0.5} value={fields.vi} onChange={(e) => setFields({ ...fields, vi: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="vacation-projection">
            <div className="card vacation-results-card">
              <div className="card-heading vacation-results-heading">{t("tools.vacation.futureTitle")}</div>

              <div className="vacation-year-row">
                <div className="vacation-year-card vacation-year-card--current">
                  <div className="vacation-year-card-year">{currentYear}</div>
                  <div className="vacation-year-card-amount">{t("tools.vacation.perYear", { cost: fmt(r.ga) })}</div>
                  <div className="vacation-year-card-detail">{t("tools.vacation.tripsLine", { cost: fmtN(r.costo), trips: r.viajes })}</div>
                </div>
                <div className="vacation-year-card vacation-year-card--future">
                  <div className="vacation-year-card-year">{futureYear}</div>
                  <div className="vacation-year-card-amount">{t("tools.vacation.perYear", { cost: fmt(r.cf) })}</div>
                  <div className="vacation-year-card-detail">{t("tools.vacation.inflationAccum")}</div>
                </div>
              </div>
            </div>

            <div className="vacation-total-card">
              <div className="vacation-total-amount">{fmt(r.tc)}</div>
              <div className="vacation-total-label">{t("tools.vacation.totalInflation")}</div>
              <div className="vacation-total-sub">{t("tools.vacation.totalInflationSub", { years: r.anios })}</div>
            </div>

            <div className="vacation-split-row">
              <div className="vacation-panel vacation-panel--base">
                <div className="vacation-split-amount">{fmt(r.ts)}</div>
                <div className="vacation-panel-label">{t("tools.vacation.withoutInflation")}</div>
                <div className="vacation-panel-detail">{t("tools.vacation.noInflationLine", { cost: fmtN(r.ga), years: r.anios })}</div>
              </div>
              <div className="vacation-panel vacation-panel--impact">
                <div className="vacation-split-amount">{fmt(inflationImpact)}</div>
                <div className="vacation-panel-label">{t("tools.vacation.inflationImpact")}</div>
                <div className="vacation-panel-detail">{t("tools.vacation.inflationExtra")}</div>
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
