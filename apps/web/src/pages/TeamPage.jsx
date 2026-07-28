import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Users } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { SalesModal } from "@/components/ui/sales-modal";
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
  const [modalOpen, setModalOpen] = useState(false);
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

  const openProspectsModal = useCallback(async (memberId) => {
    setSelectedId(memberId || "");
    setModalOpen(true);
    setProspectsLoading(true);
    setProspects([]);
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

  const closeProspectsModal = (open) => {
    setModalOpen(open);
    if (!open) {
      setSelectedId("");
      setProspects([]);
    }
  };

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
      <Topbar title={t("team.title")} subtitle={t("team.subtitle")} />
      <div className="sales-page team-page">
        {error && <div className="auth-error team-page-error">{error}</div>}

        <section className="team-section">
          <h2 className="section-label team-section-title">{t("team.inviteTitle")}</h2>
          <form className="team-invite-form" onSubmit={invite}>
            <input
              className="team-invite-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("team.invitePlaceholder")}
              required
              autoComplete="email"
            />
            <button type="submit" className="btn btn-primary btn-sm team-invite-btn" disabled={invitePending}>
              {invitePending ? t("team.inviting") : t("team.inviteBtn")}
            </button>
          </form>
          {inviteMsg && <p className="team-feedback team-feedback--ok">{inviteMsg}</p>}
          {inviteErr && <div className="auth-error team-feedback">{inviteErr}</div>}
          <p className="team-hint">{t("team.inviteHint")}</p>
        </section>

        <section className="team-section">
          <div className="team-section-head">
            <Users size={16} aria-hidden />
            <h2 className="section-label team-section-title">{t("team.membersTitle")}</h2>
          </div>

          {loading ? (
            <p className="team-loading">{t("common.loading")}</p>
          ) : (
            <>
              <div className="team-members-desktop">
                <table className="client-table admin-users-table team-members-table">
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
                            onClick={() => openProspectsModal(m.id)}
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
              </div>

              <ul className="team-members-mobile">
                {members.map((m) => (
                  <li key={m.id} className="team-member-card">
                    <div className="team-member-card-main">
                      <div className="team-member-name">{memberLabel(m)}</div>
                      <div className="team-member-email">{m.email || "—"}</div>
                      <div className="team-member-role">
                        {m.rol_en_workspace === "gerente" ? t("team.role.gerente") : t("team.role.vendedor")}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm team-member-action"
                      onClick={() => openProspectsModal(m.id)}
                    >
                      {t("team.viewProspects")}
                    </button>
                  </li>
                ))}
                {!members.length && (
                  <li className="team-empty">{t("team.emptyMembers")}</li>
                )}
              </ul>
            </>
          )}

          <div className="team-section-foot">
            <button type="button" className="btn btn-ghost btn-sm team-view-all" onClick={() => openProspectsModal("")}>
              {t("team.viewAllProspects")}
            </button>
          </div>
        </section>
      </div>

      <SalesModal
        open={modalOpen}
        onOpenChange={closeProspectsModal}
        title={t("team.prospectsOf", { name: selectedLabel })}
        maxWidth={720}
      >
        {prospectsLoading ? (
          <p className="team-loading">{t("common.loading")}</p>
        ) : (
          <div className="team-prospects-modal">
            <ul className="team-prospects-list">
              {prospects.map((p) => {
                const name = p.name1 || p.name || p.name2 || "—";
                return (
                  <li key={p.id} className="team-prospect-row">
                    <div className="team-prospect-copy">
                      <div className="team-prospect-name">{name}</div>
                      <div className="team-prospect-meta">
                        <span>{p.prospect_code || "—"}</span>
                        <span>{p.status || "—"}</span>
                      </div>
                    </div>
                    <Link
                      className="btn btn-ghost btn-sm"
                      to={`/clients/${p.id}`}
                      onClick={() => closeProspectsModal(false)}
                    >
                      {t("team.open")}
                    </Link>
                  </li>
                );
              })}
              {!prospects.length && (
                <li className="team-empty">{t("team.emptyProspects")}</li>
              )}
            </ul>
          </div>
        )}
        <div className="btn-row team-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => closeProspectsModal(false)}>
            {t("common.cancel")}
          </button>
        </div>
      </SalesModal>
    </>
  );
}
