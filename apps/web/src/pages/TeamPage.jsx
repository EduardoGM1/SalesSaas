import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Users } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { useWorkspace } from "@/hooks/use-workspace.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";

async function api(path, options = {}) {
  const res = await fetch(`/api/v1${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Error");
  return body.data ?? body;
}

function memberLabel(m) {
  return m.full_name?.trim() || m.email || m.id;
}

export function TeamPage() {
  const { t } = useI18n();
  const { ready, active } = useWorkspace();
  const canManage = ready
    && active?.tipo === "sala_de_venta"
    && active?.rol_en_workspace === "gerente";

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [prospects, setProspects] = useState([]);
  const [prospectsLoading, setProspectsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [invitePending, setInvitePending] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteErr, setInviteErr] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await api("/workspace/team");
      setMembers(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("team.error"));
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!canManage) return;
    refresh();
  }, [canManage, refresh]);

  const loadProspects = useCallback(async (memberId) => {
    setSelectedId(memberId || "");
    setProspectsLoading(true);
    try {
      const qs = memberId ? `?member_id=${encodeURIComponent(memberId)}` : "";
      const payload = await api(`/workspace/team/prospects${qs}`);
      setProspects(Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("team.error"));
      setProspects([]);
    } finally {
      setProspectsLoading(false);
    }
  }, [t]);

  const invite = async (e) => {
    e.preventDefault();
    setInvitePending(true);
    setInviteErr("");
    setInviteMsg("");
    try {
      const result = await api("/workspace/invite", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (result?.already_member) {
        setInviteMsg(t("team.inviteAlready"));
      } else {
        setInviteMsg(t("team.inviteOk"));
        setEmail("");
        await refresh();
      }
    } catch (err) {
      setInviteErr(err instanceof Error ? err.message : t("team.inviteError"));
    } finally {
      setInvitePending(false);
    }
  };

  const selectedLabel = useMemo(() => {
    if (!selectedId) return t("team.allProspects");
    const m = members.find((x) => x.id === selectedId);
    return m ? memberLabel(m) : selectedId;
  }, [selectedId, members, t]);

  if (ready && !canManage) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <Topbar title={t("team.title")} subtitle={active?.nombre || t("team.subtitle")} />
      <div className="sales-page">
        <header className="exp-page-head" style={{ marginBottom: 16 }}>
          <div className="exp-page-meta">
            <h1 className="exp-page-title">{t("team.title")}</h1>
            <p className="exp-page-sub">{t("team.subtitle")}</p>
          </div>
        </header>

        {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="client-table-card" style={{ marginBottom: 20 }}>
          <h2 className="section-label">{t("team.inviteTitle")}</h2>
          <form onSubmit={invite} style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 16 }}>
            <input
              className="admin-role-select"
              style={{ flex: "1 1 220px" }}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("team.invitePlaceholder")}
              required
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={invitePending}>
              {invitePending ? t("team.inviting") : t("team.inviteBtn")}
            </button>
          </form>
          {inviteMsg && <p className="admin-cell-muted" style={{ padding: "0 16px 12px" }}>{inviteMsg}</p>}
          {inviteErr && <div className="auth-error" style={{ margin: "0 16px 12px" }}>{inviteErr}</div>}
          <p className="admin-cell-muted" style={{ padding: "0 16px 16px", fontSize: 13 }}>
            {t("team.inviteHint")}
          </p>
        </div>

        <div className="client-table-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px 0" }}>
            <Users size={16} />
            <h2 className="section-label" style={{ margin: 0 }}>{t("team.membersTitle")}</h2>
          </div>
          {loading ? (
            <p style={{ padding: 16 }}>{t("common.loading")}</p>
          ) : (
            <table className="client-table admin-users-table">
              <thead>
                <tr>
                  <th>{t("team.col.name")}</th>
                  <th>{t("team.col.email")}</th>
                  <th>{t("team.col.role")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="admin-cell-name">{memberLabel(m)}</td>
                    <td className="admin-cell-muted">{m.email || "—"}</td>
                    <td>{m.rol_en_workspace === "gerente" ? t("team.role.gerente") : t("team.role.vendedor")}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => loadProspects(m.id)}
                      >
                        {t("team.viewProspects")}
                      </button>
                    </td>
                  </tr>
                ))}
                {!members.length && (
                  <tr><td colSpan={4} className="admin-empty">{t("team.emptyMembers")}</td></tr>
                )}
              </tbody>
            </table>
          )}
          <div style={{ padding: 12 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadProspects("")}>
              {t("team.viewAllProspects")}
            </button>
          </div>
        </div>

        {(selectedId || prospects.length > 0 || prospectsLoading) && (
          <div className="client-table-card">
            <h2 className="section-label">{t("team.prospectsOf", { name: selectedLabel })}</h2>
            {prospectsLoading ? (
              <p style={{ padding: 16 }}>{t("common.loading")}</p>
            ) : (
              <table className="client-table admin-users-table">
                <thead>
                  <tr>
                    <th>{t("team.col.prospect")}</th>
                    <th>{t("team.col.code")}</th>
                    <th>{t("team.col.status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {prospects.map((p) => {
                    const name = p.name1 || p.name || p.name2 || "—";
                    return (
                      <tr key={p.id}>
                        <td className="admin-cell-name">{name}</td>
                        <td className="admin-cell-muted">{p.prospect_code || "—"}</td>
                        <td>{p.status || "—"}</td>
                        <td>
                          <Link className="admin-row-link" to={`/clients/${p.id}`}>
                            {t("team.open")}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {!prospects.length && (
                    <tr><td colSpan={4} className="admin-empty">{t("team.emptyProspects")}</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </>
  );
}
