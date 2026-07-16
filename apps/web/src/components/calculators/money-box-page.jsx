import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Wallet, CalendarDays } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { CollapsibleSection } from "@/components/ui/collapsible-section.jsx";
import { useFeatureAccess } from "@/hooks/use-feature-access.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { selectOnFocus } from "@/lib/focus-select.js";
import { formatMoneyValue, parseMoney, toDisplayAmount } from "@/lib/format/money";
import { formatDecimalInput } from "@/lib/format/numeric-input.js";
import {
  generateByDownPayment,
  generateByMonthly,
  monthlyPaymentsForScenarios,
  termsFromWorksheetConfig,
} from "@/lib/calculations/money-box";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";

/** Monto con centavos en superíndice; tipografía mono del sistema (td-*). */
function MoneyAmount({ value, tone = "sale" }) {
  const { settings } = useMoney();
  const amount = toDisplayAmount(Number(value || 0), settings);
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, cents] = fixed.split(".");
  const locale = settings.language === "en" ? "en-US" : "es-MX";
  const formatted = Number(whole).toLocaleString(locale);
  const toneClass = tone === "dp" ? "td-green" : tone === "monthly" ? "td-purple" : "td-blue";
  return (
    <span className={toneClass} style={{ whiteSpace: "nowrap" }}>
      {amount < 0 ? "-" : ""}${formatted}
      <span className="money-cents">{cents}</span>
    </span>
  );
}

function ResultTable({ results, dpPercentDisplay, financePercent, terms, t }) {
  return (
    <div className="table-scroll">
      <table className="dtbl pattern-table">
        <thead>
          <tr>
            <th />
            <th>{t("moneyBox.option", { n: 1 })}</th>
            <th>{t("moneyBox.option", { n: 2 })}</th>
            <th>{t("moneyBox.option", { n: 3 })}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t("moneyBox.sale")}</td>
            {results.map((r, i) => (
              <td key={`s-${i}`}><MoneyAmount value={r.sale} tone="sale" /></td>
            ))}
          </tr>
          <tr>
            <td>{t("moneyBox.downPayment")}</td>
            {results.map((r, i) => (
              <td key={`d-${i}`}>
                <span className="money-box-dp-line">
                  <span className="network-pill ok money-box-dp-chip">
                    ({dpPercentDisplay}%)
                  </span>
                  <span className="money-box-dp-eq">=</span>
                  <MoneyAmount value={r.downPayment} tone="dp" />
                </span>
              </td>
            ))}
          </tr>
          <tr className="money-box-section-row">
            <td colSpan={4}>
              <strong>{t("moneyBox.monthlySection")}</strong>
            </td>
          </tr>
          {terms.map((term) => {
            const values = monthlyPaymentsForScenarios(results, financePercent, term);
            return (
              <tr key={term.label}>
                <td className="money-box-month-label">
                  {term.label}
                  {term.desc ? <small>{term.desc}</small> : null}
                </td>
                {values.map((v, i) => (
                  <td key={`${term.label}-${i}`}>
                    <MoneyAmount value={v} tone="monthly" />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
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
  icon: Icon,
  iconTone,
  results,
  note,
  dpPercentDisplay,
  financePercent,
  terms,
  t,
  mobileActive,
}) {
  return (
    <div className={`card tool-calc-card${mobileActive ? " is-mobile-active" : ""}`}>
      <div className="money-box-panel-head">
        <div>
          <div className="card-heading">{title}</div>
          <div className="card-sub" style={{ marginBottom: 0 }}>{subtitle}</div>
        </div>
        <div className={`tool-icon ${iconTone}`}>
          <Icon size={20} />
        </div>
      </div>

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

      <div className="card-heading" style={{ marginTop: 18, marginBottom: 10 }}>
        {t("moneyBox.options")}
      </div>
      <ResultTable
        results={results}
        dpPercentDisplay={dpPercentDisplay}
        financePercent={financePercent}
        terms={terms}
        t={t}
      />

      <div className="hint" style={{ marginTop: 14 }}>
        <strong>{t("moneyBox.reading")}</strong>
        {" "}
        {note}
      </div>
    </div>
  );
}

export function MoneyBoxPage({ clientId, shared }) {
  const { t } = useI18n();
  const { fmtN2 } = useMoney();
  const { allowed, locked, loading, ready } = useFeatureAccess("money_box");
  const worksheetConfig = useDbStore((s) => s.db.settings?.worksheetConfig, shallow);

  const [dpPercentDisplay, setDpPercentDisplay] = useState("30");
  const [adminFee, setAdminFee] = useState("0");
  const [downInput, setDownInput] = useState("2000");
  const [monthlyInput, setMonthlyInput] = useState("210");
  const [mobileTab, setMobileTab] = useState("eng");

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

        <div className="money-box-hero">
          <div>
            <div className="card-heading">{t("moneyBox.title")}</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>{t("moneyBox.heroSub")}</div>
          </div>
          <div className="money-box-status">
            <span className="premium-pro-badge">{t("moneyBox.proPill")}</span>
            <span className="network-pill ok">{t("moneyBox.active")}</span>
          </div>
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

        <div className="money-box-mobile-tabs">
          <div className="seg">
            <button
              type="button"
              className={`seg-btn${mobileTab === "eng" ? " on" : ""}`}
              onClick={() => setMobileTab("eng")}
            >
              {t("moneyBox.byDown")}
            </button>
            <button
              type="button"
              className={`seg-btn${mobileTab === "month" ? " on" : ""}`}
              onClick={() => setMobileTab("month")}
            >
              {t("moneyBox.byMonthly")}
            </button>
          </div>
        </div>

        <div className="g2 money-box-panels" style={{ marginTop: 16 }}>
          <MoneyPanel
            title={t("moneyBox.byDown")}
            subtitle={t("moneyBox.byDownSub")}
            question={t("moneyBox.downQuestion")}
            value={downInput}
            onChange={setDownInput}
            onBlur={setDownInput}
            icon={Wallet}
            iconTone="green"
            results={engResults}
            note={t("moneyBox.byDownNote")}
            dpPercentDisplay={dpPercentDisplay}
            financePercent={financePercent}
            terms={terms}
            t={t}
            mobileActive={mobileTab === "eng"}
          />
          <MoneyPanel
            title={t("moneyBox.byMonthly")}
            subtitle={t("moneyBox.byMonthlySub")}
            question={t("moneyBox.monthlyQuestion")}
            value={monthlyInput}
            onChange={setMonthlyInput}
            onBlur={setMonthlyInput}
            icon={CalendarDays}
            iconTone="purple"
            results={monthResults}
            note={t("moneyBox.byMonthlyNote")}
            dpPercentDisplay={dpPercentDisplay}
            financePercent={financePercent}
            terms={terms}
            t={t}
            mobileActive={mobileTab === "month"}
          />
        </div>
      </div>
    </>
  );
}
