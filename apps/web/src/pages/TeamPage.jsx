import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
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

export function TeamPage() {
  const { t } = useI18n();
  const { fmtN } = useMoney();
  const { can, profile } = useUserPermissions();
  const [members, setMembers] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberProspects, setMemberProspects] = useState([]);
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const canTeam = can("dashboard:ver_equipo") || can("expedientes:ver_equipo");
  const teamIds = Array.isArray(profile?.team_member_ids) ? profile.team_member_ids : [];

  useEffect(() => {
    if (!isSupabaseConfigured() || !canTeam) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api("/team/members"),
      api(`/team/dashboard?year=${year}&month=${month}`),
    ])
      .then(([mem, dash]) => {
        if (cancelled) return;
        setMembers(Array.isArray(mem) ? mem : []);
        setDashboard(dash || null);
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

  const totals = dashboard?.totals || { vol: 0, ventas: 0, tours: 0, prospects: 0 };

  return (
    <>
      <Topbar title={t("team.title")} subtitle={t("team.subtitle")} />
      <div className="sales-page">
        <div className="page-toolbar"><PageBack inline /></div>
        {loading ? (
          <div className="dp-empty">{t("common.loading")}</div>
        ) : (
          <>
            <div className="dash-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 20 }}>
              <div className="dash-data-card">
                <div className="admin-sub">{t("team.kpi.vol")}</div>
                <div className="admin-h1" style={{ fontSize: 22 }}>{fmtN(totals.vol)}</div>
              </div>
              <div className="dash-data-card">
                <div className="admin-sub">{t("team.kpi.sales")}</div>
                <div className="admin-h1" style={{ fontSize: 22 }}>{fmtN(totals.ventas)}</div>
              </div>
              <div className="dash-data-card">
                <div className="admin-sub">{t("team.kpi.tours")}</div>
                <div className="admin-h1" style={{ fontSize: 22 }}>{fmtN(totals.tours)}</div>
              </div>
              <div className="dash-data-card">
                <div className="admin-sub">{t("team.kpi.prospects")}</div>
                <div className="admin-h1" style={{ fontSize: 22 }}>{fmtN(totals.prospects)}</div>
              </div>
            </div>

            <h2 className="admin-h1" style={{ fontSize: 18, marginBottom: 8 }}>
              <Users size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
              {t("team.members")}
            </h2>
            <div className="client-table-card" style={{ marginBottom: 20 }}>
              {(dashboard?.sellers || members).length === 0 ? (
                <div className="admin-empty">{t("team.empty")}</div>
              ) : (
                <table className="client-table">
                  <thead>
                    <tr>
                      <th>{t("team.col.name")}</th>
                      <th>{t("team.kpi.vol")}</th>
                      <th>{t("team.kpi.sales")}</th>
                      <th>{t("team.kpi.tours")}</th>
                      <th>{t("team.kpi.prospects")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.sellers || members.map((m) => ({
                      user_id: m.id,
                      name: m.full_name || m.email,
                      vol: 0,
                      ventas: 0,
                      tours: 0,
                      prospects: 0,
                      is_self: false,
                    }))).map((s) => (
                      <tr key={s.user_id}>
                        <td>
                          {s.name}
                          {s.is_self ? ` (${t("team.self")})` : ""}
                        </td>
                        <td>{fmtN(s.vol || 0)}</td>
                        <td>{fmtN(s.ventas || 0)}</td>
                        <td>{fmtN(s.tours || 0)}</td>
                        <td>{fmtN(s.prospects || 0)}</td>
                        <td>
                          {!s.is_self && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openMember(s.user_id)}>
                              {t("team.viewProspects")}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {selectedMember ? (
              <div className="client-table-card">
                <div className="admin-page-head" style={{ marginBottom: 8 }}>
                  <h2 className="admin-h1" style={{ fontSize: 16 }}>{t("team.memberProspects")}</h2>
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
                        <th>Código</th>
                        <th>Tour</th>
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
            ) : null}

            {dashboard?.recent_prospects?.length ? (
              <div style={{ marginTop: 20 }}>
                <h2 className="admin-h1" style={{ fontSize: 16, marginBottom: 8 }}>{t("team.recentProspects")}</h2>
                <div className="client-table-card">
                  <table className="client-table">
                    <thead>
                      <tr>
                        <th>{t("team.col.owner")}</th>
                        <th>{t("team.col.name")}</th>
                        <th>Tour</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.recent_prospects.map((p) => (
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
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
