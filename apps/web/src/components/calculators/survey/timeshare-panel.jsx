import { HAS_TS_QUESTION, TIMESHARE_QUESTIONS } from "@/lib/survey/discovery-questions.js";
import { ChipQuestion } from "./chip-question.jsx";
import { MembershipTable } from "./membership-table.jsx";

export function TimesharePanel({ discovery, disabled, onPatch, onConfigClick }) {
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
          <h2 className="card-heading">2. Timeshare Information</h2>
          <p className="card-sub">
            Preguntas de experiencia primero; después, registro detallado de cada membresía.
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
        {TIMESHARE_QUESTIONS.map((q) => (
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

      <div className="disc-subsection-head">
        <div>
          <h2 className="card-heading">Membresías / Timeshare del cliente</h2>
          <p className="card-sub">
            Registra todas las propiedades, clubes o membresías que tenga o haya tenido.
          </p>
        </div>
      </div>

      <div className="disc-questions">
        <ChipQuestion
          question={HAS_TS_QUESTION}
          selected={discovery.hasTs ? [discovery.hasTs] : []}
          disabled={disabled}
          showNumber={false}
          onChangeSelected={(sel) => onPatch({ hasTs: sel[0] || "" })}
        />
      </div>

      <MembershipTable
        rows={discovery.memberships || []}
        disabled={disabled}
        onChange={(memberships) => onPatch({ memberships })}
      />
    </div>
  );
}
