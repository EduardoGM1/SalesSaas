import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";

/**
 * Tendencia agregada de expedientes (creados vs finalizados) — sin datos por usuario.
 */
export function AdminProspectsTrendChart({ data = [] }) {
  const { t } = useI18n();
  const { fmtN } = useMoney();

  const empty =
    !data.length ||
    data.every((d) => (Number(d.prospects) || 0) === 0 && (Number(d.closed) || 0) === 0);

  if (empty) {
    return <div className="admin-empty">{t("admin.chart.empty")}</div>;
  }

  return (
    <div className="admin-chart-wrap">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            formatter={(value, name) => [
              fmtN(value),
              name === "closed"
                ? t("admin.chart.prospectsClosed")
                : t("admin.chart.prospectsCreated"),
            ]}
          />
          <Legend
            formatter={(v) =>
              v === "closed" ? t("admin.chart.prospectsClosed") : t("admin.chart.prospectsCreated")
            }
          />
          <Bar dataKey="prospects" fill="#0f766e" radius={[4, 4, 0, 0]} name="prospects" />
          <Bar dataKey="closed" fill="#94a3b8" radius={[4, 4, 0, 0]} name="closed" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
