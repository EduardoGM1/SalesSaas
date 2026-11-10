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
 * Tendencia mensual por herramienta (líneas): serie temporal.
 * Solo conteos agregados de guardados.
 */
export function AdminToolsTrendChart({ trend = [] }) {
  const { t } = useI18n();
  const { fmtN } = useMoney();

  const empty =
    !trend.length ||
    trend.every(
      (row) =>
        (Number(row.survey) || 0) === 0 &&
        (Number(row.vacaciones) || 0) === 0 &&
        (Number(row.worksheet) || 0) === 0,
    );

  if (empty) {
    return <div className="admin-empty">{t("admin.tools.empty")}</div>;
  }

  const labelOf = (key) => {
    if (key === "survey") return t("tools.survey");
    if (key === "vacaciones") return t("tools.vacation");
    if (key === "worksheet") return t("tools.worksheet");
    return key;
  };

  return (
    <div className="admin-chart-wrap">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            formatter={(value, name) => [fmtN(value), labelOf(name)]}
            labelFormatter={(label) => label}
          />
          <Legend formatter={(value) => labelOf(value)} />
          <Line
            type="monotone"
            dataKey="survey"
            name="survey"
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="vacaciones"
            name="vacaciones"
            stroke="#0d9488"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="worksheet"
            name="worksheet"
            stroke="#7c3aed"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
