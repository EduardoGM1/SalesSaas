import { useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { Boxes, Building2, Image, ListChecks, ScrollText, Settings2, ShieldCheck, UsersRound } from "lucide-react";
import {
  AdminCard,
  AdminDataView,
  AdminEmptyState,
  AdminPageHeader,
  AdminPageState,
  AdminStatusBadge,
  AdminSubNav,
  AdminTimeline,
} from "@/components/admin/admin-ui.jsx";
import { AdminOverflowMenu } from "@/components/admin/admin-overflow-menu.jsx";
import { BuscadorUsuario } from "@/components/admin/buscador-usuario.jsx";
import { TenantCompanyAdministration } from "@/components/admin/tenant-company-administration.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { adminJson } from "@/lib/admin/api.js";
import { narrateAdminLogSummary } from "@/lib/admin/log-narrative.js";
import { compressSupportScreenshot } from "@/lib/support-image.js";
import { toast } from "@/lib/toast";

const SECTIONS = ["summary", "rooms", "members", "access", "branding", "settings", "plans", "logs"];

function entityColors(entity) {
  const colors = entity?.colores_marca || {};
  return {
    primary: colors.primary || colors.primario || "#1e5eff",
    accent: colors.accent || colors.acento || "#0f2044",
  };
}

function entityMembers(room) {
  const rows = room?.workspace_miembros || room?.miembros;
  return Array.isArray(rows) ? rows : [];
}

export function AdminEmpresasPage() {
  const { t } = useI18n();
  const session = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get("section") || "summary";
  const section = SECTIONS.includes(sectionParam) ? sectionParam : "summary";
  const [reloadKey, setReloadKey] = useState(0);
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [salaForm, setSalaForm] = useState({ empresa_id: "", nombre: "", gerente: null });
  const [brandForm, setBrandForm] = useState({ id: "", tipo: "empresa", primary: "#1e5eff", accent: "#0f2044", logo_url: "" });
  const [membersSalaId, setMembersSalaId] = useState("");
  const [addMemberUser, setAddMemberUser] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [logoPending, setLogoPending] = useState(false);
  const [logoPreviewBroken, setLogoPreviewBroken] = useState(false);

  const { loading, data: empresas, error: loadErr } = useAdminFetch(session?.isSuperAdmin ? "empresas" : "", `?_=${reloadKey}`);
  const { data: salas } = useAdminFetch(session?.isSuperAdmin ? "salas" : "", `?_=${reloadKey}`);
  const { data: usersData } = useAdminFetch(session?.isSuperAdmin ? "users" : "");
  const { data: logsData } = useAdminFetch(session?.isSuperAdmin && section === "logs" ? "logs" : "", "?");
  const users = useMemo(() => {
    if (Array.isArray(usersData)) return usersData;
    return Array.isArray(usersData?.users) ? usersData.users : [];
  }, [usersData]);
  const list = Array.isArray(empresas) ? empresas : [];
  const salasList = Array.isArray(salas) ? salas : [];
  const membersSala = salasList.find((room) => room.id === membersSalaId) || null;
  const membersEmpresaId = membersSala?.empresa_id || "";
  const refresh = () => setReloadKey((key) => key + 1);

  const loadMembers = async (salaId) => {
    if (!salaId) return setMembers([]);
    setMembersLoading(true);
    try {
      const rows = await adminJson(`salas/${salaId}/members`);
      setMembers(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.empresas.error"));
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    if (membersSalaId) void loadMembers(membersSalaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersSalaId, reloadKey]);

  const runMutation = async (work) => {
    setPending(true);
    setError("");
    try {
      await work();
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.empresas.error"));
    } finally {
      setPending(false);
    }
  };

  const createEmpresa = (event) => {
    event.preventDefault();
    void runMutation(async () => {
      await adminJson("empresas", { method: "POST", body: { nombre: empresaNombre } });
      setEmpresaNombre("");
    });
  };

  const createSala = (event) => {
    event.preventDefault();
    if (!salaForm.gerente?.id) {
      toast.error("Selecciona al gerente desde la lista de sugerencias.");
      return;
    }
    void runMutation(async () => {
      await adminJson("salas", {
        method: "POST",
        body: { empresa_id: salaForm.empresa_id, nombre: salaForm.nombre, gerente_id: salaForm.gerente.id },
      });
      setSalaForm({ empresa_id: "", nombre: "", gerente: null });
    });
  };

  const chooseBrandTarget = (id) => {
    const source = (brandForm.tipo === "sala" ? salasList : list).find((item) => item.id === id);
    const colors = entityColors(source);
    setLogoPreviewBroken(false);
    setBrandForm((current) => ({
      ...current,
      id,
      primary: colors.primary,
      accent: colors.accent,
      logo_url: source?.logo_url || "",
    }));
  };

  const saveBrand = (event) => {
    event.preventDefault();
    void runMutation(async () => {
      const path = brandForm.tipo === "sala" ? `salas/${brandForm.id}` : `empresas/${brandForm.id}`;
      const updated = await adminJson(path, {
        method: "PATCH",
        body: {
          logo_url: brandForm.logo_url || null,
          colores_marca: { primary: brandForm.primary, accent: brandForm.accent },
        },
      });
      setBrandForm((current) => ({ ...current, logo_url: updated?.logo_url || current.logo_url }));
      setLogoPreviewBroken(false);
      toast.success(t("common.save"));
    });
  };

  const uploadLogo = async (file) => {
    if (!file || !brandForm.id) return;
    setLogoPending(true);
    setError("");
    try {
      const compressed = await compressSupportScreenshot(file);
      const updated = await adminJson("branding/logo", {
        method: "POST",
        body: { tipo: brandForm.tipo, id: brandForm.id, data_url: compressed.dataUrl },
      });
      setBrandForm((current) => ({ ...current, logo_url: updated?.logo_url || current.logo_url }));
      setLogoPreviewBroken(false);
      refresh();
      toast.success(t("admin.empresas.logoUpload"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.empresas.error"));
    } finally {
      setLogoPending(false);
    }
  };

  const addMember = (event) => {
    event.preventDefault();
    if (!membersSalaId || !addMemberUser?.id) {
      toast.error("Selecciona al miembro desde la lista de sugerencias.");
      return;
    }
    void runMutation(async () => {
      await adminJson(`salas/${membersSalaId}/members`, {
        method: "POST",
        body: { usuario_id: addMemberUser.id, rol_en_workspace: "vendedor" },
      });
      setAddMemberUser(null);
      await loadMembers(membersSalaId);
    });
  };

  const makeGerente = (usuarioId) => runMutation(async () => {
    await adminJson(`salas/${membersSalaId}/gerente`, { method: "POST", body: { usuario_id: usuarioId } });
    await loadMembers(membersSalaId);
  });

  const removeMember = (usuarioId) => runMutation(async () => {
    await adminJson(`salas/${membersSalaId}/members/${usuarioId}`, { method: "DELETE" });
    await loadMembers(membersSalaId);
  });

  if (!session?.isSuperAdmin) return <TenantCompanyAdministration session={session} />;

  const selectSection = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === "summary") params.delete("section");
    else params.set("section", next);
    setSearchParams(params);
  };
  const selectMembersRoom = (roomId) => {
    setMembersSalaId(roomId);
    selectSection("members");
  };
  const selectBrand = (type, id) => {
    const source = (type === "sala" ? salasList : list).find((item) => item.id === id);
    const colors = entityColors(source);
    setBrandForm({ id, tipo: type, primary: colors.primary, accent: colors.accent, logo_url: source?.logo_url || "" });
    setLogoPreviewBroken(false);
    selectSection("branding");
  };
  const navItems = [
    { id: "summary", label: "Resumen", icon: Building2, count: list.length },
    { id: "rooms", label: "Salas", icon: ListChecks, count: salasList.length },
    { id: "members", label: "Miembros", icon: UsersRound },
    { id: "access", label: "Acceso", icon: Boxes },
    { id: "branding", label: "Branding", icon: Image },
    { id: "settings", label: "Configuración", icon: Settings2 },
    { id: "plans", label: "Planes", icon: ShieldCheck },
    { id: "logs", label: "Logs", icon: ScrollText },
  ];

  return (
    <div className="admin-page admin-companies-enterprise">
      <AdminPageHeader
        eyebrow="Organización"
        title={t("admin.empresas.title")}
        subtitle={t("admin.empresas.sub")}
        meta={<><span>{list.length} empresas</span><span>{salasList.length} salas</span></>}
      />
      <AdminSubNav items={navItems} activeId={section} onSelect={selectSection} ariaLabel="Secciones de empresas" />
      {error ? <div className="auth-error admin-company-error">{error}</div> : null}

      <AdminPageState loading={loading} error={loadErr}>
        {section === "summary" ? (
          <div className="admin-company-layout">
            <AdminCard title={t("admin.empresas.createEmpresa")} subtitle="Crea la organización antes de configurar salas y marca.">
              <form className="admin-inline-form" onSubmit={createEmpresa}>
                <label className="admin-form-field">
                  <span>Nombre</span>
                  <input className="auth-input" value={empresaNombre} onChange={(event) => setEmpresaNombre(event.target.value)} placeholder={t("admin.empresas.namePlaceholder")} required />
                </label>
                <button type="submit" className="btn btn-primary" disabled={pending}>{t("common.save")}</button>
              </form>
            </AdminCard>
            <div className="admin-company-cards">
              {list.map((company) => {
                const rooms = salasList.filter((room) => room.empresa_id === company.id);
                return (
                  <AdminCard
                    key={company.id}
                    className="admin-company-card"
                    action={<AdminOverflowMenu label={`Acciones de ${company.nombre}`} items={[
                      { id: "rooms", label: "Ver salas", onSelect: () => selectSection("rooms") },
                      { id: "brand", label: "Editar branding", onSelect: () => selectBrand("empresa", company.id) },
                    ]} />}
                  >
                    <div className="admin-company-card-head">
                      <div className="admin-company-logo" style={{ background: entityColors(company).primary }}>{company.logo_url ? <img src={company.logo_url} alt="" /> : company.nombre?.slice(0, 2).toUpperCase()}</div>
                      <div><h2>{company.nombre}</h2><span>{company.id}</span></div>
                    </div>
                    <div className="admin-company-facts">
                      <div><span>Estado</span><AdminStatusBadge tone={company.estado === "activo" ? "success" : "neutral"}>{company.estado || "Sin estado"}</AdminStatusBadge></div>
                      <div><span>Plan</span><strong>{company.plan_paquete || "Sin plan"}</strong></div>
                      <div><span>Salas</span><strong>{rooms.length}</strong></div>
                      <div><span>Creación</span><strong>{company.created_at ? new Date(company.created_at).toLocaleDateString() : "—"}</strong></div>
                    </div>
                  </AdminCard>
                );
              })}
              {!list.length ? <AdminEmptyState title={t("admin.empresas.empty")} body="Crea la primera empresa para comenzar." /> : null}
            </div>
          </div>
        ) : null}

        {section === "rooms" ? (
          <div className="admin-company-layout">
            <AdminCard title={t("admin.empresas.createSala")} subtitle="Asigna una empresa y un gerente responsable.">
              <form className="admin-room-form" onSubmit={createSala}>
                <select className="auth-input" value={salaForm.empresa_id} onChange={(event) => setSalaForm((current) => ({ ...current, empresa_id: event.target.value }))} required>
                  <option value="">{t("admin.empresas.pickEmpresa")}</option>
                  {list.map((company) => <option key={company.id} value={company.id}>{company.nombre}</option>)}
                </select>
                <input className="auth-input" value={salaForm.nombre} onChange={(event) => setSalaForm((current) => ({ ...current, nombre: event.target.value }))} placeholder={t("admin.empresas.salaName")} required />
                <BuscadorUsuario
                  empresaId={salaForm.empresa_id || null}
                  value={salaForm.gerente}
                  onChange={(user) => setSalaForm((current) => ({ ...current, gerente: user }))}
                  placeholder={t("admin.empresas.pickGerente")}
                  disabled={pending || !salaForm.empresa_id}
                />
                <button type="submit" className="btn btn-primary" disabled={pending}>{t("common.save")}</button>
              </form>
            </AdminCard>
            <div className="admin-room-cards">
              {salasList.map((room) => {
                const roomMembers = entityMembers(room);
                const manager = roomMembers.find((member) => member.rol_en_workspace === "gerente")
                  || users.find((user) => user.id === room.gerente_id);
                return (
                  <AdminCard key={room.id} className="admin-room-card" action={<AdminOverflowMenu label={`Acciones de ${room.nombre}`} items={[
                    { id: "members", label: "Gestionar miembros", onSelect: () => selectMembersRoom(room.id) },
                    { id: "brand", label: "Editar branding", onSelect: () => selectBrand("sala", room.id) },
                  ]} />}>
                    <div className="admin-room-card-title"><div><h2>{room.nombre}</h2><p>{list.find((company) => company.id === room.empresa_id)?.nombre || "Sin empresa"}</p></div><AdminStatusBadge tone={room.estado === "activo" ? "success" : "neutral"}>{room.estado || "Sin estado"}</AdminStatusBadge></div>
                    <div className="admin-room-facts">
                      <span><strong>Gerente</strong>{manager?.full_name || manager?.name || manager?.email || "No disponible"}</span>
                      <span><strong>Miembros</strong>{roomMembers.length || "—"}</span>
                      <span><strong>Creación</strong>{room.created_at ? new Date(room.created_at).toLocaleDateString() : "—"}</span>
                    </div>
                  </AdminCard>
                );
              })}
              {!salasList.length ? <AdminEmptyState title={t("admin.empresas.noSalas")} /> : null}
            </div>
          </div>
        ) : null}

        {section === "members" ? (
          <AdminCard title={t("admin.empresas.membersTitle")} subtitle="Selecciona una sala para administrar su equipo.">
            <div className="admin-members-toolbar">
              <select className="auth-input" value={membersSalaId} onChange={(event) => setMembersSalaId(event.target.value)}>
                <option value="">{t("admin.empresas.pickSalaMembers")}</option>
                {salasList.map((room) => <option key={room.id} value={room.id}>{room.nombre}</option>)}
              </select>
              {membersSalaId ? (
                <form onSubmit={addMember}>
                  <BuscadorUsuario
                    empresaId={membersEmpresaId || null}
                    value={addMemberUser}
                    onChange={setAddMemberUser}
                    placeholder={t("admin.empresas.addMember")}
                    disabled={pending || !membersEmpresaId}
                  />
                  <button type="submit" className="btn btn-primary" disabled={pending}>{t("admin.empresas.addMember")}</button>
                </form>
              ) : null}
            </div>
            <AdminPageState loading={membersLoading}>
              <AdminDataView empty={!membersSalaId || !members.length} emptyTitle={!membersSalaId ? "Selecciona una sala" : t("team.emptyMembers")} emptyBody={!membersSalaId ? "El equipo de la sala aparecerá aquí." : undefined}>
                <div className="admin-members-table-wrap">
                  <table className="client-table admin-company-members-table">
                    <thead><tr><th>{t("team.col.name")}</th><th>{t("team.col.email")}</th><th>{t("team.col.role")}</th><th>Acciones</th></tr></thead>
                    <tbody>{members.map((member) => (
                      <tr key={member.id}>
                        <td className="admin-cell-name" data-label={t("team.col.name")}>{member.full_name || member.email || member.id}</td>
                        <td className="admin-cell-muted" data-label={t("team.col.email")}>{member.email || "—"}</td>
                        <td data-label={t("team.col.role")}><AdminStatusBadge tone={member.rol_en_workspace === "gerente" ? "info" : "neutral"}>{member.rol_en_workspace === "gerente" ? t("team.role.gerente") : t("team.role.vendedor")}</AdminStatusBadge></td>
                        <td data-label="Acciones"><AdminOverflowMenu label={`Acciones de ${member.full_name || member.email}`} items={[
                          member.rol_en_workspace !== "gerente" ? { id: "manager", label: t("admin.empresas.makeGerente"), onSelect: () => makeGerente(member.id), disabled: pending } : null,
                          // No ofrecer quitar al gerente: la API exige otro gerente primero.
                          member.rol_en_workspace !== "gerente" ? { id: "remove", label: t("admin.empresas.removeMember"), onSelect: () => removeMember(member.id), danger: true, disabled: pending } : null,
                        ]} /></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </AdminDataView>
            </AdminPageState>
          </AdminCard>
        ) : null}

        {section === "access" ? (
          <TenantCompanyAdministration session={session} companies={list} embedded />
        ) : null}

        {section === "branding" ? (
          <div className="admin-branding-layout">
            <AdminCard title={t("admin.empresas.brandTitle")} subtitle="Configura una identidad por empresa o un override por sala.">
              <form className="admin-brand-form" onSubmit={saveBrand}>
                <label className="admin-form-field"><span>Tipo</span><select className="auth-input" value={brandForm.tipo} onChange={(event) => setBrandForm((current) => ({ ...current, tipo: event.target.value, id: "", logo_url: "" }))}><option value="empresa">{t("admin.empresas.brandEmpresa")}</option><option value="sala">{t("admin.empresas.brandSala")}</option></select></label>
                <label className="admin-form-field"><span>Destino</span><select className="auth-input" value={brandForm.id} onChange={(event) => chooseBrandTarget(event.target.value)} required><option value="">{t("admin.empresas.pickTarget")}</option>{(brandForm.tipo === "sala" ? salasList : list).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
                <div className="admin-color-fields">
                  <label><span>{t("admin.empresas.primary")}</span><input type="color" value={brandForm.primary} onChange={(event) => setBrandForm((current) => ({ ...current, primary: event.target.value }))} /></label>
                  <label><span>{t("admin.empresas.accent")}</span><input type="color" value={brandForm.accent} onChange={(event) => setBrandForm((current) => ({ ...current, accent: event.target.value }))} /></label>
                </div>
                <label className="admin-form-field"><span>Logo por URL</span><input className="auth-input" value={brandForm.logo_url} onChange={(event) => { setLogoPreviewBroken(false); setBrandForm((current) => ({ ...current, logo_url: event.target.value })); }} placeholder={t("admin.empresas.logoUrl")} /></label>
                <p className="admin-card-muted">{t("admin.empresas.logoHint")}</p>
                <div className="admin-brand-actions">
                  <label className="btn btn-ghost">
                    {logoPending ? t("admin.empresas.logoUploading") : t("admin.empresas.logoUpload")}
                    <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={logoPending || !brandForm.id} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadLogo(file); }} />
                  </label>
                  <button type="submit" className="btn btn-primary" disabled={pending || !brandForm.id}>{t("common.save")}</button>
                </div>
              </form>
            </AdminCard>
            <AdminCard title="Vista previa" subtitle="Representación aproximada de la marca en el workspace.">
              <div className="admin-brand-preview" style={{ "--brand-preview-primary": brandForm.primary, "--brand-preview-accent": brandForm.accent }}>
                <div className="admin-brand-preview-sidebar">
                  <div className="admin-brand-preview-logo">{brandForm.logo_url && !logoPreviewBroken ? <img src={brandForm.logo_url} alt="Vista previa del logo" referrerPolicy="no-referrer" onError={() => setLogoPreviewBroken(true)} /> : <span>SA</span>}</div>
                  <span /><span /><span />
                </div>
                <div className="admin-brand-preview-main"><div className="admin-brand-preview-bar" /><div className="admin-brand-preview-copy"><strong>Panel de ventas</strong><span>Tu marca aplicada al espacio de trabajo</span><button type="button">Acción principal</button></div></div>
              </div>
              {brandForm.logo_url && logoPreviewBroken ? <p className="auth-error">{t("admin.empresas.logoBroken")}</p> : null}
            </AdminCard>
          </div>
        ) : null}

        {section === "settings" ? (
          <div className="admin-settings-grid">
            <AdminCard title="Estructura de workspaces" subtitle="Configuración avanzada disponible en el modelo actual."><div className="admin-settings-list"><span>Empresas activas<strong>{list.filter((item) => item.estado === "activo").length}</strong></span><span>Salas activas<strong>{salasList.filter((item) => item.estado === "activo").length}</strong></span><span>Branding por sala<strong>{salasList.filter((item) => item.logo_url || item.colores_marca).length}</strong></span></div></AdminCard>
            <AdminCard title="Gobernanza" subtitle="Las reglas de acceso se conservan sin cambios."><div className="admin-settings-list"><span>Acceso al módulo<strong>Solo Superadmin</strong></span><span>Gerencia por sala<strong>Intercambio atómico</strong></span><span>Datos sensibles<strong>Protegidos por permisos</strong></span></div></AdminCard>
          </div>
        ) : null}

        {section === "plans" ? (
          <AdminCard title="Planes por empresa" subtitle="Lectura del paquete asociado actualmente; sin inventar acciones no soportadas.">
            <div className="admin-plan-cards">{list.map((company) => <article key={company.id}><div><strong>{company.nombre}</strong><span>{salasList.filter((room) => room.empresa_id === company.id).length} salas</span></div><AdminStatusBadge tone={company.plan_paquete ? "info" : "neutral"}>{company.plan_paquete || "Sin plan"}</AdminStatusBadge></article>)}</div>
            {!list.length ? <AdminEmptyState title={t("admin.empresas.empty")} /> : null}
          </AdminCard>
        ) : null}

        {section === "logs" ? (
          <AdminCard title="Actividad de empresas" subtitle="Eventos relacionados con las empresas y salas visibles en este módulo.">
            <AdminTimeline
              items={(Array.isArray(logsData?.items) ? logsData.items : []).filter((item) => {
                const id = String(item.entidad_id || "");
                return list.some((company) => String(company.id) === id) || salasList.some((room) => String(room.id) === id) || /empresa|sala|workspace/i.test(String(item.entidad_afectada || ""));
              }).slice(0, 20)}
              emptyTitle="Sin actividad relacionada"
              emptyBody="No hay eventos de empresas o salas en la bitácora disponible."
              renderItem={(item) => <><strong>{item.actor_nombre || "Sistema"} · {narrateAdminLogSummary(item.detalle, t)}</strong><time className="admin-timeline-time">{item.fecha ? new Date(item.fecha).toLocaleString() : "—"}</time></>}
            />
          </AdminCard>
        ) : null}
      </AdminPageState>
    </div>
  );
}
