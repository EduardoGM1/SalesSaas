
import { useMoney } from "@/hooks/use-money.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { DashboardWeek } from "@/lib/calculations/calendar";

export function DashboardChart({ weeks }: { weeks: DashboardWeek[] }) {
  const { fmtN } = useMoney();
  const { t } = useI18n();
  const values = weeks.flatMap((w) => [w.obj || 0, w.real || 0]);
  const maxVal = Math.max(0, ...values);

  if (maxVal <= 0) {
    return (
      <div className="dash-chart-empty">
        <div>
          <strong>{t("goals.chartEmpty")}</strong>
          <br />
          {t("goals.chartEmptyHint")}
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
      <svg viewBox={`0 0 ${W} ${H}`} className="dash-chart-svg" preserveAspectRatio="xMidYMid meet">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={m.l} x2={W - m.r} y1={y(tick)} y2={y(tick)} className="dash-grid-line" />
            <text x={m.l - 8} y={y(tick) + 4} textAnchor="end" className="dash-axis-label">{fmtN(tick)}</text>
          </g>
        ))}
        {areaPath && <path d={areaPath} className="dash-area-fill" />}
        {linePath && <path d={linePath} className="dash-target-line" fill="none" />}
        {weeks.map((w, i) => (
          <rect
            key={w.weekNo}
            x={x(i) - barW / 2}
            y={y(w.real || 0)}
            width={barW}
            height={m.t + ih - y(w.real || 0)}
            className="dash-real-bar"
            rx={3}
          />
        ))}
        {weeks.map((w, i) => (
          <text key={`lbl-${w.weekNo}`} x={x(i)} y={H - 14} textAnchor="middle" className="dash-week-label">{w.weekNo}</text>
        ))}
      </svg>
    </div>
  );
}
