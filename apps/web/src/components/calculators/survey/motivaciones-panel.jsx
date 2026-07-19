import { toggleChip } from "@/lib/survey/discovery-questions.js";
import { ChipQuestion, StyleMicroGrid } from "./chip-question.jsx";

export function MotivacionesPanel({
  discovery,
  disabled,
  onPatch,
  onConfigClick,
  canConfigure = false,
  beforeQuestions = [],
  styleQuestions = [],
  afterQuestions = [],
}) {
  const answers = discovery.answers || {};
  const contexts = discovery.contexts || {};

  const setSelected = (id, next) => {
    onPatch({ answers: { ...answers, [id]: next } });
  };

  const setContext = (id, value) => {
    onPatch({ contexts: { ...contexts, [id]: value } });
  };

  return (
    <div className="disc-panel">
      <div className="disc-section-head">
        <div>
          <h2 className="card-heading">1. Motivaciones</h2>
          <p className="card-sub">
            Abre la conversación y conoce qué busca, qué valora, qué le frena y cómo decide.
          </p>
        </div>
        {canConfigure && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={disabled}
            onClick={onConfigClick}
          >
            ⚙ Configurar preguntas
          </button>
        )}
      </div>

      <div className="disc-questions">
        {beforeQuestions.map((q) => (
          <ChipQuestion
            key={q.id}
            question={q}
            selected={answers[q.id] || []}
            context={contexts[q.id] || ""}
            disabled={disabled}
            onChangeSelected={(sel) => setSelected(q.id, sel)}
            onChangeContext={(v) => setContext(q.id, v)}
          />
        ))}
      </div>

      {styleQuestions.length > 0 && (
        <StyleMicroGrid
          questions={styleQuestions}
          answers={answers}
          disabled={disabled}
          onToggle={(id, option, max) => {
            setSelected(id, toggleChip(answers[id] || [], option, max));
          }}
        />
      )}

      <div className="disc-questions">
        {afterQuestions.map((q) => (
          <ChipQuestion
            key={q.id}
            question={q}
            selected={answers[q.id] || []}
            context={contexts[q.id] || ""}
            disabled={disabled}
            onChangeSelected={(sel) => setSelected(q.id, sel)}
            onChangeContext={(v) => setContext(q.id, v)}
          />
        ))}
      </div>
    </div>
  );
}
