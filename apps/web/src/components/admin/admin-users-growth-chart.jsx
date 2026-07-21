import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";

/** Altas de usuarios por mes (agregado). */
export function AdminUsersGrowthChart({ data = [] }) {
  const { t } = useI18n();
  const { fmtN } = useMoney();

  const empty = !data.length || data.every((d) => (Number(d.users) || 0) === 0);
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
          <Tooltip formatter={(value) => [fmtN(value), t("admin.chart.newUsers")]} />
          <Bar dataKey="users" fill="#2563eb" radius={[4, 4, 0, 0]} name="users" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
