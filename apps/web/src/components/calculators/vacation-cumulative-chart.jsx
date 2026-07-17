import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";

/**
 * Gráfica acumulada de Proyección de Vacaciones (solo acumulado).
 * Sin toggles Anual/Acumulado ni descarga — Recharts (misma lib que Admin).
 */
export function VacationCumulativeChart({ series = [] }) {
  const { t } = useI18n();
  const { fmt, fmtN } = useMoney();

  if (!series.length || series.every((p) => p.yearIndex === 0)) {
    return (
      <div className="vacation-chart-empty">
        {t("tools.vacation.chartEmpty")}
      </div>
    );
  }

  return (
    <div className="vacation-chart-wrap">
      <div className="card-heading vacation-chart-title">{t("tools.vacation.chartTitle")}</div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={series} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            tickFormatter={(v) => fmtN(v)}
            width={56}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <Tooltip
            formatter={(value, name) => [
              fmt(Number(value) || 0),
              name === "withInflation"
                ? t("tools.vacation.chartWithInflation")
                : t("tools.vacation.chartWithoutInflation"),
            ]}
            labelFormatter={(year) => String(year)}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid var(--border)",
              fontSize: 12,
            }}
          />
          <Legend
            formatter={(value) =>
              value === "withInflation"
                ? t("tools.vacation.chartWithInflation")
                : t("tools.vacation.chartWithoutInflation")
            }
          />
          <Line
            type="monotone"
            dataKey="withInflation"
            name="withInflation"
            stroke="var(--red)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "var(--red)" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="withoutInflation"
            name="withoutInflation"
            stroke="var(--blue)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "var(--blue)" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
