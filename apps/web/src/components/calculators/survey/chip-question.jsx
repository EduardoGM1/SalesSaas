import { ChevronDown } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n.js";
import { toggleChip } from "@/lib/survey/discovery-questions.js";
import { resolveOptionDisplayLabel } from "@/lib/survey/option-labels.js";

function questionTitle(question, t) {
  if (question.titleOverride) return question.titleOverride;
  if (question.labelOverride) return question.labelOverride;
  if (question.labelKey) return t(question.labelKey);
  return t(question.titleKey || `survey.disc.q.${question.id}.title`);
}

function optionLabel(question, optionKey, t) {
  return resolveOptionDisplayLabel(
    question.id,
    optionKey,
    {
      optionLabels: question.optionLabels || {},
      activeKeys: question.optionKeys || question.options || [],
    },
    t,
  );
}

/**
 * Pregunta Discovery con chips + contexto.
 * Modo acordeón (expanded controlado por el padre) para una sola abierta a la vez.
 */
export function ChipQuestion({
  question,
  selected = [],
  context = "",
  disabled = false,
  onChangeSelected,
  onChangeContext,
  showNumber = true,
  expanded = true,
  onToggleExpand,
  accordion = false,
}) {
  const { t } = useI18n();
  const max = question.max ?? 1;
  const optionKeys = question.optionKeys || question.options || [];
  const title = questionTitle(question, t);
  const help = t("survey.disc.help.selectUpTo", { n: max });
  const answered = (Array.isArray(selected) && selected.length > 0)
    || Boolean(String(context || "").trim());

  const handleChip = (optionKey) => {
    if (disabled) return;
    onChangeSelected?.(toggleChip(selected, optionKey, max));
  };

  const body = (
    <>
      <div className="card-sub disc-q-help">{help}</div>
      <div className="choice-row disc-choice-row" role="group" aria-label={title}>
        {optionKeys.map((optionKey) => {
          const on = selected.includes(optionKey);
          const label = optionLabel(question, optionKey, t);
          return (
            <button
              key={optionKey}
              type="button"
              className={`choice-pill${on ? " on" : ""}`}
              aria-pressed={on}
              disabled={disabled}
              onClick={() => handleChip(optionKey)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {question.withContext !== false && (
        <details className="disc-context" open={Boolean(String(context || "").trim()) || undefined}>
          <summary className="disc-context-summary">{t("survey.disc.context.add")}</summary>
          <textarea
            placeholder={t("survey.disc.context.placeholder")}
            value={context || ""}
            disabled={disabled}
            onChange={(e) => onChangeContext?.(e.target.value)}
          />
          <p className="card-sub" style={{ marginTop: 8, marginBottom: 0 }}>
            {t("survey.disc.context.note")}
          </p>
        </details>
      )}
    </>
  );

  if (!accordion) {
    return (
      <article className="disc-question-card">
        <div className="flabel disc-q-title">
          {showNumber && question.number != null ? `${question.number}. ` : ""}
          {title}
        </div>
        {body}
      </article>
    );
  }

  return (
    <article className={`disc-question-card disc-question-card--accordion${expanded ? " is-open" : ""}`}>
      <button
        type="button"
        className="disc-q-accordion-head"
        aria-expanded={expanded}
        onClick={() => onToggleExpand?.(question.id)}
      >
        <span className="disc-q-accordion-title">
          {showNumber && question.number != null ? (
            <span className="disc-q-num">{question.number}.</span>
          ) : null}
          <span className="disc-q-text">{title}</span>
        </span>
        <span className="disc-q-accordion-meta">
          <span className={`disc-q-answered${answered ? " is-yes" : ""}`}>
            {answered ? t("survey.disc.answered") : t("survey.disc.unanswered")}
          </span>
          <ChevronDown size={18} className={`disc-q-chevron${expanded ? " is-open" : ""}`} aria-hidden />
        </span>
      </button>
      {expanded ? <div className="disc-q-accordion-body">{body}</div> : null}
    </article>
  );
}

export function StyleMicroGrid({ questions, answers, disabled, onToggle }) {
  const { t } = useI18n();
  return (
    <div className="disc-style-grid">
      {questions.map((q) => {
        const selected = answers?.[q.id] || [];
        const optionKeys = q.optionKeys || q.options || [];
        const label = q.labelOverride || t(q.labelKey || `survey.disc.q.${q.id}.label`);
        return (
          <div key={q.id} className="disc-micro">
            <div className="disc-micro-label">{label}</div>
            <div className="choice-row disc-choice-row">
              {optionKeys.map((optionKey) => {
                const on = selected.includes(optionKey);
                return (
                  <button
                    key={optionKey}
                    type="button"
                    className={`choice-pill${on ? " on" : ""}`}
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => onToggle?.(q.id, optionKey, q.max)}
                  >
                    {optionLabel(q, optionKey, t)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
