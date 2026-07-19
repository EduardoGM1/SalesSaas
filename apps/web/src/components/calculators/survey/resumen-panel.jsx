import { joinSelected } from "@/lib/survey/discovery-questions.js";

function line(label, value) {
  if (!value) return null;
  return (
    <div className="disc-summary-line" key={label}>
      <div className="flabel">{label}</div>
      <div className="card-sub" style={{ marginBottom: 0 }}>{value}</div>
    </div>
  );
}

/** Resumen automático a partir de chips activos + métricas de gastos. */
export function ResumenPanel({ discovery, result, fmt, grouped }) {
  const answers = discovery.answers || {};
  const before = grouped?.motivacionesBefore || [];
  const after = grouped?.motivacionesAfter || [];
  const styleQs = grouped?.styleQuestions || [];
  const timeshareQs = grouped?.timeshareQuestions || [];

  const motivLines = [
    ...before.map((q) => line(q.title, joinSelected(answers[q.id]))),
    ...styleQs.map((q) => line(q.label, joinSelected(answers[q.id]))),
    ...after.map((q) => line(q.title, joinSelected(answers[q.id]))),
  ].filter(Boolean);

  const tsLines = [
    ...timeshareQs.map((q) => line(q.title, joinSelected(answers[q.id]))),
    grouped?.hasTsQuestion
      ? line(grouped.hasTsQuestion.title, discovery.hasTs || "")
      : null,
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

  const firstMotiv = before[0] || after[0];
  const firstFreno = after.find((q) => q.id === "p21") || after[0];
  const patternBits = [
    firstMotiv && joinSelected(answers[firstMotiv.id]) && `Valoran: ${joinSelected(answers[firstMotiv.id])}`,
    firstFreno && joinSelected(answers[firstFreno.id]) && `Frenos: ${joinSelected(answers[firstFreno.id])}`,
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
