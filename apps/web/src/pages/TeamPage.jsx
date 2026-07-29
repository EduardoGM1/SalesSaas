import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Users } from "lucide-react";
import { BuscadorUsuario } from "@/components/admin/buscador-usuario.jsx";
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
  const [prospectsModalOpen, setProspectsModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [prospects, setProspects] = useState([]);
  const [prospectsLoading, setProspectsLoading] = useState(false);
  const [inviteUser, setInviteUser] = useState(null);
  const [invitePending, setInvitePending] = useState(false);
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
    setProspectsModalOpen(true);
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
    setProspectsModalOpen(open);
    if (!open) {
      setSelectedId("");
      setProspects([]);
    }
  };

  const openInviteModal = () => {
    setInviteUser(null);
    setInviteErr("");
    setInviteModalOpen(true);
  };

  const closeInviteModal = (open) => {
    setInviteModalOpen(open);
    if (!open) {
      setInviteUser(null);
      setInviteErr("");
    }
  };

  const invite = async (event) => {
    event.preventDefault();
    if (!inviteUser?.id) {
      setInviteErr(t("team.invitePickUser"));
      return;
    }
    setInvitePending(true);
    setInviteErr("");
    try {
      const result = await api("/workspace/invite", {
        method: "POST",
        body: JSON.stringify({ usuario_id: inviteUser.id, email: inviteUser.email }),
      });
      if (result?.already_member) {
        toast.info(t("team.inviteAlready"));
      } else {
        toast.success(t("team.inviteOk"));
        closeInviteModal(false);
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
          <div className="team-section-head team-section-head--split">
            <div className="team-section-head-main">
              <Users size={16} aria-hidden />
              <h2 className="section-label team-section-title">{t("team.membersTitle")}</h2>
            </div>
            <button type="button" className="btn btn-primary btn-sm team-add-vendor" onClick={openInviteModal}>
              {t("team.addVendor")}
            </button>
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
        open={inviteModalOpen}
        onOpenChange={closeInviteModal}
        title={t("team.inviteTitle")}
        maxWidth={520}
      >
        <form onSubmit={invite}>
          <BuscadorUsuario
            searchPath="workspace/invite/search"
            value={inviteUser}
            onChange={setInviteUser}
            placeholder={t("team.inviteSearchPlaceholder")}
            disabled={invitePending}
            inputId="team-invite-user"
          />
          <p className="team-hint team-hint--modal">{t("team.inviteHint")}</p>
          {inviteErr ? <div className="auth-error team-feedback">{inviteErr}</div> : null}
          <div className="btn-row team-modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => closeInviteModal(false)} disabled={invitePending}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={invitePending || !inviteUser?.id}>
              {invitePending ? t("team.inviting") : t("team.inviteBtn")}
            </button>
          </div>
        </form>
      </SalesModal>

      <SalesModal
        open={prospectsModalOpen}
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
