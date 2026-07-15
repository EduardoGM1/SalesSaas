import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";

const TOOL_LABEL_KEYS = {
  survey: "tools.survey",
  vacaciones: "tools.vacation",
  worksheet: "tools.worksheet",
};

const COLORS = {
  survey: "#2563eb",
  vacaciones: "#0d9488",
  worksheet: "#7c3aed",
};

/**
 * Distribución por herramienta (dona): pocas categorías + % del total.
 * Solo métricas agregadas (conteos), sin datos de clientes.
 */
export function AdminToolsByToolChart({ byTool = [] }) {
  const { t } = useI18n();
  const { fmtN } = useMoney();

  const total = byTool.reduce((sum, row) => sum + (Number(row.saves) || 0), 0);
  const data = byTool.map((row) => ({
    tool: row.tool,
    name: t(TOOL_LABEL_KEYS[row.tool] || row.tool),
    value: Number(row.saves) || 0,
    pct: total > 0 ? Math.round(((Number(row.saves) || 0) / total) * 100) : 0,
  }));

  if (!data.length || total === 0) {
    return <div className="admin-empty">{t("admin.tools.empty")}</div>;
  }

  return (
    <div className="admin-chart-wrap admin-tools-donut-wrap">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={68}
            outerRadius={100}
            paddingAngle={2}
            stroke="#fff"
            strokeWidth={2}
          >
            {data.map((entry) => (
              <Cell key={entry.tool} fill={COLORS[entry.tool] || "#94a3b8"} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, _name, item) => {
              const pct = item?.payload?.pct ?? 0;
              return [`${fmtN(value)} (${pct}%)`, t("admin.tools.saves")];
            }}
          />
          <Legend
            formatter={(value, entry) => {
              const pct = entry?.payload?.pct ?? 0;
              return `${value} · ${pct}%`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
