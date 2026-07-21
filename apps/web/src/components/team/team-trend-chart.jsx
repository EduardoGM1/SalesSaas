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

export function TeamTrendChart({ data = [] }) {
  const { t } = useI18n();
  const { fmtN } = useMoney();

  if (!data.length || data.every((d) => !d.sales && !d.volume)) {
    return <div className="admin-empty">{t("team.exec.chartEmpty")}</div>;
  }

  return (
    <div className="admin-chart-wrap">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="vol" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="cnt" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            formatter={(value, name) =>
              name === "volume"
                ? [fmtN(value), t("team.exec.volume")]
                : [fmtN(value), t("team.exec.sales")]
            }
          />
          <Legend
            formatter={(v) => (v === "volume" ? t("team.exec.volume") : t("team.exec.sales"))}
          />
          <Bar yAxisId="vol" dataKey="volume" fill="#2563eb" radius={[4, 4, 0, 0]} name="volume" />
          <Bar yAxisId="cnt" dataKey="sales" fill="#94a3b8" radius={[4, 4, 0, 0]} name="sales" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
