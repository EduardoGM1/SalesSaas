
import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { computeMetasKpis } from "@/lib/calculations/calendar";
import { onlyDigits } from "@/lib/format/money";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { calKey } from "@/lib/format/dates";
import { selectOnFocus } from "@/lib/focus-select.js";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";

export function MetasPage() {
  const { t, months } = useI18n();
  const { fmt, fmtN, settings: moneySettings } = useMoney();
  const hydrated = useAppStore((s) => s.hydrated);
  const calYear = useAppStore((s) => s.calYear);
  const calMonth = useAppStore((s) => s.calMonth);
  const calPrev = useAppStore((s) => s.calPrev);
  const calNext = useAppStore((s) => s.calNext);
  const saveGoalMonth = useDbStore((s) => s.saveGoalMonth);
  const monthKey = calKey(calYear, calMonth);

  const [vol, setVol] = useState("");
  const [tours, setTours] = useState("");
  const [ventas, setVentas] = useState("");
  const [saved, setSaved] = useState(false);

  const goalData = useDbStore((s) => s.db.goals[monthKey] ?? {});

  useEffect(() => {
    const g = goalData;
    setVol(g.vol ? fmtN(g.vol) : "");
    setTours(g.tours ? String(g.tours) : "");
    setVentas(g.ventas ? String(g.ventas) : "");
  }, [monthKey, goalData, fmtN]);

  const data = useDbStore((s) => s.db.cal[monthKey] ?? { days: {}, weeks: {} });
  const kpis = useMemo(() => computeMetasKpis(
    calYear, calMonth, data,
    Number(onlyDigits(vol)) || 0,
    Number(onlyDigits(tours)) || 0,
    Number(onlyDigits(ventas)) || 0,
  ), [calYear, calMonth, data, vol, tours, ventas]);

  const formatVol = () => {
    const raw = onlyDigits(vol);
    const locale = moneySettings.language === "en" ? "en-US" : "es-MX";
    setVol(raw ? Number(raw).toLocaleString(locale, { maximumFractionDigits: 0 }) : "");
  };

  if (!hydrated) return <Topbar title={t("page.metas.title")} subtitle={t("common.loading")} />;

  const diasTrab = Math.max(0, kpis.dim - kpis.descDays);

  return (
    <>
      <Topbar title={t("page.metas.title")} subtitle={t("page.metas.subtitle")} />
      <div className="sales-page">
        <PageBack />
        <div className="page-head">
          <div>
            <div className="page-title">{t("page.metas.title")}</div>
            <div className="page-sub">{months[calMonth]} {calYear}</div>
          </div>
          <div className="local-month-nav">
            <button type="button" className="tb-nav-btn" onClick={calPrev} aria-label={t("common.previousMonth")}>‹</button>
            <div className="local-month-label">{months[calMonth]} {calYear}</div>
            <button type="button" className="tb-nav-btn" onClick={calNext} aria-label={t("common.nextMonth")}>›</button>
          </div>
        </div>

        <div className="g2">
          <div className="card">
            <div className="card-heading">{t("metas.monthGoal")}</div>
            <div className="card-sub">{t("metas.enterGoals")}</div>

            <div className="frow" style={{ paddingTop: 0, borderTop: "none" }}>
              <div className="flabel"><strong>{t("metas.year")}</strong></div>
              <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 16, fontWeight: 600, color: "var(--blue)" }}>{calYear}</div>
            </div>
            <div className="frow">
              <div className="flabel"><strong>{t("metas.month")}</strong></div>
              <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 16, fontWeight: 600, color: "var(--blue)" }}>{months[calMonth]}</div>
            </div>

            <hr style={{ margin: "14px 0 10px" }} />

            <div className="frow" style={{ borderTop: "none", paddingTop: 0 }}>
              <div className="flabel">
                <strong>{t("metas.volume")}</strong>
                <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>{t("metas.volumeHelp")}</span>
              </div>
              <input type="text" className="goal-plain-input" placeholder="200,000" inputMode="numeric" value={vol} onFocus={selectOnFocus} onChange={(e) => setVol(e.target.value)} onBlur={formatVol} />
            </div>
            <div className="frow">
              <div className="flabel">
                <strong>{t("metas.tours")}</strong>
                <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>{t("metas.toursHelp")}</span>
              </div>
              <input type="text" className="goal-plain-input small" placeholder="20" inputMode="numeric" value={tours} onFocus={selectOnFocus} onChange={(e) => setTours(e.target.value)} />
            </div>
            <div className="frow">
              <div className="flabel">
                <strong>{t("metas.sales")}</strong>
                <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>{t("metas.salesHelp")}</span>
              </div>
              <input type="text" className="goal-plain-input small" placeholder="5" inputMode="numeric" value={ventas} onFocus={selectOnFocus} onChange={(e) => setVentas(e.target.value)} />
            </div>

            <hr style={{ margin: "14px 0 10px" }} />

            <div className="frow" style={{ borderTop: "none", paddingTop: 0 }}>
              <div className="flabel">
                <strong>{t("metas.restDays")}</strong>
                <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>{t("metas.restDaysHelp")}</span>
              </div>
              <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{kpis.descDays}</div>
            </div>
            <div className="frow">
              <div className="flabel">
                <strong>{t("metas.workDays")}</strong>
                <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>{t("metas.workDaysHelp")}</span>
              </div>
              <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 18, fontWeight: 700, color: "var(--blue)" }}>{diasTrab}</div>
            </div>

            <div className="hint" style={{ marginTop: 14 }}>{t("metas.hint")}</div>

            <button type="button" className="btn btn-primary btn-full" style={{ marginTop: 16 }} onClick={() => {
              saveGoalMonth(calYear, calMonth, {
                vol: Number(onlyDigits(vol)) || 0,
                tours: Number(onlyDigits(tours)) || 0,
                ventas: Number(onlyDigits(ventas)) || 0,
              });
              setSaved(true);
              setTimeout(() => setSaved(false), 1600);
            }}>{saved ? t("metas.saved") : t("metas.save")}</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card">
              <div className="card-heading">{t("metas.kpisProjected")}</div>
              <div className="card-sub">{t("metas.kpisSub")}</div>
              <div className="g2" style={{ gap: 12 }}>
                <div className="vbox blue">
                  <div className="vbox-val">{fmt(kpis.vprom)}</div>
                  <div className="vbox-label">{t("goals.avgSale")}</div>
                  <div className="vbox-sub">{t("metas.avgSaleSub")}</div>
                </div>
                <div className="vbox green">
                  <div className="vbox-val">{fmt(kpis.efic)}</div>
                  <div className="vbox-label">{t("goals.efficiency")}</div>
                  <div className="vbox-sub">{t("metas.efficiencySub")}</div>
                </div>
                <div className="vbox yellow">
                  <div className="vbox-val">{kpis.cierre.toFixed(2)}%</div>
                  <div className="vbox-label">{t("goals.closeRate")}</div>
                  <div className="vbox-sub">{t("metas.closeRateSub")}</div>
                </div>
                <div className="vbox blue">
                  <div className="vbox-val">{fmt(kpis.prod)}</div>
                  <div className="vbox-label">{t("metas.dailyGoal")}</div>
                  <div className="vbox-sub">{t("metas.dailyGoalSub")}</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-heading">{t("metas.monthBreakdown")}</div>
              <div className="card-sub">{t("metas.monthBreakdownSub")}</div>
              <table className="dtbl">
                <tbody>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>{t("metas.daysInMonth")}</td><td className="td-r" style={{ fontFamily: "var(--font-geist-mono), monospace", fontWeight: 600 }}>{kpis.dim}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>{t("metas.restDays")}</td><td className="td-r td-red">{kpis.descDays}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>{t("metas.workDays")}</td><td className="td-r td-blue">{diasTrab}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>{t("metas.approxWeekly")}</td><td className="td-r td-green">{fmt(kpis.semanal)}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>{t("metas.toursPerDay")}</td><td className="td-r" style={{ fontFamily: "var(--font-geist-mono), monospace", fontWeight: 600 }}>{kpis.toursDia}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>{t("metas.approxDaily")}</td><td className="td-r td-green">{fmt(kpis.prod)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
