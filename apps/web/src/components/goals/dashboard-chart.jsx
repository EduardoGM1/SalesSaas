
import { fmtN } from "@/lib/format/money";
import { DashboardWeek } from "@/lib/calculations/calendar";

export function DashboardChart({ weeks }: { weeks: DashboardWeek[] }) {
  const values = weeks.flatMap((w) => [w.obj || 0, w.real || 0]);
  const maxVal = Math.max(0, ...values);

  if (maxVal <= 0) {
    return (
      <div className="dash-chart-empty">
        <div>
          <strong>Sin datos para graficar todavía.</strong>
          <br />
          Guarda una meta del mes y registra ventas en Agenda.
        </div>
      </div>
    );
  }

  const yMax = Math.ceil((maxVal * 1.12) / 10000) * 10000 || maxVal;
  const W = 760;
  const H = 315;
  const m = { l: 72, r: 26, t: 16, b: 48 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const n = Math.max(weeks.length, 1);
  const x = (i: number) => m.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (v: number) => m.t + ih - (Math.max(0, Math.min(yMax, v)) / yMax) * ih;

  const targetPts = weeks.map((w, i) => [x(i), y(w.obj || 0)] as [number, number]);
  const areaPath = targetPts.length
    ? `M ${targetPts[0][0]} ${m.t + ih} L ${targetPts.map((p) => p.join(" ")).join(" L ")} L ${targetPts[targetPts.length - 1][0]} ${m.t + ih} Z`
    : "";
  const linePath = targetPts.length ? `M ${targetPts.map((p) => p.join(" ")).join(" L ")}` : "";
  const ticks = [yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0];
  const barW = Math.max(18, Math.min(42, iw / (n * 5)));

  return (
    <div className="dash-area-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%" role="img" aria-label="Objetivo versus real por semana">
        {ticks.map((t) => (
          <g key={t}>
            <line className="dash-grid-line" x1={m.l} y1={y(t)} x2={W - m.r} y2={y(t)} stroke="#c8d2e4" strokeDasharray="4 4" />
            <text className="dash-axis-text" x={m.l - 10} y={y(t) + 4} textAnchor="end" fill="#6b7ea8" fontSize="11">
              ${fmtN(t)}
            </text>
          </g>
        ))}
        <line x1={m.l} y1={m.t} x2={m.l} y2={m.t + ih} stroke="#9aa8bd" />
        <line x1={m.l} y1={m.t + ih} x2={W - m.r} y2={m.t + ih} stroke="#9aa8bd" />
        <path d={areaPath} fill="rgba(37,99,235,.16)" />
        <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="2.4" />
        {targetPts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="4" fill="#fff" stroke="#2563eb" strokeWidth="2.5" />
        ))}
        {weeks.map((w, i) => {
          const bh = ((Math.max(0, w.real || 0) / yMax) * ih);
          return (
            <rect
              key={`bar-${i}`}
              x={x(i) - barW / 2}
              y={m.t + ih - bh}
              width={barW}
              height={bh}
              fill="rgba(5,150,105,.78)"
              stroke="rgba(5,150,105,.95)"
              rx="6"
            />
          );
        })}
        {weeks.map((w, i) => (
          <text key={`lbl-${i}`} x={x(i)} y={H - 28} textAnchor="middle" fill="#6b7ea8" fontSize="11" fontWeight="600">
            {w.weekNo}
          </text>
        ))}
        <text x={m.l + iw / 2} y={H - 6} textAnchor="middle" fill="#1a2540" fontSize="13" fontWeight="800">
          Sem #
        </text>
      </svg>
    </div>
  );
}
