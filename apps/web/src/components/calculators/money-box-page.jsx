import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { CollapsibleSection } from "@/components/ui/collapsible-section.jsx";
import { useFeatureAccess } from "@/hooks/use-feature-access.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { selectOnFocus } from "@/lib/focus-select.js";
import { formatMoneyValue, parseMoney } from "@/lib/format/money";
import { formatDecimalInput } from "@/lib/format/numeric-input.js";
import {
  factorFor,
  generateByDownPayment,
  generateByMonthly,
  termsFromWorksheetConfig,
} from "@/lib/calculations/money-box";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";

/**
 * Tres escenarios como tarjetas (mismo patrón Worksheet opt-block + Survey vbox),
 * no tabla plana: Venta (azul) → Enganche (verde) → plazos (amarillo).
 */
function OptionScenarios({ results, dpPercentDisplay, financePercent, terms, t, fmt }) {
  return (
    <div>
      {results.map((scenario, index) => (
        <div key={index} className="opt-block">
          <div className="opt-head no-toggle">
            <div>
              <div className="opt-tag">{t("moneyBox.option", { n: index + 1 })}</div>
            </div>
          </div>
          <div className="opt-body" style={{ display: "flex", flexDirection: "column", gap: 12, flexWrap: "nowrap" }}>
            <div className="vbox blue">
              <div className="vbox-val">{fmt(scenario.sale)}</div>
              <div className="vbox-label">{t("moneyBox.sale")}</div>
            </div>
            <div className="vbox green">
              <div className="vbox-val">{fmt(scenario.downPayment)}</div>
              <div className="vbox-label">{t("moneyBox.downPayment")}</div>
              <div className="vbox-sub">
                {t("moneyBox.downPctSub", { pct: dpPercentDisplay })}
              </div>
            </div>
            <div>
              <div className="card-sub" style={{ marginBottom: 8 }}>
                {t("moneyBox.monthlySection")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {terms.map((term) => {
                  const monthly =
                    scenario.sale * financePercent * factorFor(term.months, term.annualRate);
                  return (
                    <div key={term.label} className="vbox yellow">
                      <div className="vbox-val">{fmt(monthly)}</div>
                      <div className="vbox-label">{term.label}</div>
                      {term.desc ? <div className="vbox-sub">{term.desc}</div> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MoneyPanel({
  title,
  subtitle,
  question,
  value,
  onChange,
  onBlur,
  optionsTitle,
  results,
  note,
  dpPercentDisplay,
  financePercent,
  terms,
  t,
  fmt,
}) {
  return (
    <div className="card tool-calc-card">
      <div className="card-heading">{title}</div>
      <div className="card-sub">{subtitle}</div>
      <div className="tool-calc-fields">
        <div className="frow frow-first tool-frow">
          <div className="flabel">{question}</div>
          <div className="mfield">
            <span className="mpfx">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onFocus={selectOnFocus}
              onChange={(e) => onChange(formatDecimalInput(e.target.value))}
              onBlur={(e) => onBlur(formatMoneyValue(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="card-heading" style={{ marginTop: 18 }}>{optionsTitle}</div>
      <div className="card-sub">{t("moneyBox.optionsSub")}</div>
      <OptionScenarios
        results={results}
        dpPercentDisplay={dpPercentDisplay}
        financePercent={financePercent}
        terms={terms}
        t={t}
        fmt={fmt}
      />

      <div className="card-sub" style={{ marginTop: 16, marginBottom: 0 }}>
        <strong>{t("moneyBox.reading")}</strong>
        {" "}
        {note}
      </div>
    </div>
  );
}

export function MoneyBoxPage({ clientId, shared }) {
  const { t } = useI18n();
  const { fmt, fmtN2 } = useMoney();
  const { allowed, locked, loading, ready } = useFeatureAccess("money_box");
  const worksheetConfig = useDbStore((s) => s.db.settings?.worksheetConfig, shallow);

  const [dpPercentDisplay, setDpPercentDisplay] = useState("30");
  const [adminFee, setAdminFee] = useState("0");
  const [downInput, setDownInput] = useState("2000");
  const [monthlyInput, setMonthlyInput] = useState("210");

  const terms = useMemo(
    () => termsFromWorksheetConfig(worksheetConfig, [
      t("moneyBox.termDesc1"),
      t("moneyBox.termDesc2"),
      t("moneyBox.termDesc3"),
    ]),
    [worksheetConfig, t],
  );

  const dpPercent = parseMoney(dpPercentDisplay) / 100;
  const financePercent = 1 - dpPercent;

  const engResults = useMemo(
    () => generateByDownPayment(parseMoney(downInput), dpPercent),
    [downInput, dpPercent],
  );
  const monthResults = useMemo(
    () => generateByMonthly(parseMoney(monthlyInput), dpPercent, financePercent, terms),
    [monthlyInput, dpPercent, financePercent, terms],
  );

  const backHref = shared?.contactId && shared?.prospectId
    ? `/red/contacto/${shared.contactId}/expediente/${shared.prospectId}`
    : clientId
      ? `/clients/${clientId}`
      : "/tools";

  if (loading || !ready) {
    return (
      <>
        <Topbar title={t("moneyBox.title")} subtitle={t("common.loading")} />
        <div className="sales-page tool-calc-page">
          <div className="page-toolbar">
            <PageBack inline href={backHref} fallback={backHref} />
          </div>
          <div className="admin-embedded-loading">{t("common.loading")}</div>
        </div>
      </>
    );
  }

  if (locked || !allowed) {
    return <Navigate to={backHref} replace />;
  }

  const summary = t("moneyBox.restrictionSummary", {
    pct: dpPercentDisplay || "0",
    fee: fmtN2(parseMoney(adminFee)),
    count: terms.length,
  });

  return (
    <>
      <Topbar title={t("moneyBox.title")} subtitle={t("moneyBox.subtitle")} />
      <div className="sales-page tool-calc-page">
        <div className="page-toolbar">
          <PageBack inline href={backHref} fallback={backHref} />
        </div>

        <CollapsibleSection
          className="card"
          title={<div className="card-heading">{t("moneyBox.restrictions")}</div>}
          subtitle={summary}
          defaultOpen={false}
        >
          <div className="tool-calc-fields">
            <div className="frow frow-first tool-frow">
              <div className="flabel">{t("moneyBox.minDown")}</div>
              <div className="frow-inline">
                <input
                  id="mb-dp"
                  type="number"
                  className="tool-num-input"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={dpPercentDisplay}
                  onFocus={selectOnFocus}
                  onChange={(e) => setDpPercentDisplay(e.target.value)}
                />
                <span className="frow-suffix">%</span>
              </div>
            </div>
            <div className="frow tool-frow">
              <div className="flabel">{t("moneyBox.adminFee")}</div>
              <div className="mfield">
                <span className="mpfx">$</span>
                <input
                  id="mb-admin"
                  type="text"
                  inputMode="decimal"
                  value={adminFee}
                  onFocus={selectOnFocus}
                  onChange={(e) => setAdminFee(formatDecimalInput(e.target.value))}
                  onBlur={(e) => setAdminFee(formatMoneyValue(e.target.value))}
                />
              </div>
            </div>
          </div>
          <div className="card-heading" style={{ marginTop: 16 }}>{t("moneyBox.configuredTerms")}</div>
          {terms.map((term) => (
            <div key={term.label} className="opt-block">
              <div className="opt-head no-toggle">
                <div>
                  <div className="opt-tag">{term.label}</div>
                  {term.desc ? <div className="opt-info">{term.desc}</div> : null}
                </div>
              </div>
            </div>
          ))}
        </CollapsibleSection>

        <div className="g2" style={{ marginTop: 16 }}>
          <MoneyPanel
            title={t("moneyBox.byDown")}
            subtitle={t("moneyBox.byDownSub")}
            question={t("moneyBox.downQuestion")}
            value={downInput}
            onChange={setDownInput}
            onBlur={setDownInput}
            optionsTitle={t("moneyBox.options")}
            results={engResults}
            note={t("moneyBox.byDownNote")}
            dpPercentDisplay={dpPercentDisplay}
            financePercent={financePercent}
            terms={terms}
            t={t}
            fmt={fmt}
          />
          <MoneyPanel
            title={t("moneyBox.byMonthly")}
            subtitle={t("moneyBox.byMonthlySub")}
            question={t("moneyBox.monthlyQuestion")}
            value={monthlyInput}
            onChange={setMonthlyInput}
            onBlur={setMonthlyInput}
            optionsTitle={t("moneyBox.options")}
            results={monthResults}
            note={t("moneyBox.byMonthlyNote")}
            dpPercentDisplay={dpPercentDisplay}
            financePercent={financePercent}
            terms={terms}
            t={t}
            fmt={fmt}
          />
        </div>
      </div>
    </>
  );
}
