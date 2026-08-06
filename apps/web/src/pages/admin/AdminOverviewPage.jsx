import { Link, useOutletContext } from "react-router-dom";
import { Activity, Building2, Database, Mail, Radio, Server, Users } from "lucide-react";
import { AdminUsersGrowthChart } from "@/components/admin/admin-users-growth-chart.jsx";
import { AdminToolsByToolChart } from "@/components/admin/admin-tools-by-tool-chart.jsx";
import { AdminToolsTrendChart } from "@/components/admin/admin-tools-trend-chart.jsx";
import {
  AdminCard,
  AdminChartCard,
  AdminKpiCard,
  AdminPageHeader,
  AdminPageState,
  AdminStatusBadge,
  AdminTimeline,
} from "@/components/admin/admin-ui.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { adminPermissionSetHas, expandAdminPermissionSet } from "@/lib/auth/permissions";
import { narrateAdminLogSummary } from "@/lib/admin/log-narrative.js";

function formatMinutes(mins, t) {
  const m = Number(mins) || 0;
  if (m <= 0) return t("admin.kpi.sessionNone");
  if (m < 60) return t("admin.kpi.sessionMinutes", { n: m });
  return t("admin.kpi.sessionHoursMins", { h: Math.floor(m / 60), m: Math.round(m % 60) });
}

function CompaniesMetric({ enabled, fmtN }) {
  const { data } = useAdminFetch(enabled ? "empresas" : "");
  return (
    <div className="admin-hero-stat">
      <Building2 size={16} aria-hidden />
      <div><strong>{enabled && Array.isArray(data) ? fmtN(data.length) : "—"}</strong><span>Empresas</span></div>
    </div>
  );
}

function RecentActivity({ enabled }) {
  const { t } = useI18n();
  const { loading, data, error } = useAdminFetch(enabled ? "logs" : "", "?");
  if (!enabled) {
    return <p className="admin-card-muted">Tu rol no incluye acceso a la bitácora administrativa.</p>;
  }
  const items = Array.isArray(data?.items) ? data.items.slice(0, 6) : [];
  return (
    <AdminPageState loading={loading} error={error}>
      <AdminTimeline
        items={items}
        emptyTitle={t("admin.logs.empty")}
        renderItem={(item) => (
          <>
            <div className="admin-timeline-title">
              {item.actor_nombre || "Sistema"} · {narrateAdminLogSummary(item.detalle, t)}
            </div>
            <time className="admin-timeline-time">
              {item.fecha ? new Date(item.fecha).toLocaleString() : "—"}
            </time>
          </>
        )}
      />
    </AdminPageState>
  );
}

