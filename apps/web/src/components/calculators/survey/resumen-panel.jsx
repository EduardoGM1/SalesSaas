import { useI18n } from "@/hooks/use-i18n.js";
import { joinSelectedTranslated } from "@/lib/survey/discovery-storage.js";
import { optionTitleKey } from "@/lib/survey/discovery-questions.js";
import { resolveOptionDisplayLabel } from "@/lib/survey/option-labels.js";

function line(label, value) {
  if (!value) return null;
  return (
    <div className="disc-summary-line" key={label}>
      <div className="flabel">{label}</div>
      <div className="card-sub" style={{ marginBottom: 0 }}>{value}</div>
    </div>
  );
}

function qTitle(q, t) {
  return q.titleOverride || q.labelOverride || t(q.titleKey || q.labelKey);
}

function qJoin(q, answers, t) {
  return joinSelectedTranslated(answers[q.id], q.id, t, {
    optionLabels: q.optionLabels || {},
    activeKeys: q.optionKeys || [],
  });
}

export function ResumenPanel({ discovery, result, fmt, grouped }) {
  const { t } = useI18n();
  const answers = discovery.answers || {};
  const before = grouped?.motivacionesBefore || [];
  const after = grouped?.motivacionesAfter || [];
  const styleQs = grouped?.styleQuestions || [];
  const timeshareQs = grouped?.timeshareQuestions || [];

  const motivLines = [
    ...before.map((q) => line(qTitle(q, t), qJoin(q, answers, t))),
    ...styleQs.map((q) => line(qTitle(q, t), qJoin(q, answers, t))),
    ...after.map((q) => line(qTitle(q, t), qJoin(q, answers, t))),
  ].filter(Boolean);

  const tsLines = [
    ...timeshareQs.map((q) => line(qTitle(q, t), qJoin(q, answers, t))),
    grouped?.hasTsQuestion && discovery.hasTs
      ? line(
          qTitle(grouped.hasTsQuestion, t),
          resolveOptionDisplayLabel(
            "hasTs",
            discovery.hasTs,
            {
              optionLabels: grouped.hasTsQuestion.optionLabels || {},
              activeKeys: grouped.hasTsQuestion.optionKeys || [],
            },
            t,
          ),
        )
      : null,
    discovery.memberships?.length
      ? line(
          t("survey.disc.membership.title"),
          discovery.memberships
            .map((m, i) => `${i + 1}. ${m.hotel || "—"}${m.place ? ` (${m.place})` : ""}`)
            .join(" · "),
        )
      : null,
  ].filter(Boolean);

  const gastosLines = [
    line(t("tools.survey.suggestedDown"), result?.trip?.dp != null ? fmt(result.trip.dp) : ""),
    line(t("tools.survey.idealMonthly"), result?.trip?.mi != null ? fmt(result.trip.mi) : ""),
    line(t("tools.survey.histTitle"), result?.hist?.dp != null ? fmt(result.hist.dp) : ""),
    line(t("tools.survey.futureTitle"), result?.future?.spend != null ? fmt(result.future.spend) : ""),
  ].filter(Boolean);

  const firstMotiv = before[0] || after[0];
  const firstFreno = after.find((q) => q.id === "p21") || after[0];
  const patternBits = [
    firstMotiv && qJoin(firstMotiv, answers, t)
      && `${qTitle(firstMotiv, t)}: ${qJoin(firstMotiv, answers, t)}`,
    firstFreno && qJoin(firstFreno, answers, t)
      && `${qTitle(firstFreno, t)}: ${qJoin(firstFreno, answers, t)}`,
    discovery.hasTs && `${t("survey.disc.q.hasTs.title")}: ${t(optionTitleKey("hasTs", discovery.hasTs))}`,
    result?.pattern?.mi != null && `${t("tools.survey.idealMonthly")}: ${fmt(result.pattern.mi)}`,
  ].filter(Boolean);

  return (
    <div className="disc-panel">
      <div className="disc-section-head">
        <div>
          <h2 className="card-heading">4. {t("tools.survey.tab.resumen")}</h2>
          <p className="card-sub">
            {t("tools.survey.tab.motivaciones")} · {t("tools.survey.tab.timeshare")} · {t("tools.survey.tab.gastos")}
          </p>
        </div>
      </div>

      <div className="g2 disc-summary-grid">
        <div className="card disc-summary-box">
          <div className="card-heading">{t("tools.survey.tab.motivaciones")}</div>
          {motivLines.length ? motivLines : <p className="card-sub">—</p>}
        </div>
        <div className="card disc-summary-box">
          <div className="card-heading">{t("tools.survey.tab.timeshare")}</div>
          {tsLines.length ? tsLines : <p className="card-sub">—</p>}
        </div>
        <div className="card disc-summary-box">
          <div className="card-heading">{t("tools.survey.tab.gastos")}</div>
          {gastosLines.length ? gastosLines : <p className="card-sub">—</p>}
        </div>
        <div className="card disc-summary-box">
          <div className="card-heading">{t("tools.survey.patternTitle")}</div>
          {patternBits.length ? (
            patternBits.map((txt) => (
              <p key={txt} className="card-sub">{txt}</p>
            ))
          ) : (
            <p className="card-sub">—</p>
          )}
        </div>
      </div>
    </div>
  );
}
