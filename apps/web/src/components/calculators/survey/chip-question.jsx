import { toggleChip } from "@/lib/survey/discovery-questions.js";

/**
 * Pregunta Discovery con chips + contexto colapsable.
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
  const max = question.max ?? 1;
  const help =
    max === 1 ? "Selecciona hasta 1" : `Selecciona hasta ${max}`;

  const handleChip = (option) => {
    if (disabled) return;
    onChangeSelected?.(toggleChip(selected, option, max));
  };

  return (
    <article className="disc-question-card">
      <div className="disc-q-title">
        {showNumber && question.number != null ? `${question.number}. ` : ""}
        {question.title}
      </div>
      <div className="disc-q-help">{help}</div>
      <div className="disc-chips" role="group" aria-label={question.title}>
        {question.options.map((option) => {
          const on = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              className={`disc-chip${on ? " on" : ""}`}
              aria-pressed={on}
              disabled={disabled}
              onClick={() => handleChip(option)}
            >
              {option}
            </button>
          );
        })}
      </div>
      {question.withContext !== false && (
        <details className="disc-context">
          <summary>+ Agregar contexto</summary>
          <textarea
            placeholder="Contexto adicional, frase textual o información por validar…"
            value={context || ""}
            disabled={disabled}
            onChange={(e) => onChangeContext?.(e.target.value)}
          />
        </details>
      )}
    </article>
  );
}

export function StyleMicroGrid({ questions, answers, disabled, onToggle }) {
  return (
    <div className="disc-style-grid">
      {questions.map((q) => {
        const selected = answers?.[q.id] || [];
        return (
          <div key={q.id} className="disc-micro">
            <h4>{q.label}</h4>
            <div className="disc-chips">
              {q.options.map((option) => {
                const on = selected.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    className={`disc-chip${on ? " on" : ""}`}
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => onToggle?.(q.id, option, q.max)}
                  >
                    {option}
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