function ToolUsage({ items = [], fmtN }) {
  const max = Math.max(1, ...items.map((item) => Number(item.count ?? item.total ?? item.value) || 0));
  if (!items.length) return <p className="admin-card-muted">Todavía no hay uso registrado.</p>;
  return (
    <div className="admin-tool-bars">
      {items.slice(0, 8).map((item, index) => {
        const value = Number(item.count ?? item.total ?? item.value) || 0;
        const label = item.label || item.tool || item.name || `Herramienta ${index + 1}`;
        return (
          <div key={item.tool || item.name || index} className="admin-tool-bar">
            <div className="admin-tool-bar-head"><span>{label}</span><strong>{fmtN(value)}</strong></div>
            <div className="admin-tool-bar-track"><span style={{ width: `${Math.max(3, (value / max) * 100)}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

export function AdminOverviewPage() {
  const { t } = useI18n();
  const { fmtN } = useMoney();
  const session = useOutletContext();
  const scopedId = session?.scope === "empresa"
    ? session?.empresaIds?.[0]
    : session?.workspaceIds?.[0];
  const overviewPath = session?.scope === "empresa" && scopedId
    ? `tenant/empresas/${scopedId}/overview`
    : session?.scope === "workspace" && scopedId
      ? `tenant/workspaces/${scopedId}/overview`
      : "overview";
  const { loading, data, error } = useAdminFetch(overviewPath);
  const permSet = expandAdminPermissionSet(session?.permissions || session?.profile?.admin_permissions || []);
  const canSeeLogs = Boolean(session?.isSuperAdmin || adminPermissionSetHas(permSet, "ver_logs"));
  const canSeeCompanies = Boolean(session?.isSuperAdmin);

  const generated = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "—";

  if (session?.scope && session.scope !== "plataforma") {
    const scopeLabel = session.scope === "empresa" ? "Empresa" : "Sala de Ventas";
    return (
      <div className="admin-page admin-overview-enterprise">
        <AdminPageHeader
          eyebrow={`Administración de ${scopeLabel.toLowerCase()}`}
          title={`Resumen de ${scopeLabel}`}
          subtitle="Indicadores limitados estrictamente al alcance que administras."
          actions={session.scope === "empresa" ? <Link to="/admin/empresas" className="btn btn-primary">Administrar empresa</Link> : <Link to="/clients" className="btn btn-primary">Ver clientes</Link>}
        />
        <AdminPageState loading={loading} error={error} skeleton="overview">
          {data ? (
            <>
              <section className="admin-overview-kpis" aria-label="Indicadores del alcance">
                {session.scope === "empresa" ? <AdminKpiCard label="Salas" value={fmtN(data.salas)} /> : null}
                <AdminKpiCard label="Miembros" value={fmtN(data.miembros)} />
                <AdminKpiCard label="Expedientes" value={fmtN(data.expedientes)} />
                <AdminKpiCard label="Ventas" value={fmtN(data.ventas)} />
              </section>
              <AdminCard title="Aislamiento activo" subtitle="Esta vista no agrega información de otras empresas o salas.">
                <AdminStatusBadge tone="success"><Activity size={12} aria-hidden /> Alcance {scopeLabel}</AdminStatusBadge>
              </AdminCard>
            </>
          ) : null}
        </AdminPageState>
      </div>
    );
  }

  return (
    <div className="admin-page admin-overview-enterprise">
      <AdminPageHeader
        eyebrow="Control de plataforma"
        title={t("admin.overview.title")}
        subtitle={t("admin.overview.subUsage")}
        actions={canSeeLogs ? <Link to="/admin/logs" className="btn btn-ghost">Ver actividad</Link> : null}
      />

      <AdminPageState loading={loading} error={error} skeleton="overview">
        {data ? (
          <>
            <section className="admin-overview-hero">
              <div className="admin-overview-hero-copy">
                <AdminStatusBadge tone="success"><Activity size={12} aria-hidden /> Plataforma operativa</AdminStatusBadge>
                <h2>La operación está disponible y recibiendo actividad.</h2>
                <p>Vista agregada para entender crecimiento, adopción y salud de los datos sin exponer desempeño individual.</p>
                <span className="admin-overview-updated">Última actualización: {generated}</span>
              </div>
              <div className="admin-hero-stats">
                <div className="admin-hero-stat"><Users size={16} aria-hidden /><div><strong>{fmtN(data.usersCount)}</strong><span>Usuarios</span></div></div>
                <CompaniesMetric enabled={canSeeCompanies} fmtN={fmtN} />
                <div className="admin-hero-stat"><Database size={16} aria-hidden /><div><strong>{fmtN(data.prospectsCount)}</strong><span>Expedientes</span></div></div>
                <div className="admin-hero-stat"><Activity size={16} aria-hidden /><div><strong>{fmtN(data.membershipsActive)}</strong><span>Membresías</span></div></div>
              </div>
            </section>

            <section className="admin-overview-kpis" aria-label="Indicadores principales">
              <AdminKpiCard
                label={t("admin.kpi.usersTotal")}
                value={fmtN(data.usersCount)}
                comparison={`${Number(data.growthUsersMoM) > 0 ? "+" : ""}${Number(data.growthUsersMoM) || 0}%`}
                tone={Number(data.growthUsersMoM) >= 0 ? "success" : "danger"}
                description={t("admin.kpi.usersTotalSub", { active: fmtN(data.usersActiveAccounts), inactive: fmtN(data.usersInactiveAccounts) })}
              />
              <AdminKpiCard label={t("admin.kpi.activeWeek")} value={fmtN(data.usersActiveWeek)} comparison={`${fmtN(data.pctActiveWeek)}%`} tone="info" description={t("admin.kpi.activeTodaySub")} />
              <AdminKpiCard label={t("admin.kpi.files")} value={fmtN(data.prospectsCount)} comparison={`+${fmtN(data.prospectsMonth)}`} tone="success" description={t("admin.kpi.filesMonthSub", { n: fmtN(data.prospectsMonth) })} />
              <AdminKpiCard label={t("admin.kpi.toolSaves")} value={fmtN(data.toolSavesTotal)} description={`${t("admin.kpi.avgSession")}: ${formatMinutes(data.avgSessionMinutes, t)}`} />
            </section>

            <section className="admin-overview-charts">
              <AdminChartCard title={t("admin.chart.usersGrowth")} subtitle="Altas mensuales de usuarios">
                <AdminUsersGrowthChart data={data.usersTrend || []} />
              </AdminChartCard>
              <AdminChartCard title={t("admin.chart.toolsMix")} subtitle="Distribución acumulada de guardados">
                <AdminToolsByToolChart byTool={data.toolsByTool || []} />
              </AdminChartCard>
              <AdminChartCard title={t("admin.chart.toolsTrend")} subtitle="Evolución de adopción por herramienta" className="admin-chart-panel--wide">
                <AdminToolsTrendChart trend={data.toolsTrend || []} />
              </AdminChartCard>
            </section>

            <section className="admin-overview-lower">
              <AdminCard title="Actividad reciente" subtitle="Cambios administrativos más recientes" action={canSeeLogs ? <Link to="/admin/logs">Ver todos</Link> : null}>
                <RecentActivity enabled={canSeeLogs} />
              </AdminCard>
              <AdminCard title="Estado del sistema" subtitle="Disponibilidad observada por este panel">
                <div className="admin-service-list">
                  {[
                    [Server, "API", "Operativo", "success"],
                    [Database, "Base de datos", "Operativo", "success"],
                    [Radio, "Realtime", "No monitorizado", "neutral"],
                    [Database, "Storage", "No monitorizado", "neutral"],
                    [Mail, "Correo", "No monitorizado", "neutral"],
                  ].map(([Icon, label, status, tone]) => (
                    <div key={label} className="admin-service-row">
                      <span><Icon size={15} aria-hidden />{label}</span>
                      <AdminStatusBadge tone={tone}>{status}</AdminStatusBadge>
                    </div>
                  ))}
                </div>
              </AdminCard>
              <AdminCard title="Uso de herramientas" subtitle="Guardados acumulados por producto" className="admin-overview-tools-card">
                <ToolUsage items={data.toolsByTool || []} fmtN={fmtN} />
              </AdminCard>
            </section>

            <p className="admin-exec-footnote">{t("admin.overview.privacyFootnoteUsage")}</p>
          </>
        ) : null}
      </AdminPageState>
    </div>
  );
}
