import {
  STYLE_QUESTIONS,
  TIMESHARE_QUESTIONS,
  joinSelected,
} from "@/lib/survey/discovery-questions.js";

function line(label, value) {
  if (!value) return null;
  return (
    <div className="disc-summary-line" key={label}>
      <div className="flabel">{label}</div>
      <div className="card-sub" style={{ marginBottom: 0 }}>{value}</div>
    </div>
  );
}

/** Resumen automático a partir de chips seleccionados y métricas de gastos. */
export function ResumenPanel({ discovery, result, fmt }) {
  const answers = discovery.answers || {};
  const motivLines = [
    line("Motivación principal", joinSelected(answers.p1)),
    line("Emoción esperada", joinSelected(answers.p2)),
    line("No negociables", joinSelected(answers.p3)),
    line("Mejora deseada", joinSelected(answers.p4)),
    line("Frenos", joinSelected(answers.p21)),
    line("Situación frecuente", joinSelected(answers.p22)),
    line("Preocupación al comprometerse", joinSelected(answers.p23)),
    line("Cómo deciden", joinSelected(answers.p24)),
    line("Qué necesitan para decidir", joinSelected(answers.p25)),
    ...STYLE_QUESTIONS.map((q) => line(q.label, joinSelected(answers[q.id]))),
  ].filter(Boolean);

  const tsLines = [
    ...TIMESHARE_QUESTIONS.map((q) =>
      line(`${q.number}. ${q.title}`, joinSelected(answers[q.id])),
    ),
    line("¿Tiene timeshare actualmente?", discovery.hasTs || ""),
    discovery.memberships?.length
      ? line(
          "Membresías registradas",
          discovery.memberships
            .map((m, i) => `${i + 1}. ${m.hotel || "Sin nombre"}${m.place ? ` (${m.place})` : ""}`)
            .join(" · "),
        )
      : null,
  ].filter(Boolean);

  const gastosLines = [
    line("Enganche sugerido (viaje actual)", result?.trip?.dp != null ? fmt(result.trip.dp) : ""),
    line("Mensualidad ideal (viaje actual)", result?.trip?.mi != null ? fmt(result.trip.mi) : ""),
    line("Histórico — enganche promedio", result?.hist?.dp != null ? fmt(result.hist.dp) : ""),
    line("Histórico — mensualidad", result?.hist?.mi != null ? fmt(result.hist.mi) : ""),
    line("Futuras — total a gastar", result?.future?.spend != null ? fmt(result.future.spend) : ""),
  ].filter(Boolean);

  const patternBits = [
    joinSelected(answers.p1) && `Valoran: ${joinSelected(answers.p1)}`,
    joinSelected(answers.p21) && `Frenos: ${joinSelected(answers.p21)}`,
    discovery.hasTs && `Timeshare: ${discovery.hasTs}`,
    result?.pattern?.mi != null && `Mensualidad patrón: ${fmt(result.pattern.mi)}`,
  ].filter(Boolean);

  return (
    <div className="disc-panel">
      <div className="disc-section-head">
        <div>
          <h2 className="card-heading">4. Resumen</h2>
          <p className="card-sub">
            Concentra los hallazgos de Motivaciones, Timeshare Information y Gastos de viaje.
            Generado automáticamente a partir de las respuestas capturadas.
          </p>
        </div>
      </div>

      <div className="g2 disc-summary-grid">
        <div className="card disc-summary-box">
          <div className="card-heading">Motivaciones</div>
          {motivLines.length ? (
            motivLines
          ) : (
            <p className="card-sub">
              Motivación principal, no negociables, frenos, estilo de viaje y forma de decidir.
            </p>
          )}
        </div>
        <div className="card disc-summary-box">
          <div className="card-heading">Experiencia con timeshare</div>
          {tsLines.length ? (
            tsLines
          ) : (
            <p className="card-sub">
              Presentaciones previas, compras, experiencias, problemas, intención y productos registrados.
            </p>
          )}
        </div>
        <div className="card disc-summary-box">
          <div className="card-heading">Gastos de viaje</div>
          {gastosLines.length ? (
            gastosLines
          ) : (
            <p className="card-sub">
              Gasto actual, promedio histórico, viajes futuros, enganche sugerido y mensualidad ideal.
            </p>
          )}
        </div>
        <div className="card disc-summary-box">
          <div className="card-heading">Patrones detectados</div>
          {patternBits.length ? (
            patternBits.map((t) => (
              <p key={t} className="card-sub">{t}</p>
            ))
          ) : (
            <p className="card-sub">
              Relación entre lo que valora, lo que ya posee, lo que gasta y las oportunidades que deben
              validarse en la conversación.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
