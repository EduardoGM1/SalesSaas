import { useI18n } from "@/hooks/use-i18n.js";
import { optionTitleKey, toggleChip } from "@/lib/survey/discovery-questions.js";

/**
 * Pregunta Discovery con chips + contexto.
 * Guarda claves de opción; muestra labels vía i18n.
 */
export function ChipQuestion({
  question,
  selected = [],
  context = "",
  disabled = false,
  onChangeSelected,
  onChangeContext,
  showNumber = true,
}) {
  const { t } = useI18n();
  const max = question.max ?? 1;
  const optionKeys = question.optionKeys || question.options || [];
  const title = t(question.titleKey || `survey.disc.q.${question.id}.title`);
  const help = t("survey.disc.help.selectUpTo", { n: max });

  const handleChip = (optionKey) => {
    if (disabled) return;
    onChangeSelected?.(toggleChip(selected, optionKey, max));
  };

  return (
    <article className="disc-question-card">
      <div className="flabel disc-q-title">
        {showNumber && question.number != null ? `${question.number}. ` : ""}
        {title}
      </div>
      <div className="card-sub disc-q-help">{help}</div>
      <div className="choice-row disc-choice-row" role="group" aria-label={title}>
        {optionKeys.map((optionKey) => {
          const on = selected.includes(optionKey);
          const label = t(optionTitleKey(question.id, optionKey));
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
        <details className="disc-context">
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
        return (
          <div key={q.id} className="disc-micro">
            <div className="disc-micro-label">
              {t(q.labelKey || `survey.disc.q.${q.id}.label`)}
            </div>
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
                    {t(optionTitleKey(q.id, optionKey))}
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
