import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";

const TOOL_LABEL_KEYS = {
  survey: "team.exec.tool.survey",
  vacaciones: "team.exec.tool.vacation",
  worksheet: "team.exec.tool.worksheet",
};

const COLORS = {
  survey: "#2563eb",
  vacaciones: "#0d9488",
  worksheet: "#7c3aed",
};

export function TeamToolsDonut({ tools = [] }) {
  const { t } = useI18n();
  const { fmtN } = useMoney();
  const total = tools.reduce((sum, row) => sum + (Number(row.saves) || 0), 0);
  const data = tools.map((row) => ({
    tool: row.tool,
    name: t(TOOL_LABEL_KEYS[row.tool] || row.tool),
    value: Number(row.saves) || 0,
    pct: Number(row.pct) || 0,
  }));

  if (!data.length || total === 0) {
    return <div className="admin-empty">{t("team.exec.toolsEmpty")}</div>;
  }

  return (
    <div className="admin-chart-wrap admin-tools-donut-wrap">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={94}
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
              return [`${fmtN(value)} (${pct}%)`, t("team.exec.saves")];
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
