import { useEffect, useState } from "react";
import { Building2, Check, Plus, Trash2, Users } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { SalesModal } from "@/components/ui/sales-modal";
import { workspacesApi } from "@/lib/network-api.js";
import { networkApi } from "@/lib/network-api.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function displayName(user) {
  return user?.full_name?.trim() || user?.email?.split("@")[0] || "Usuario";
}

export function WorkspacesSettingsPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [members, setMembers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [createSalaOpen, setCreateSalaOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [salaName, setSalaName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] = useState("vendedor");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const data = await workspacesApi.list();
    setWorkspaces(Array.isArray(data?.workspaces) ? data.workspaces : []);
    setActiveId(data?.active_workspace_id || null);
    // Tras crear org (sin salas aún) la sesión no trae organizacion_id; conservar la local.
    setOrgId((prev) => data?.organizacion_id || prev || null);
  };

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        await refresh();
        const conn = await networkApi.listConnections("accepted");
        if (active) setContacts(conn.map((c) => c.peer).filter(Boolean));
      } catch (err) {
        toast.error(err.message || t("auth.login.errorGeneric"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId || !isSupabaseConfigured()) {
      setMembers([]);
      return;
    }
    let active = true;
    workspacesApi.listMembers(selectedId)
      .then((rows) => { if (active) setMembers(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (active) setMembers([]); });
    return () => { active = false; };
  }, [selectedId]);

  const selected = workspaces.find((w) => w.id === selectedId) || null;
  const salas = workspaces.filter((w) => w.tipo === "sala_de_ventas");
  const personal = workspaces.find((w) => w.tipo === "personal");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar title={t("workspaces.title")} subtitle={t("workspaces.offline")} />
        <div className="sales-page">
          <PageBack inline href="/settings" />
          <div className="ethic-box">{t("workspaces.offline")}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title={t("workspaces.title")} subtitle={t("workspaces.subtitle")} />
      <div className="sales-page">
        <div className="page-toolbar page-toolbar--between">
          <PageBack inline href="/settings" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!orgId && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreateOrgOpen(true)}>
                <Plus size={14} /> {t("workspaces.createOrg")}
              </button>
            )}
            {orgId && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateSalaOpen(true)}>
                <Plus size={14} /> {t("workspaces.createSala")}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="dp-empty">{t("common.loading")}</div>
        ) : (
          <>
            <div className="section-label">{t("workspaces.yourSpaces")}</div>
            <div className="client-table-card" style={{ marginBottom: 20 }}>
              <table className="client-table">
                <thead>
                  <tr>
                    <th>{t("workspaces.name")}</th>
                    <th>{t("workspaces.type")}</th>
                    <th>{t("workspaces.role")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {workspaces.map((w) => (
                    <tr
                      key={w.id}
                      className={selectedId === w.id ? "is-selected" : ""}
                      onClick={() => setSelectedId(w.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        {w.nombre}
                        {activeId === w.id && (
                          <span className="ps-pill" style={{ marginLeft: 8 }}>{t("workspaces.active")}</span>
                        )}
                      </td>
                      <td>{w.tipo === "personal" ? t("workspaces.typePersonal") : t("workspaces.typeSala")}</td>
                      <td>{w.my_role || "—"}</td>
                      <td className="client-actions">
                        {activeId !== w.id && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy}
                            onClick={async (e) => {
                              e.stopPropagation();
                              setBusy(true);
                              try {
                                await workspacesApi.setActive(w.id);
                                setActiveId(w.id);
                                toast.success(t("workspaces.activeDone"));
                              } catch (err) {
                                toast.error(err.message);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            <Check size={14} /> {t("workspaces.setActive")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selected && selected.tipo === "sala_de_ventas" && (
              <>
                <div className="page-toolbar page-toolbar--between" style={{ marginBottom: 8 }}>
                  <div className="section-label" style={{ margin: 0 }}>
                    <Users size={14} style={{ marginRight: 6 }} />
                    {t("workspaces.membersOf", { name: selected.nombre })}
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAddMemberOpen(true)}>
                    <Plus size={14} /> {t("workspaces.addMember")}
                  </button>
                </div>
                <div className="client-table-card">
                  {!members.length ? (
                    <div className="dp-empty">{t("workspaces.noMembers")}</div>
                  ) : (
                    <table className="client-table">
                      <thead>
                        <tr>
                          <th>{t("workspaces.member")}</th>
                          <th>{t("workspaces.role")}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m) => (
                          <tr key={`${m.workspace_id}-${m.usuario_id}`}>
                            <td>{displayName(m.profile)}</td>
                            <td>{m.rol_en_workspace}</td>
                            <td className="client-actions">
                              {m.usuario_id !== personal?.owner_id && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  disabled={busy}
                                  onClick={async () => {
                                    if (!window.confirm(t("workspaces.removeMemberConfirm"))) return;
                                    setBusy(true);
                                    try {
                                      await workspacesApi.removeMember(selected.id, m.usuario_id);
                                      setMembers((prev) => prev.filter((x) => x.usuario_id !== m.usuario_id));
                                      toast.success(t("workspaces.removeMemberDone"));
                                    } catch (err) {
                                      toast.error(err.message);
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {!orgId && (
              <div className="ethic-box" style={{ marginTop: 16 }}>
                <Building2 size={16} style={{ marginRight: 8 }} />
                {t("workspaces.orgHint")}
              </div>
            )}
            {orgId && !salas.length && (
              <div className="ethic-box" style={{ marginTop: 16 }}>{t("workspaces.salaHint")}</div>
            )}
          </>
        )}
      </div>

      <SalesModal open={createOrgOpen} onOpenChange={setCreateOrgOpen} title={t("workspaces.createOrg")} maxWidth={420}>
        <label className="field-label">{t("workspaces.orgName")}</label>
        <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={t("workspaces.orgNamePh")} />
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={() => setCreateOrgOpen(false)}>{t("common.cancel")}</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || orgName.trim().length < 2}
            onClick={async () => {
              setBusy(true);
              try {
                const org = await workspacesApi.createOrg(orgName.trim());
                setOrgId(org.id);
                setCreateOrgOpen(false);
                setOrgName("");
                toast.success(t("workspaces.orgCreated"));
                await refresh();
              } catch (err) {
                toast.error(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("common.save")}
          </button>
        </div>
      </SalesModal>

      <SalesModal open={createSalaOpen} onOpenChange={setCreateSalaOpen} title={t("workspaces.createSala")} maxWidth={420}>
        <label className="field-label">{t("workspaces.salaName")}</label>
        <input value={salaName} onChange={(e) => setSalaName(e.target.value)} placeholder={t("workspaces.salaNamePh")} />
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={() => setCreateSalaOpen(false)}>{t("common.cancel")}</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !salaName.trim() || !orgId}
            onClick={async () => {
              setBusy(true);
              try {
                const sala = await workspacesApi.createSala(salaName.trim(), orgId);
                setCreateSalaOpen(false);
                setSalaName("");
                setSelectedId(sala.id);
                toast.success(t("workspaces.salaCreated"));
                await refresh();
              } catch (err) {
                toast.error(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("common.save")}
          </button>
        </div>
      </SalesModal>

      <SalesModal open={addMemberOpen} onOpenChange={setAddMemberOpen} title={t("workspaces.addMember")} maxWidth={420}>
        <div className="prospect-field full" style={{ marginBottom: 12 }}>
          <label>{t("network.shareWith")}</label>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">{t("network.selectContact")}</option>
            {contacts
              .filter((c) => !members.some((m) => m.usuario_id === c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>{displayName(c)}</option>
              ))}
          </select>
        </div>
        <div className="prospect-field full" style={{ marginBottom: 12 }}>
          <label>{t("workspaces.role")}</label>
          <select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
            <option value="vendedor">vendedor</option>
            <option value="gerente">gerente</option>
            <option value="admin_sala">admin_sala</option>
          </select>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={() => setAddMemberOpen(false)}>{t("common.cancel")}</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !memberId || !selectedId}
            onClick={async () => {
              setBusy(true);
              try {
                await workspacesApi.addMember(selectedId, memberId, memberRole);
                setAddMemberOpen(false);
                setMemberId("");
                toast.success(t("workspaces.memberAdded"));
                const rows = await workspacesApi.listMembers(selectedId);
                setMembers(Array.isArray(rows) ? rows : []);
              } catch (err) {
                toast.error(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("workspaces.addMember")}
          </button>
        </div>
      </SalesModal>
    </>
  );
}
