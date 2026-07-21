import { AdminTrendChart } from "@/components/admin/admin-trend-chart.jsx";
import { AdminProspectsTrendChart } from "@/components/admin/admin-prospects-trend-chart.jsx";
import { AdminToolsByToolChart } from "@/components/admin/admin-tools-by-tool-chart.jsx";
import { AdminToolsTrendChart } from "@/components/admin/admin-tools-trend-chart.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";

function GrowthBadge({ value }) {
  const n = Number(value) || 0;
  const tone = n > 0 ? "up" : n < 0 ? "down" : "flat";
  const sign = n > 0 ? "+" : "";
  return (
    <span className={`admin-kpi-delta admin-kpi-delta--${tone}`}>
      {sign}{n}%
    </span>
  );
}

function KpiCard({ label, value, sub, delta }) {
  return (
    <div className="admin-kpi admin-kpi--exec">
      <div className="admin-kpi-label">{label}</div>
      <div className="admin-kpi-value-row">
        <div className="admin-kpi-value">{value}</div>
        {delta != null ? <GrowthBadge value={delta} /> : null}
      </div>
      {sub ? <div className="admin-kpi-sub">{sub}</div> : null}
    </div>
  );
}

function Section({ title, children, className = "" }) {
  return (
    <section className={`admin-exec-section ${className}`.trim()}>
      <h2 className="admin-exec-section-title">{title}</h2>
      {children}
    </section>
  );
}

export function AdminOverviewPage() {
  const { t } = useI18n();
  const { fmt, fmtN } = useMoney();
  const { loading, data, error } = useAdminFetch("overview");

  if (loading) return <div className="admin-page">{t("admin.loading.overview")}</div>;
  if (error) return <div className="admin-page admin-empty">{error}</div>;
  if (!data) return null;

  const closedRate =
    data.prospectsCount > 0
      ? Math.round((data.prospectsClosed / data.prospectsCount) * 1000) / 10
      : 0;

  const platformKpis = [
    {
      label: t("admin.kpi.usersActive"),
      value: fmtN(data.usersActive),
      sub: t("admin.kpi.usersActiveSub", { total: fmtN(data.usersCount), month: fmtN(data.usersCreatedMonth) }),
    },
    {
      label: t("admin.kpi.files"),
      value: fmtN(data.prospectsCount),
      sub: t("admin.kpi.filesMonthSub", { n: fmtN(data.prospectsMonth) }),
    },
    {
      label: t("admin.kpi.filesClosed"),
      value: fmtN(data.prospectsClosed),
      sub: t("admin.kpi.filesClosedSub", { pct: closedRate }),
    },
    {
      label: t("admin.kpi.conversion"),
      value: `${fmtN(data.conversionRate)}%`,
      sub: t("admin.kpi.conversionSub"),
    },
  ];

  const commercialKpis = [
    {
      label: t("admin.kpi.totalVolume"),
      value: fmt(data.totalVolume),
      sub: t("admin.kpi.yearVolumeSub", { n: fmt(data.yearVolume) }),
    },
    {
      label: t("admin.kpi.monthVolume"),
      value: fmt(data.monthVolume),
      delta: data.growthVolumeMoM,
      sub: t("admin.kpi.vsPrevMonth"),
    },
    {
      label: t("admin.kpi.monthSales"),
      value: fmtN(data.monthSalesCount),
      delta: data.growthSalesMoM,
      sub: t("admin.kpi.totalSalesSub", { n: fmtN(data.salesCount) }),
    },
    {
      label: t("admin.kpi.avgTicket"),
      value: fmt(data.avgVolumePerSale),
      sub: t("admin.kpi.avgTicketSub"),
    },
  ];

  const adoptionKpis = [
    {
      label: t("admin.kpi.toolSaves"),
      value: fmtN(data.toolSavesTotal),
      sub: t("admin.kpi.toolSavesSub"),
    },
    {
      label: t("admin.kpi.discoveryLinked"),
      value: fmtN(data.surveyLinked),
      sub: t("admin.kpi.discoverySub", { total: fmtN(data.surveyTotal) }),
    },
    {
      label: t("admin.kpi.memberships"),
      value: fmtN(data.membershipsActive),
      sub: t("admin.kpi.membershipsSub"),
    },
    {
      label: t("admin.kpi.filesPerDay"),
      value: fmtN(data.prospectsPerDay30),
      sub: t("admin.kpi.filesPerDaySub"),
    },
  ];

  const generated = data.generatedAt
    ? new Date(data.generatedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="admin-page admin-page--exec">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-h1">{t("admin.overview.title")}</h1>
          <p className="admin-sub">{t("admin.overview.subExec")}</p>
        </div>
        <div className="admin-exec-health" title={t("admin.overview.healthHint")}>
          <span className="admin-exec-health-dot" aria-hidden />
          <span>{t("admin.overview.healthOk")}</span>
          {generated ? (
            <span className="admin-exec-health-meta">
              {t("admin.overview.updatedAt", { when: generated })}
            </span>
          ) : null}
        </div>
      </div>

      <Section title={t("admin.overview.section.platform")}>
        <div className="admin-kpis admin-kpis--exec">
          {platformKpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>
      </Section>

      <Section title={t("admin.overview.section.commercial")}>
        <div className="admin-kpis admin-kpis--exec">
          {commercialKpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>
      </Section>

      <Section title={t("admin.overview.section.adoption")}>
        <div className="admin-kpis admin-kpis--exec">
          {adoptionKpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>
      </Section>

      <div className="admin-exec-charts">
        <div className="client-table-card admin-chart-card">
          <div className="admin-card-head">{t("admin.chart.salesTrend")}</div>
          <AdminTrendChart data={data.salesTrend || []} />
        </div>
        <div className="client-table-card admin-chart-card">
          <div className="admin-card-head">{t("admin.chart.prospectsTrend")}</div>
          <AdminProspectsTrendChart data={data.prospectsTrend || []} />
        </div>
        <div className="client-table-card admin-chart-card">
          <div className="admin-card-head">{t("admin.chart.toolsMix")}</div>
          <AdminToolsByToolChart byTool={data.toolsByTool || []} />
        </div>
        <div className="client-table-card admin-chart-card">
          <div className="admin-card-head">{t("admin.chart.toolsTrend")}</div>
          <AdminToolsTrendChart trend={data.toolsTrend || []} />
        </div>
      </div>

      <p className="admin-exec-footnote">{t("admin.overview.privacyFootnote")}</p>
    </div>
  );
}
