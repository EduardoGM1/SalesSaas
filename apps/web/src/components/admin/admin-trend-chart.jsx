
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
import type { MonthlyTrendPoint } from "@/lib/admin/types";

export function AdminTrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  if (!data.length || data.every((d) => d.sales === 0)) {
    return <div className="admin-empty">Sin datos de ventas en los últimos meses.</div>;
  }

  return (
    <div className="admin-chart-wrap">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="vol" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="cnt" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            formatter={(value, name) =>
              name === "volume" ? [`$${Number(value).toLocaleString("en-US")}`, "Volumen"] : [value, "Ventas"]
            }
          />
          <Legend formatter={(v) => (v === "volume" ? "Volumen ($)" : "Nº ventas")} />
          <Bar yAxisId="vol" dataKey="volume" fill="#2563eb" radius={[4, 4, 0, 0]} name="volume" />
          <Bar yAxisId="cnt" dataKey="sales" fill="#94a3b8" radius={[4, 4, 0, 0]} name="sales" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
