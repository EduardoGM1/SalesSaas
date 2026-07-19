import {
  MOTIVACIONES_AFTER_STYLE,
  MOTIVACIONES_BEFORE_STYLE,
  STYLE_QUESTIONS,
  toggleChip,
} from "@/lib/survey/discovery-questions.js";
import { ChipQuestion, StyleMicroGrid } from "./chip-question.jsx";

export function MotivacionesPanel({ discovery, disabled, onPatch, onConfigClick }) {
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
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled}
          title="La configuración de preguntas aún no está disponible en la app"
          onClick={onConfigClick}
        >
          ⚙ Configurar preguntas
        </button>
      </div>

      <div className="disc-questions">
        {MOTIVACIONES_BEFORE_STYLE.map((q) => (
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

      <StyleMicroGrid
        questions={STYLE_QUESTIONS}
        answers={answers}
        disabled={disabled}
        onToggle={(id, option, max) => {
          setSelected(id, toggleChip(answers[id] || [], option, max));
        }}
      />

      <div className="disc-questions">
        {MOTIVACIONES_AFTER_STYLE.map((q) => (
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
