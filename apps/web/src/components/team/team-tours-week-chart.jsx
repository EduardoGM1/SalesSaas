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

export function TeamToursWeekChart({ data = [] }) {
  const { t } = useI18n();
  const { fmtN } = useMoney();
  const rows = (data || []).map((w) => ({
    label: t("team.exec.weekN", { n: w.week }),
    tours: Number(w.tours) || 0,
  }));

  if (!rows.length || rows.every((r) => !r.tours)) {
    return <div className="admin-empty">{t("team.exec.chartEmpty")}</div>;
  }

  return (
    <div className="admin-chart-wrap">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => [fmtN(v), t("team.exec.tours")]} />
          <Bar dataKey="tours" fill="#0d9488" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
