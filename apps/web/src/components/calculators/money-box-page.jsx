import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Wallet, CalendarDays, Layers, RefreshCw } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { CollapsibleSection } from "@/components/ui/collapsible-section.jsx";
import { useFeatureAccess } from "@/hooks/use-feature-access.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { selectOnFocus } from "@/lib/focus-select.js";
import { formatMoneyValue, parseMoney, toDisplayAmount } from "@/lib/format/money";
import { formatMoneyInput } from "@/lib/format/numeric-input.js";
import {
  defaultPolicyConfig,
  fromCents,
  generateCombinedProposals,
  generateDownProposals,
  generateMonthlyProposals,
  round2,
  termsFromWorksheetConfig,
  toCents,
} from "@/lib/calculations/money-box";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";

/** Monto con centavos en superíndice; tipografía mono del sistema (td-*). Redondeo solo al mostrar. */
function MoneyAmount({ value, tone = "sale" }) {
  const { settings } = useMoney();
  const amount = round2(toDisplayAmount(Number(value || 0), settings));
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

function ProposalMatrix({ proposals, terms, showTotalToday, t }) {
  const columns = [0, 1, 2].map((i) => proposals[i] || null);
  const filled = columns.filter(Boolean).length;

  if (!filled) {
    return <div className="hint" style={{ marginTop: 8 }}>{t("moneyBox.emptyProposals")}</div>;
  }

  return (
    <div className="table-scroll money-box-matrix-scroll">
      <table className="dtbl pattern-table money-box-matrix">
        <thead>
          <tr>
            <th className="money-box-matrix-sticky" />
            {columns.map((p, i) => (
              <th key={`h-${i}`}>
                <span className="money-box-option-title">{t("moneyBox.option", { n: i + 1 })}</span>
                {p ? (
                  <div className="money-box-feasibility">
                    {t("moneyBox.plansOk", {
                      ok: p.plans.filter((row) => row.feasible).length,
                      total: p.plans.length,
                    })}
                  </div>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="money-box-matrix-sticky">{t("moneyBox.sale")}</td>
            {columns.map((p, i) => (
              <td key={`s-${i}`}>
                {p ? <MoneyAmount value={fromCents(p.saleCents)} tone="sale" /> : "—"}
              </td>
            ))}
          </tr>
          <tr>
            <td className="money-box-matrix-sticky">{t("moneyBox.downPayment")}</td>
            {columns.map((p, i) => (
              <td key={`d-${i}`}>
                {p ? (
                  <span className="money-box-dp-line">
                    <span className="network-pill ok money-box-dp-chip">
                      ({(p.downPct * 100).toFixed(0)}%)
                    </span>
                    <span className="money-box-dp-eq">=</span>
                    <MoneyAmount value={fromCents(p.downCents)} tone="dp" />
                  </span>
                ) : "—"}
              </td>
            ))}
          </tr>
          {showTotalToday ? (
            <tr>
              <td className="money-box-matrix-sticky">{t("moneyBox.totalToday")}</td>
              {columns.map((p, i) => (
                <td key={`tt-${i}`}>
                  {p ? <MoneyAmount value={fromCents(p.totalTodayCents)} tone="dp" /> : "—"}
                </td>
              ))}
            </tr>
          ) : null}
          <tr className="money-box-section-row">
            <td colSpan={4}>
              <strong>{t("moneyBox.monthlySection")}</strong>
            </td>
          </tr>
          {terms.map((term) => (
            <tr key={term.id || term.label}>
              <td className="money-box-month-label money-box-matrix-sticky">
                {term.label}
                {term.desc ? <small>{term.desc}</small> : null}
              </td>
              {columns.map((p, i) => {
                const row = p?.plans?.find((x) => x.id === term.id || x.label === term.label);
                if (!row) {
                  return <td key={`${term.label}-${i}`}>—</td>;
                }
                return (
                  <td
                    key={`${term.label}-${i}`}
                    className={`money-box-plan-cell ${row.feasible ? "money-box-plan-ok" : "money-box-plan-bad"}`}
                  >
                    <MoneyAmount value={fromCents(row.monthlyCents)} tone="monthly" />
                    {!row.feasible ? (
                      <span className="money-box-plan-reason">{row.reason}</span>
                    ) : row.origin ? (
                      <span className="money-box-plan-reason">{t("moneyBox.originPlan")}</span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MoneyPanel({
  title,
  fields,
  icon: Icon,
  iconTone,
  proposals,
  terms,
  showTotalToday,
  note,
  t,
  mobileActive,
  onRefresh,
}) {
  return (
    <div className={`card tool-calc-card${mobileActive ? " is-mobile-active" : ""}`}>
      <div className="money-box-panel-head">
        <div>
          <div className="card-heading">{title}</div>
        </div>
        <div className="money-box-panel-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onRefresh}
            title={t("moneyBox.refresh")}
            aria-label={t("moneyBox.refresh")}
          >
            <RefreshCw size={16} />
          </button>
          <div className={`tool-icon ${iconTone}`}>
            <Icon size={20} />
          </div>
        </div>
      </div>

      <div className="tool-calc-fields">
        {fields.map((field, idx) => (
          <div key={field.id} className={`frow${idx === 0 ? " frow-first" : ""} tool-frow`}>
            <div className="flabel">{field.label}</div>
            <div className="mfield">
              <span className="mpfx">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={field.value}
                onFocus={selectOnFocus}
                onChange={(e) => field.onChange(formatMoneyInput(e.target.value))}
                onBlur={(e) => field.onBlur(formatMoneyValue(e.target.value))}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="money-box-options-rule" aria-hidden="true" />
      <ProposalMatrix
        proposals={proposals}
        terms={terms}
        showTotalToday={showTotalToday}
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

const ROUND_OPTIONS = [
  { value: "0.01", cents: 1 },
  { value: "100", cents: 10000 },
  { value: "500", cents: 50000 },
  { value: "1000", cents: 100000 },
];

export function MoneyBoxPage({ clientId, shared }) {
  const { t } = useI18n();
  const { fmtN2 } = useMoney();
  const { allowed, locked, loading, ready } = useFeatureAccess("money_box");
  const worksheetConfig = useDbStore((s) => s.db.settings?.worksheetConfig, shallow);

  const [minDownPct, setMinDownPct] = useState("30");
  const [maxDownPct, setMaxDownPct] = useState("50");
  const [fcInput, setFcInput] = useState("0");
  const [ffInput, setFfInput] = useState("0");
  const [maxSaleInput, setMaxSaleInput] = useState("150,000.00");
  const [roundStep, setRoundStep] = useState("0.01");

  const [downInput, setDownInput] = useState("2,000.00");
  const [monthlyInput, setMonthlyInput] = useState("210.00");
  const [combinedCash, setCombinedCash] = useState("2,000.00");
  const [combinedMonthly, setCombinedMonthly] = useState("210.00");

  const [refreshDown, setRefreshDown] = useState(0);
  const [refreshMonthly, setRefreshMonthly] = useState(0);
  const [refreshCombined, setRefreshCombined] = useState(0);
  const [mobileTab, setMobileTab] = useState("eng");

  const terms = useMemo(
    () => termsFromWorksheetConfig(worksheetConfig, [
      t("moneyBox.termDesc1"),
      t("moneyBox.termDesc2"),
      t("moneyBox.termDesc3"),
    ]),
    [worksheetConfig, t],
  );

  const policy = useMemo(() => {
    const min = Math.max(0, Math.min(0.99, parseMoney(minDownPct) / 100));
    const maxRaw = Math.max(0.01, Math.min(0.99, parseMoney(maxDownPct) / 100));
    const roundOpt = ROUND_OPTIONS.find((o) => o.value === roundStep) || ROUND_OPTIONS[0];
    return defaultPolicyConfig({
      minDownPct: min,
      maxDownPct: Math.max(min, maxRaw),
      fcCents: toCents(parseMoney(fcInput)),
      ffCents: toCents(parseMoney(ffInput)),
      maxSaleCents: Math.max(1, toCents(parseMoney(maxSaleInput))),
      roundStepCents: roundOpt.cents,
    });
  }, [minDownPct, maxDownPct, fcInput, ffInput, maxSaleInput, roundStep]);

  const downProposals = useMemo(
    () => generateDownProposals(toCents(parseMoney(downInput)), 0, policy, terms, refreshDown),
    [downInput, policy, terms, refreshDown],
  );
  const monthlyProposals = useMemo(
    () => generateMonthlyProposals(toCents(parseMoney(monthlyInput)), 0, policy, terms, refreshMonthly),
    [monthlyInput, policy, terms, refreshMonthly],
  );
  const combinedProposals = useMemo(
    () => generateCombinedProposals(
      toCents(parseMoney(combinedCash)),
      toCents(parseMoney(combinedMonthly)),
      policy,
      terms,
      refreshCombined,
    ),
    [combinedCash, combinedMonthly, policy, terms, refreshCombined],
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

  const summary = t("moneyBox.restrictionSummaryV2", {
    min: minDownPct || "0",
    max: maxDownPct || "0",
    fc: fmtN2(parseMoney(fcInput)),
    ff: fmtN2(parseMoney(ffInput)),
    count: terms.length,
  });

  const showTotalToday = policy.fcCents > 0;

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
                  type="number"
                  className="tool-num-input"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  value={minDownPct}
                  onFocus={selectOnFocus}
                  onChange={(e) => setMinDownPct(e.target.value)}
                />
                <span className="frow-suffix">%</span>
              </div>
            </div>
            <div className="frow tool-frow">
              <div className="flabel">{t("moneyBox.maxDown")}</div>
              <div className="frow-inline">
                <input
                  type="number"
                  className="tool-num-input"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  value={maxDownPct}
                  onFocus={selectOnFocus}
                  onChange={(e) => setMaxDownPct(e.target.value)}
                />
                <span className="frow-suffix">%</span>
              </div>
            </div>
            <div className="frow tool-frow">
              <div className="flabel">{t("moneyBox.cargoHoy")}</div>
              <div className="mfield">
                <span className="mpfx">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={fcInput}
                  onFocus={selectOnFocus}
                  onChange={(e) => setFcInput(formatMoneyInput(e.target.value))}
                  onBlur={(e) => setFcInput(formatMoneyValue(e.target.value))}
                />
              </div>
            </div>
            <div className="frow tool-frow">
              <div className="flabel">{t("moneyBox.cargoFinanciable")}</div>
              <div className="mfield">
                <span className="mpfx">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={ffInput}
                  onFocus={selectOnFocus}
                  onChange={(e) => setFfInput(formatMoneyInput(e.target.value))}
                  onBlur={(e) => setFfInput(formatMoneyValue(e.target.value))}
                />
              </div>
            </div>
            <div className="frow tool-frow">
              <div className="flabel">{t("moneyBox.maxSale")}</div>
              <div className="mfield">
                <span className="mpfx">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={maxSaleInput}
                  onFocus={selectOnFocus}
                  onChange={(e) => setMaxSaleInput(formatMoneyInput(e.target.value))}
                  onBlur={(e) => setMaxSaleInput(formatMoneyValue(e.target.value))}
                />
              </div>
            </div>
            <div className="frow tool-frow">
              <div className="flabel">{t("moneyBox.roundStep")}</div>
              <select
                className="tool-num-input"
                value={roundStep}
                onChange={(e) => setRoundStep(e.target.value)}
                style={{ minWidth: 140 }}
              >
                <option value="0.01">{t("moneyBox.roundExact")}</option>
                <option value="100">{t("moneyBox.round100")}</option>
                <option value="500">{t("moneyBox.round500")}</option>
                <option value="1000">{t("moneyBox.round1000")}</option>
              </select>
            </div>
          </div>
          <div className="card-heading" style={{ marginTop: 16 }}>{t("moneyBox.configuredTerms")}</div>
          <p className="card-sub" style={{ marginBottom: 8 }}>{t("moneyBox.termsFromWorksheet")}</p>
          {terms.map((term) => (
            <div key={term.id || term.label} className="opt-block">
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
            <button
              type="button"
              className={`seg-btn${mobileTab === "comb" ? " on" : ""}`}
              onClick={() => setMobileTab("comb")}
            >
              {t("moneyBox.byCombined")}
            </button>
          </div>
        </div>

        <div className="money-box-panels-stack">
          <div className="g2 money-box-pair-grid">
            <MoneyPanel
              title={t("moneyBox.byDown")}
              fields={[{
                id: "down",
                label: t("moneyBox.downQuestion"),
                value: downInput,
                onChange: setDownInput,
                onBlur: setDownInput,
              }]}
              icon={Wallet}
              iconTone="green"
              proposals={downProposals}
              terms={terms}
              showTotalToday={showTotalToday}
              note={t("moneyBox.byDownNoteV2")}
              t={t}
              mobileActive={mobileTab === "eng"}
              onRefresh={() => setRefreshDown((n) => n + 1)}
            />
            <MoneyPanel
              title={t("moneyBox.byMonthly")}
              fields={[{
                id: "monthly",
                label: t("moneyBox.monthlyQuestion"),
                value: monthlyInput,
                onChange: setMonthlyInput,
                onBlur: setMonthlyInput,
              }]}
              icon={CalendarDays}
              iconTone="purple"
              proposals={monthlyProposals}
              terms={terms}
              showTotalToday={showTotalToday}
              note={t("moneyBox.byMonthlyNoteV2")}
              t={t}
              mobileActive={mobileTab === "month"}
              onRefresh={() => setRefreshMonthly((n) => n + 1)}
            />
          </div>
          <MoneyPanel
            title={t("moneyBox.byCombined")}
            fields={[
              {
                id: "comb-cash",
                label: t("moneyBox.downQuestion"),
                value: combinedCash,
                onChange: setCombinedCash,
                onBlur: setCombinedCash,
              },
              {
                id: "comb-month",
                label: t("moneyBox.monthlyQuestion"),
                value: combinedMonthly,
                onChange: setCombinedMonthly,
                onBlur: setCombinedMonthly,
              },
            ]}
            icon={Layers}
            iconTone="blue"
            proposals={combinedProposals}
            terms={terms}
            showTotalToday={showTotalToday}
            note={t("moneyBox.byCombinedNote")}
            t={t}
            mobileActive={mobileTab === "comb"}
            onRefresh={() => setRefreshCombined((n) => n + 1)}
          />
        </div>
      </div>
    </>
  );
}
