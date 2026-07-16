import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { useFeatureAccess } from "@/hooks/use-feature-access.js";
import { useI18n } from "@/hooks/use-i18n.js";
import {
  generateByDownPayment,
  generateByMonthly,
  monthlyPaymentsForScenarios,
  termsFromWorksheetConfig,
} from "@/lib/calculations/money-box";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";

function MoneyParts({ value }) {
  const n = Number(value || 0);
  const fixed = Math.abs(n).toFixed(2);
  const [whole, cents] = fixed.split(".");
  const formatted = Number(whole).toLocaleString("en-US");
  return (
    <span className="mb-value">
      {n < 0 ? "-" : ""}${formatted}
      <span className="mb-cents">{cents}</span>
    </span>
  );
}

function ResultTable({ results, dpPercentDisplay, financePercent, terms, t }) {
  return (
    <div className="mb-table-wrap">
      <table className="mb-result-table">
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
            <td className="mb-row-label">{t("moneyBox.sale")}</td>
            {results.map((r, i) => (
              <td key={`s-${i}`}><span className="mb-value sale"><MoneyParts value={r.sale} /></span></td>
            ))}
          </tr>
          <tr>
            <td className="mb-row-label">{t("moneyBox.downPayment")}</td>
            {results.map((r, i) => (
              <td key={`d-${i}`}>
                <div className="mb-dp-line">
                  <span className="mb-dp-percent">({dpPercentDisplay}%)</span>
                  <span className="mb-equal">=</span>
                  <span className="mb-value dp"><MoneyParts value={r.downPayment} /></span>
                </div>
              </td>
            ))}
          </tr>
          <tr className="mb-section-label">
            <td><span className="mb-section-title">{t("moneyBox.monthlySection")}</span></td>
            <td /><td /><td />
          </tr>
          {terms.map((term) => {
            const values = monthlyPaymentsForScenarios(results, financePercent, term);
            return (
              <tr key={term.label}>
                <td className="mb-month-label">
                  {term.label}
                  {term.desc ? <small>{term.desc}</small> : null}
                </td>
                {values.map((v, i) => (
                  <td key={`${term.label}-${i}`}><span className="mb-value monthly"><MoneyParts value={v} /></span></td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MoneyBoxPage({ clientId, shared }) {
  const { t } = useI18n();
  const { allowed, locked, loading, ready } = useFeatureAccess("money_box");
  const worksheetConfig = useDbStore((s) => s.db.settings?.worksheetConfig, shallow);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dpPercentDisplay, setDpPercentDisplay] = useState(30);
  const [adminFee, setAdminFee] = useState(0);
  const [downInput, setDownInput] = useState(2000);
  const [monthlyInput, setMonthlyInput] = useState(210);
  const [mobileTab, setMobileTab] = useState("eng");

  const terms = useMemo(
    () => termsFromWorksheetConfig(worksheetConfig, [
      t("moneyBox.termDesc1"),
      t("moneyBox.termDesc2"),
      t("moneyBox.termDesc3"),
    ]),
    [worksheetConfig, t],
  );

  const dpPercent = (Number(dpPercentDisplay) || 0) / 100;
  const financePercent = 1 - dpPercent;

  const engResults = useMemo(
    () => generateByDownPayment(Number(downInput) || 0, dpPercent),
    [downInput, dpPercent],
  );
  const monthResults = useMemo(
    () => generateByMonthly(Number(monthlyInput) || 0, dpPercent, financePercent, terms),
    [monthlyInput, dpPercent, financePercent, terms],
  );

  const backHref = shared?.contactId && shared?.prospectId
    ? `/red/contacto/${shared.contactId}/expediente/${shared.prospectId}`
    : clientId
      ? `/clients/${clientId}`
      : "/tools";

  // No redirigir mientras carga el plan: eso causaba Navigate prematuro al expediente/tools.
  if (loading || !ready) {
    return (
      <>
        <Topbar title={t("moneyBox.title")} subtitle={t("common.loading")} />
        <div className="sales-page money-box-page">
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
    pct: dpPercentDisplay,
    fee: Number(adminFee || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    count: terms.length,
  });

  return (
    <>
      <Topbar title={t("moneyBox.title")} subtitle={t("moneyBox.subtitle")} />
      <div className="sales-page money-box-page">
        <div className="page-toolbar">
          <PageBack inline href={backHref} fallback={backHref} />
        </div>

        <div className="mb-hero">
          <div>
            <h1 className="mb-hero-title">{t("moneyBox.title")}</h1>
            <p className="mb-hero-sub">{t("moneyBox.heroSub")}</p>
          </div>
          <div className="mb-status">
            <span className="mb-pill pro">{t("premium.badge")}</span>
            <span className="mb-pill ok">{t("moneyBox.active")}</span>
          </div>
        </div>

        <div className="mb-settings-strip">
          <button type="button" className="mb-strip-head" onClick={() => setSettingsOpen((v) => !v)}>
            <div>
              <div className="mb-strip-title">{t("moneyBox.restrictions")}</div>
              <div className="mb-strip-summary">{summary}</div>
            </div>
            <span className={`mb-chev${settingsOpen ? " open" : ""}`}>⌄</span>
          </button>
          {settingsOpen && (
            <div className="mb-settings-body">
              <div className="mb-config-grid">
                <div className="mb-field">
                  <label htmlFor="mb-dp">{t("moneyBox.minDown")}</label>
                  <div className="mb-input-wrap">
                    <input
                      id="mb-dp"
                      type="number"
                      min={1}
                      max={100}
                      value={dpPercentDisplay}
                      onChange={(e) => setDpPercentDisplay(e.target.value)}
                    />
                    <span>%</span>
                  </div>
                </div>
                <div className="mb-field">
                  <label htmlFor="mb-admin">{t("moneyBox.adminFee")}</label>
                  <div className="mb-input-wrap">
                    <span>$</span>
                    <input
                      id="mb-admin"
                      type="number"
                      min={0}
                      value={adminFee}
                      onChange={(e) => setAdminFee(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mb-field">
                  <label>{t("moneyBox.configuredTerms")}</label>
                  <div className="mb-term-list">
                    {terms.map((term) => (
                      <div key={term.label} className="mb-term-chip">
                        <div className="mb-term-name">{term.label}</div>
                        <div className="mb-term-desc">{term.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mb-mobile-tabs">
          <button type="button" className={`mb-tab${mobileTab === "eng" ? " active" : ""}`} onClick={() => setMobileTab("eng")}>
            {t("moneyBox.byDown")}
          </button>
          <button type="button" className={`mb-tab${mobileTab === "month" ? " active" : ""}`} onClick={() => setMobileTab("month")}>
            {t("moneyBox.byMonthly")}
          </button>
        </div>

        <div className="mb-money-grid">
          <article className={`mb-box eng${mobileTab === "eng" ? " mobile-active" : ""}`}>
            <div className="mb-box-head">
              <div>
                <div className="mb-box-title">{t("moneyBox.byDown")}</div>
                <div className="mb-box-sub">{t("moneyBox.byDownSub")}</div>
              </div>
            </div>
            <div className="mb-big-label">{t("moneyBox.downQuestion")}</div>
            <div className="mb-big-input">
              <span className="currency">$</span>
              <input type="number" value={downInput} onChange={(e) => setDownInput(e.target.value)} />
            </div>
            <div className="mb-options-title">{t("moneyBox.options")}</div>
            <ResultTable
              results={engResults}
              dpPercentDisplay={dpPercentDisplay}
              financePercent={financePercent}
              terms={terms}
              t={t}
            />
            <div className="mb-note"><strong>{t("moneyBox.reading")}</strong> {t("moneyBox.byDownNote")}</div>
          </article>
          <div className="mb-divider" aria-hidden />
          <article className={`mb-box month${mobileTab === "month" ? " mobile-active" : ""}`}>
            <div className="mb-box-head">
              <div>
                <div className="mb-box-title">{t("moneyBox.byMonthly")}</div>
                <div className="mb-box-sub">{t("moneyBox.byMonthlySub")}</div>
              </div>
            </div>
            <div className="mb-big-label">{t("moneyBox.monthlyQuestion")}</div>
            <div className="mb-big-input">
              <span className="currency">$</span>
              <input type="number" value={monthlyInput} onChange={(e) => setMonthlyInput(e.target.value)} />
            </div>
            <div className="mb-options-title">{t("moneyBox.options")}</div>
            <ResultTable
              results={monthResults}
              dpPercentDisplay={dpPercentDisplay}
              financePercent={financePercent}
              terms={terms}
              t={t}
            />
            <div className="mb-note"><strong>{t("moneyBox.reading")}</strong> {t("moneyBox.byMonthlyNote")}</div>
          </article>
        </div>
      </div>
    </>
  );
}
