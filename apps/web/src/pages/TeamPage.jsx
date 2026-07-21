import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  FileText,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { DashboardKpiCard } from "@/components/goals/dashboard-kpi-card.jsx";
import { TeamTrendChart } from "@/components/team/team-trend-chart.jsx";
import { TeamToolsDonut } from "@/components/team/team-tools-donut.jsx";
import { TeamToursWeekChart } from "@/components/team/team-tours-week-chart.jsx";
import { TeamFunnel } from "@/components/team/team-funnel.jsx";
import { TeamRanking } from "@/components/team/team-ranking.jsx";
import { TeamAlerts } from "@/components/team/team-alerts.jsx";
import { TeamActivityFeed } from "@/components/team/team-activity-feed.jsx";
import { TeamGoalsProgress } from "@/components/team/team-goals-progress.jsx";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { useUserPermissions } from "@/hooks/use-user-permissions.js";
import { toast } from "@/lib/toast";

async function api(path) {
  const res = await fetch(`/api/v1${path}`, { credentials: "include", cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Error");
  return body.data ?? body;
}

function Delta({ value }) {
  const n = Number(value) || 0;
  const tone = n > 0 ? "up" : n < 0 ? "down" : "flat";
  const sign = n > 0 ? "+" : "";
  return (
    <span className={`admin-kpi-delta admin-kpi-delta--${tone}`}>
      {sign}{n}%
    </span>
  );
}

function Section({ title, children, className = "" }) {
  return (
    <section className={`admin-exec-section team-exec-section ${className}`.trim()}>
      <h2 className="admin-exec-section-title">{title}</h2>
      {children}
    </section>
  );
}

export function TeamPage() {
  const { t, months } = useI18n();
  const { fmtN } = useMoney();
  const { can, profile } = useUserPermissions();
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const yearOptions = useMemo(
    () => [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1],
    [now],
  );
  const [dashboard, setDashboard] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberProspects, setMemberProspects] = useState([]);
  const [loading, setLoading] = useState(true);

  const canTeam = can("dashboard:ver_equipo") || can("expedientes:ver_equipo");
  const teamIds = Array.isArray(profile?.team_member_ids) ? profile.team_member_ids : [];

  useEffect(() => {
    if (!isSupabaseConfigured() || !canTeam) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api(`/team/dashboard?year=${year}&month=${month}`)
      .then((dash) => {
        if (!cancelled) setDashboard(dash || null);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [canTeam, year, month]);

  const openMember = async (memberId) => {
    setSelectedMember(memberId);
    try {
      const rows = await api(`/team/members/${memberId}/prospects`);
      setMemberProspects(Array.isArray(rows) ? rows : []);
    } catch (err) {
      toast.error(err.message);
      setMemberProspects([]);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar title={t("team.title")} subtitle={t("team.subtitle")} />
        <div className="sales-page">
          <div className="page-toolbar"><PageBack inline /></div>
          <div className="ethic-box">{t("network.cloudRequired")}</div>
        </div>
      </>
    );
  }

  if (!canTeam && teamIds.length === 0) {
    return (
      <>
        <Topbar title={t("team.title")} subtitle={t("team.subtitle")} />
        <div className="sales-page">
          <div className="page-toolbar"><PageBack inline /></div>
          <div className="ethic-box">{t("team.noAccess")}</div>
        </div>
      </>
    );
  }

  const kpis = dashboard?.kpis || {};
  const monthK = kpis.month || {};
  const dayK = kpis.day || {};
  const deltas = kpis.deltas || {};
  const conversions = kpis.conversions || {};
  const goalsProgress = kpis.goalsProgress || {};
  const monthLabel = months?.[month - 1] || `${month}`;

  return (
    <>
      <Topbar title={t("team.title")} subtitle={t("team.exec.subtitle")} />
      <div className="sales-page team-exec-page">
        <div className="page-toolbar team-exec-toolbar">
          <PageBack inline />
          <div className="team-period-controls">
            <label className="team-period-field">
              <span>{t("team.exec.month")}</span>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                aria-label={t("team.exec.month")}
              >
                {(months || []).map((label, idx) => (
                  <option key={label} value={idx + 1}>{label}</option>
                ))}
              </select>
            </label>
            <label className="team-period-field">
              <span>{t("team.exec.year")}</span>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label={t("team.exec.year")}
              >
                {[...new Set([...yearOptions, year])].sort().map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {loading ? (
          <div className="dp-empty">{t("common.loading")}</div>
        ) : (
          <>
            <Section title={t("team.exec.section.kpis")}>
              <div className="dash-kpi-grid team-exec-kpi-grid">
                <div className="team-kpi-wrap">
                  <DashboardKpiCard icon={Users} label={t("team.exec.kpi.toursMonth")} value={fmtN(monthK.tours || 0)} />
                  <Delta value={deltas.tours} />
                </div>
                <div className="team-kpi-wrap">
                  <DashboardKpiCard icon={TrendingUp} label={t("team.exec.kpi.salesMonth")} value={fmtN(monthK.ventas || 0)} />
                  <Delta value={deltas.ventas} />
                </div>
                <div className="team-kpi-wrap">
                  <DashboardKpiCard icon={Wallet} label={t("team.exec.kpi.volMonth")} value={fmtN(monthK.vol || 0)} />
                  <Delta value={deltas.vol} />
                </div>
                <DashboardKpiCard icon={Activity} label={t("team.exec.kpi.toursDay")} value={fmtN(dayK.tours || 0)} />
                <DashboardKpiCard icon={TrendingUp} label={t("team.exec.kpi.salesDay")} value={fmtN(dayK.ventas || 0)} />
                <DashboardKpiCard icon={FileText} label={t("team.exec.kpi.discovery")} value={fmtN(monthK.discovery || 0)} />
                <DashboardKpiCard icon={FileText} label={t("team.exec.kpi.worksheet")} value={fmtN(monthK.worksheet || 0)} />
                <DashboardKpiCard icon={FileText} label={t("team.exec.kpi.prospects")} value={fmtN(monthK.prospectsCreated || 0)} />
                <DashboardKpiCard icon={Target} label={t("team.exec.kpi.finalized")} value={fmtN(monthK.prospectsFinalized || 0)} />
                <DashboardKpiCard icon={Target} label={t("team.exec.kpi.convTour")} value={`${fmtN(conversions.tourToSale || 0)}%`} />
                <DashboardKpiCard icon={Target} label={t("team.exec.kpi.convDisc")} value={`${fmtN(conversions.discoveryToSale || 0)}%`} />
                <DashboardKpiCard
                  icon={Target}
                  label={t("team.exec.kpi.goalPct")}
                  value={goalsProgress.pctVol == null ? "—" : `${fmtN(goalsProgress.pctVol)}%`}
                />
              </div>
              <p className="team-exec-period-hint">
                {t("team.exec.periodHint", { month: monthLabel, year })}
              </p>
            </Section>

            <div className="team-exec-grid-2">
              <Section title={t("team.exec.section.goals")}>
                <div className="dash-data-card">
                  <TeamGoalsProgress goalsProgress={goalsProgress} month={monthK} />
                </div>
              </Section>
              <Section title={t("team.exec.section.alerts")}>
                <div className="dash-data-card">
                  <TeamAlerts alerts={dashboard?.alerts || []} />
                </div>
              </Section>
            </div>

            <div className="team-exec-grid-2">
              <Section title={t("team.exec.section.trend")}>
                <div className="dash-data-card">
                  <TeamTrendChart data={dashboard?.series?.salesTrend || []} />
                </div>
              </Section>
              <Section title={t("team.exec.section.toursWeek")}>
                <div className="dash-data-card">
                  <TeamToursWeekChart data={dashboard?.series?.toursByWeek || []} />
                </div>
              </Section>
            </div>

            <div className="team-exec-grid-2">
              <Section title={t("team.exec.section.funnel")}>
                <div className="dash-data-card">
                  <TeamFunnel funnel={dashboard?.funnel || []} />
                </div>
              </Section>
              <Section title={t("team.exec.section.tools")}>
                <div className="dash-data-card">
                  <TeamToolsDonut tools={dashboard?.tools || []} />
                </div>
              </Section>
            </div>

            <Section title={t("team.exec.section.ranking")}>
              <TeamRanking ranking={dashboard?.ranking || []} onOpenMember={openMember} />
            </Section>

            {selectedMember ? (
              <Section title={t("team.memberProspects")}>
                <div className="client-table-card">
                  <div className="admin-page-head" style={{ marginBottom: 8 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedMember(null)}>
                      {t("common.cancel")}
                    </button>
                  </div>
                  {memberProspects.length === 0 ? (
                    <div className="admin-empty">{t("team.noProspects")}</div>
                  ) : (
                    <table className="client-table">
                      <thead>
                        <tr>
                          <th>{t("team.col.name")}</th>
                          <th>{t("team.exec.code")}</th>
                          <th>{t("team.exec.tour")}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {memberProspects.map((p) => (
                          <tr key={p.id}>
                            <td>{p.name || p.name1 || "—"}</td>
                            <td>{p.prospect_code || "—"}</td>
                            <td>{p.tour_date || "—"}</td>
                            <td>
                              <Link className="btn btn-ghost btn-sm" to={`/clients/${p.id}`}>
                                {t("team.open")}
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Section>
            ) : null}

            <div className="team-exec-grid-2">
              <Section title={t("team.exec.section.activity")}>
                <div className="dash-data-card">
                  <TeamActivityFeed activity={dashboard?.activity || []} />
                </div>
              </Section>
              <Section title={t("team.recentProspects")}>
                <div className="client-table-card">
                  {(dashboard?.recent_prospects || []).length === 0 ? (
                    <div className="admin-empty">{t("team.noProspects")}</div>
                  ) : (
                    <table className="client-table">
                      <thead>
                        <tr>
                          <th>{t("team.col.owner")}</th>
                          <th>{t("team.col.name")}</th>
                          <th>{t("team.exec.tour")}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {(dashboard?.recent_prospects || []).slice(0, 12).map((p) => (
                          <tr key={p.id}>
                            <td>{p.owner_name || "—"}</td>
                            <td>{p.name || "—"}</td>
                            <td>{p.tour_date || "—"}</td>
                            <td>
                              <Link className="btn btn-ghost btn-sm" to={`/clients/${p.id}`}>
                                {t("team.open")}
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Section>
            </div>
          </>
        )}
      </div>
    </>
  );
}
