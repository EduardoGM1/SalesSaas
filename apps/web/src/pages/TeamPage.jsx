import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Users } from "lucide-react";
import { BuscadorUsuario } from "@/components/admin/buscador-usuario.jsx";
import { DelegacionChecklist } from "@/components/admin/delegacion-checklist.jsx";
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
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [prospectsModalOpen, setProspectsModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [extrasModalOpen, setExtrasModalOpen] = useState(false);
  const [extrasMember, setExtrasMember] = useState(null);
  const [extrasCeiling, setExtrasCeiling] = useState([]);
  const [extrasOverrides, setExtrasOverrides] = useState([]);
  const [extrasLoading, setExtrasLoading] = useState(false);
  const [roleSavingId, setRoleSavingId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [prospects, setProspects] = useState([]);
  const [prospectsLoading, setProspectsLoading] = useState(false);
  const [inviteUser, setInviteUser] = useState(null);
  const [invitePending, setInvitePending] = useState(false);
  const [inviteErr, setInviteErr] = useState("");
  const [delegModalOpen, setDelegModalOpen] = useState(false);
  const [delegMember, setDelegMember] = useState(null);
  const [delegCeiling, setDelegCeiling] = useState([]);
  const [delegSelected, setDelegSelected] = useState([]);
  const [delegLoading, setDelegLoading] = useState(false);
  const [delegSaving, setDelegSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, roleRows] = await Promise.all([
        api("/workspace/team"),
        api("/workspace/team/roles"),
      ]);
      setMembers(Array.isArray(rows) ? rows : []);
      setRoles(Array.isArray(roleRows) ? roleRows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("team.error"));
      setMembers([]);
      setRoles([]);
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

  const openDelegacion = async (member) => {
    setDelegMember(member);
    setDelegModalOpen(true);
    setDelegLoading(true);
    setDelegCeiling([]);
    setDelegSelected([]);
    try {
      const [ceiling, keys] = await Promise.all([
        api("/workspace/team/delegacion/techo"),
        api(`/workspace/team/delegacion?asistente_id=${encodeURIComponent(member.id)}`),
      ]);
      setDelegCeiling(Array.isArray(ceiling) ? ceiling : []);
      setDelegSelected(Array.isArray(keys) ? keys : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("team.error"));
      setDelegModalOpen(false);
      setDelegMember(null);
    } finally {
      setDelegLoading(false);
    }
  };

  const saveDelegacion = async () => {
    if (!delegMember) return;
    setDelegSaving(true);
    try {
      await api("/workspace/team/delegacion", {
        method: "PUT",
        body: JSON.stringify({
          asistente_id: delegMember.id,
          permiso_keys: delegSelected,
        }),
      });
      toast.success("Permisos delegados actualizados");
      setDelegModalOpen(false);
      setDelegMember(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("team.error"));
    } finally {
      setDelegSaving(false);
    }
  };

  const changeRole = async (memberId, roleId) => {
    if (!roleId) return;
    setRoleSavingId(memberId);
    try {
      await api(`/workspace/team/members/${memberId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role_id: roleId }),
      });
      toast.success(t("team.roleUpdated"));
      await refresh();
      const role = roles.find((r) => r.id === roleId);
      const member = members.find((m) => m.id === memberId);
      if (role?.slug === "asistente_sala" && member) {
        await openDelegacion({ ...member, id: memberId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("team.roleUpdateError"));
    } finally {
      setRoleSavingId("");
    }
  };

  const openExtrasModal = async (member) => {
    setExtrasMember(member);
    setExtrasModalOpen(true);
    setExtrasLoading(true);
    setExtrasCeiling([]);
    setExtrasOverrides([]);
    try {
      const payload = await api(`/workspace/team/members/${member.id}/overrides`);
      setExtrasCeiling(Array.isArray(payload?.ceiling_keys) ? payload.ceiling_keys : []);
      setExtrasOverrides(Array.isArray(payload?.overrides) ? payload.overrides.map((o) => o.clave) : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("team.error"));
      setExtrasModalOpen(false);
      setExtrasMember(null);
    } finally {
      setExtrasLoading(false);
    }
  };

  const closeExtrasModal = (open) => {
    setExtrasModalOpen(open);
    if (!open) {
      setExtrasMember(null);
      setExtrasCeiling([]);
      setExtrasOverrides([]);
    }
  };

  const toggleExtra = async (clave) => {
    if (!extrasMember) return;
    const has = extrasOverrides.includes(clave);
    try {
      if (has) {
        await api(`/workspace/team/members/${extrasMember.id}/overrides/${encodeURIComponent(clave)}`, {
          method: "DELETE",
        });
        setExtrasOverrides((prev) => prev.filter((k) => k !== clave));
      } else {
        await api(`/workspace/team/members/${extrasMember.id}/overrides`, {
          method: "PUT",
          body: JSON.stringify({ clave, otorgado: true }),
        });
        setExtrasOverrides((prev) => [...prev, clave]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("team.extrasError"));
    }
  };

  const selectedLabel = useMemo(() => {
    if (!selectedId) return t("team.allProspects");
    const m = members.find((x) => x.id === selectedId);
    return m ? memberLabel(m) : selectedId;
  }, [selectedId, members, t]);

  const roleLabel = (m) => m.role_nombre
    || (m.rol_en_workspace === "gerente" ? t("team.role.gerente") : t("team.role.vendedor"));

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
                        <td>
                          <select
                            className="team-role-select"
                            value={m.role_id || ""}
                            disabled={roleSavingId === m.id || !roles.length}
                            onChange={(e) => changeRole(m.id, e.target.value)}
                            aria-label={t("team.col.role")}
                          >
                            {!m.role_id && (
                              <option value="">{roleLabel(m)}</option>
                            )}
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>{r.nombre}</option>
                            ))}
                          </select>
                        </td>
                        <td className="team-member-actions">
                          {roles.find((r) => r.id === m.role_id)?.slug === "asistente_sala" ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openDelegacion(m)}
                            >
                              Delegar
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openExtrasModal(m)}
                            >
                              {t("team.extras")}
                            </button>
                          )}
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
                      <select
                        className="team-role-select"
                        value={m.role_id || ""}
                        disabled={roleSavingId === m.id || !roles.length}
                        onChange={(e) => changeRole(m.id, e.target.value)}
                        aria-label={t("team.col.role")}
                      >
                        {!m.role_id && (
                          <option value="">{roleLabel(m)}</option>
                        )}
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="team-member-actions">
                      {roles.find((r) => r.id === m.role_id)?.slug === "asistente_sala" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => openDelegacion(m)}
                        >
                          Delegar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => openExtrasModal(m)}
                        >
                          {t("team.extras")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm team-member-action"
                        onClick={() => openProspectsModal(m.id)}
                      >
                        {t("team.viewProspects")}
                      </button>
                    </div>
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
        open={extrasModalOpen}
        onOpenChange={closeExtrasModal}
        title={t("team.extrasTitle", { name: extrasMember ? memberLabel(extrasMember) : "" })}
        maxWidth={520}
      >
        <p className="team-hint team-hint--modal">{t("team.extrasHint")}</p>
        {extrasLoading ? (
          <p className="team-loading">{t("common.loading")}</p>
        ) : (
          <ul className="team-extras-list">
            {extrasCeiling.map((clave) => (
              <li key={clave}>
                <label className="team-extra-item">
                  <input
                    type="checkbox"
                    checked={extrasOverrides.includes(clave)}
                    onChange={() => toggleExtra(clave)}
                  />
                  <span>{clave}</span>
                </label>
              </li>
            ))}
            {!extrasCeiling.length && (
              <li className="team-empty">{t("team.extrasEmpty")}</li>
            )}
          </ul>
        )}
        <div className="btn-row team-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => closeExtrasModal(false)}>
            {t("common.cancel")}
          </button>
        </div>
      </SalesModal>

      <SalesModal
        open={delegModalOpen}
        onOpenChange={(open) => {
          setDelegModalOpen(open);
          if (!open) setDelegMember(null);
        }}
        title={`Delegar permisos — ${delegMember ? memberLabel(delegMember) : ""}`}
        maxWidth={520}
      >
        <p className="team-hint team-hint--modal">
          Solo puedes marcar permisos que tú ya tienes. El Asistente de Sala no recibe ningún otro acceso.
        </p>
        <DelegacionChecklist
          ceiling={delegCeiling}
          selected={delegSelected}
          onChange={setDelegSelected}
          loading={delegLoading}
        />
        <div className="btn-row team-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setDelegModalOpen(false)} disabled={delegSaving}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={saveDelegacion} disabled={delegSaving || delegLoading}>
            {delegSaving ? t("common.loading") : "Guardar delegación"}
          </button>
        </div>
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
