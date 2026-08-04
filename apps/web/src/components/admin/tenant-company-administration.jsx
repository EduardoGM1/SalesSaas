import { useEffect, useMemo, useState } from "react";
import { Building2, Boxes, ShieldCheck, UsersRound } from "lucide-react";
import {
  AdminCard,
  AdminDataView,
  AdminEmptyState,
  AdminPageHeader,
  AdminPageState,
  AdminStatusBadge,
  AdminSubNav,
} from "@/components/admin/admin-ui.jsx";
import { AdminOverflowMenu } from "@/components/admin/admin-overflow-menu.jsx";
import { BuscadorUsuario } from "@/components/admin/buscador-usuario.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { adminJson } from "@/lib/admin/api.js";
import { compressSupportScreenshot } from "@/lib/support-image.js";
import { toast } from "@/lib/toast";

const TABS = [
  { id: "summary", label: "Resumen", icon: Building2 },
  { id: "rooms", label: "Salas y miembros", icon: UsersRound },
  { id: "admins", label: "Administradores", icon: ShieldCheck },
  { id: "roles", label: "Puestos", icon: UsersRound },
  { id: "packages", label: "Paquetes", icon: Boxes },
  { id: "branding", label: "Branding y plan", icon: Building2 },
];
const EMPTY_COMPANIES = [];

function companyOptionsFromContext(context) {
  return (context?.memberships || []).map((membership) => ({
    id: membership.empresa_id,
    nombre: membership.empresas?.nombre || membership.empresa_id,
    logo_url: membership.empresas?.logo_url || null,
    colores_marca: membership.empresas?.colores_marca || {},
    plan_paquete: membership.empresas?.plan_paquete || null,
  }));
}

function memberRows(room) {
  return Array.isArray(room?.workspace_miembros) ? room.workspace_miembros : [];
}

export function TenantCompanyAdministration({
  session,
  companies = EMPTY_COMPANIES,
  embedded = false,
  initialCompanyId = "",
  onCompanyChange,
}) {
  const { data: contextData } = useAdminFetch("tenant/context");
  const options = useMemo(() => (
    companies.length ? companies : companyOptionsFromContext(contextData)
  ), [companies, contextData]);
  const [companyId, setCompanyId] = useState(initialCompanyId || "");
  const selectedCompany = useMemo(
    () => options.find((company) => company.id === companyId),
    [companyId, options],
  );

  useEffect(() => {
    if (!initialCompanyId) return;
    if (!options.some((c) => c.id === initialCompanyId)) return;
    setCompanyId((prev) => (prev === initialCompanyId ? prev : initialCompanyId));
  }, [initialCompanyId, options]);

  const selectCompany = (nextId) => {
    setCompanyId(nextId);
    onCompanyChange?.(nextId);
  };
  const [tab, setTab] = useState("summary");
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({
    loading: false,
    error: "",
    overview: null,
    rooms: [],
    admins: [],
    roles: [],
    packages: [],
    flags: [],
    permissions: [],
  });
  const [roomForm, setRoomForm] = useState({ nombre: "", gerente: null });
  const [adminForm, setAdminForm] = useState({ usuario: null, role_id: "" });
  const [roleForm, setRoleForm] = useState({ nombre: "", scope: "workspace", flag_keys: [] });
  const [editingRole, setEditingRole] = useState(null);
  const [packageForm, setPackageForm] = useState({ nombre: "", descripcion: "", flag_keys: [] });
  const [memberForm, setMemberForm] = useState({ workspace_id: "", usuario: null, role_id: "" });
  const [brandForm, setBrandForm] = useState({ logo_url: "", primary: "#1e5eff", accent: "#0f2044", plan_paquete: "" });
  const [pending, setPending] = useState(false);
  const [logoPending, setLogoPending] = useState(false);
  const [logoPreviewBroken, setLogoPreviewBroken] = useState(false);

  useEffect(() => {
    if (companyId || !options[0]?.id) return;
    const first = options[0].id;
    setCompanyId(first);
    onCompanyChange?.(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo hidratar primera empresa
  }, [companyId, options]);

  useEffect(() => {
    if (!selectedCompany) return;
    const colors = selectedCompany.colores_marca || {};
    setBrandForm({
      logo_url: selectedCompany.logo_url || "",
      primary: colors.primary || "#1e5eff",
      accent: colors.accent || "#0f2044",
      plan_paquete: selectedCompany.plan_paquete || "",
    });
    setLogoPreviewBroken(false);
  }, [selectedCompany]);

  const uploadLogo = async (file) => {
    if (!file || !companyId) return;
    setLogoPending(true);
    try {
      const compressed = await compressSupportScreenshot(file);
      const updated = await adminJson(`tenant/empresas/${companyId}/branding/logo`, {
        method: "POST",
        body: { data_url: compressed.dataUrl },
      });
      setBrandForm((current) => ({ ...current, logo_url: updated?.logo_url || current.logo_url }));
      setLogoPreviewBroken(false);
      setReload((value) => value + 1);
      toast.success("Logo actualizado");
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "No se pudo subir el logo.",
      }));
    } finally {
      setLogoPending(false);
    }
  };

  useEffect(() => {
    if (!companyId) return undefined;
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: "" }));
    Promise.all([
      adminJson(`tenant/empresas/${companyId}/overview`),
      adminJson(`tenant/empresas/${companyId}/salas`),
      adminJson(`tenant/empresas/${companyId}/admins`),
      adminJson(`tenant/empresas/${companyId}/roles`),
      adminJson(`tenant/empresas/${companyId}/packages`),
      adminJson(`tenant/empresas/${companyId}/flags`),
      adminJson(`tenant/empresas/${companyId}/permissions`),
    ]).then(([overview, rooms, admins, roles, packages, flags, permissions]) => {
      if (cancelled) return;
      setState({
        loading: false,
        error: "",
        overview,
        rooms: Array.isArray(rooms) ? rooms : [],
        admins: Array.isArray(admins) ? admins : [],
        roles: Array.isArray(roles) ? roles : [],
        packages: Array.isArray(packages) ? packages : [],
        flags: Array.isArray(flags) ? flags : [],
        permissions: Array.isArray(permissions) ? permissions : [],
      });
    }).catch((error) => {
      if (!cancelled) setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "No fue posible cargar la empresa.",
      }));
    });
    return () => { cancelled = true; };
  }, [companyId, reload]);

  const mutate = async (work, success = "Cambios guardados") => {
    setPending(true);
    try {
      await work();
      setReload((value) => value + 1);
      toast.success(success);
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "No fue posible completar la operación.",
      }));
    } finally {
      setPending(false);
    }
  };

  const companyRoles = state.roles.filter((role) => role.scope === "empresa");
  const workspaceRoles = state.roles.filter((role) => role.scope === "workspace");

  if (!session?.isSuperAdmin && session?.scope !== "empresa") {
    return <AdminEmptyState title="Sin acceso empresarial" body="Tu alcance actual no permite administrar empresas." />;
  }

  const content = (
    <>
      <div className="admin-tenant-company-picker">
        <label className="admin-form-field">
          <span>Empresa activa</span>
          <select className="auth-input" value={companyId} onChange={(event) => selectCompany(event.target.value)}>
            {options.map((company) => <option key={company.id} value={company.id}>{company.nombre}</option>)}
          </select>
        </label>
        <AdminStatusBadge tone="info">{session?.isSuperAdmin ? "Super Admin" : "Admin Empresa"}</AdminStatusBadge>
      </div>
      <AdminSubNav items={TABS} activeId={tab} onSelect={setTab} ariaLabel="Administración de empresa" />
      {state.error ? <div className="auth-error">{state.error}</div> : null}
      <AdminPageState loading={state.loading}>
        {tab === "summary" ? (
          <div className="admin-overview-kpis">
            {[
              ["Salas", state.overview?.salas],
              ["Miembros", state.overview?.miembros],
              ["Expedientes", state.overview?.expedientes],
              ["Ventas", state.overview?.ventas],
            ].map(([label, value]) => (
              <AdminCard key={label}><span className="admin-card-muted">{label}</span><div className="admin-tenant-kpi">{value ?? 0}</div></AdminCard>
            ))}
          </div>
        ) : null}

        {tab === "rooms" ? (
          <div className="admin-company-layout">
            <AdminCard title="Crear Sala de Ventas" subtitle="El gerente debe ser un usuario registrado.">
              <form className="admin-inline-form" onSubmit={(event) => {
                event.preventDefault();
                if (!roomForm.gerente?.id) {
                  toast.error("Selecciona al gerente desde la lista de sugerencias.");
                  return;
                }
                void mutate(async () => {
                  await adminJson(`tenant/empresas/${companyId}/salas`, { method: "POST", body: { nombre: roomForm.nombre, gerente_id: roomForm.gerente.id } });
                  setRoomForm({ nombre: "", gerente: null });
                }, "Sala creada");
              }}>
                <input className="auth-input" placeholder="Nombre de la sala" value={roomForm.nombre} onChange={(event) => setRoomForm((current) => ({ ...current, nombre: event.target.value }))} required />
                <BuscadorUsuario
                  empresaId={companyId}
                  value={roomForm.gerente}
                  onChange={(user) => setRoomForm((current) => ({ ...current, gerente: user }))}
                  placeholder="Nombre o correo del gerente"
                  disabled={pending}
                />
                <button className="btn btn-primary" disabled={pending}>Crear sala</button>
              </form>
            </AdminCard>
            <AdminCard title="Añadir miembro" subtitle="Asigna un puesto configurable dentro de una sala.">
              <form className="admin-room-form" onSubmit={(event) => {
                event.preventDefault();
                if (!memberForm.usuario?.id) {
                  toast.error("Selecciona al miembro desde la lista de sugerencias.");
                  return;
                }
                void mutate(async () => {
                  await adminJson(`tenant/workspaces/${memberForm.workspace_id}/members`, { method: "POST", body: { usuario_id: memberForm.usuario.id, role_id: memberForm.role_id } });
                  setMemberForm({ workspace_id: "", usuario: null, role_id: "" });
                }, "Miembro añadido");
              }}>
                <select className="auth-input" value={memberForm.workspace_id} onChange={(event) => setMemberForm((current) => ({ ...current, workspace_id: event.target.value }))} required>
                  <option value="">Selecciona sala</option>
                  {state.rooms.map((room) => <option key={room.id} value={room.id}>{room.nombre}</option>)}
                </select>
                <BuscadorUsuario
                  empresaId={companyId}
                  value={memberForm.usuario}
                  onChange={(user) => setMemberForm((current) => ({ ...current, usuario: user }))}
                  placeholder="Nombre o correo del miembro"
                  disabled={pending}
                />
                <select className="auth-input" value={memberForm.role_id} onChange={(event) => setMemberForm((current) => ({ ...current, role_id: event.target.value }))}>
                  <option value="">Puesto base</option>
                  {workspaceRoles.filter((role) => role.slug !== "gerente").map((role) => <option key={role.id} value={role.id}>{role.nombre}</option>)}
                </select>
                <button className="btn btn-primary" disabled={pending}>Añadir</button>
              </form>
            </AdminCard>
            <div className="admin-room-cards">
              {state.rooms.map((room) => {
                const members = memberRows(room);
                return (
                  <AdminCard key={room.id} title={room.nombre} subtitle={`${members.length} miembros`}>
                    {!members.length ? (
                      <AdminEmptyState title="Sin miembros" body="Añade vendedores a esta sala." />
                    ) : (
                      <div className="admin-members-table-wrap">
                        <table className="client-table admin-company-members-table">
                          <thead>
                            <tr>
                              <th>Nombre</th>
                              <th>Correo</th>
                              <th>Puesto</th>
                              <th>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {members.map((member) => (
                              <tr key={member.usuario_id}>
                                <td className="admin-cell-name" data-label="Nombre">
                                  {member.profiles?.full_name || member.profiles?.email || member.usuario_id}
                                </td>
                                <td className="admin-cell-muted" data-label="Correo">
                                  {member.profiles?.email || "—"}
                                </td>
                                <td data-label="Puesto">
                                  {member.rol_en_workspace === "gerente" ? (
                                    <AdminStatusBadge tone="info">Gerente</AdminStatusBadge>
                                  ) : (
                                    <select
                                      className="auth-input admin-tenant-role-select"
                                      value={member.role_id || ""}
                                      disabled={pending}
                                      onChange={(event) => void mutate(() => adminJson(`tenant/workspaces/${room.id}/members/${member.usuario_id}/role`, { method: "PATCH", body: { role_id: event.target.value } }), "Puesto actualizado")}
                                    >
                                      <option value="" disabled>Selecciona puesto</option>
                                      {workspaceRoles.filter((role) => role.slug !== "gerente").map((role) => (
                                        <option key={role.id} value={role.id}>{role.nombre}</option>
                                      ))}
                                    </select>
                                  )}
                                </td>
                                <td data-label="Acciones">
                                  <AdminOverflowMenu label="Acciones del miembro" items={[
                                    member.rol_en_workspace !== "gerente" ? {
                                      id: "manager",
                                      label: "Convertir en gerente",
                                      onSelect: () => void mutate(() => adminJson(`tenant/workspaces/${room.id}/gerente`, { method: "PATCH", body: { usuario_id: member.usuario_id } }), "Gerente actualizado"),
                                    } : null,
                                    member.rol_en_workspace !== "gerente" ? {
                                      id: "remove",
                                      label: "Retirar de la sala",
                                      danger: true,
                                      onSelect: () => void mutate(() => adminJson(`tenant/workspaces/${room.id}/members/${member.usuario_id}`, { method: "DELETE" }), "Miembro retirado"),
                                    } : null,
                                  ]} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </AdminCard>
                );
              })}
              {!state.rooms.length ? <AdminEmptyState title="Sin salas" body="Crea la primera Sala de Ventas." /> : null}
            </div>
          </div>
        ) : null}

        {tab === "admins" ? (
          <AdminCard title="Administradores de Empresa" subtitle="Nunca podrán administrar otra empresa.">
            <form className="admin-room-form" onSubmit={(event) => {
              event.preventDefault();
              if (!adminForm.usuario?.id) {
                toast.error("Selecciona al administrador desde la lista de sugerencias.");
                return;
              }
              void mutate(async () => {
                await adminJson(`tenant/empresas/${companyId}/admins`, { method: "POST", body: { usuario_id: adminForm.usuario.id, role_id: adminForm.role_id } });
                setAdminForm({ usuario: null, role_id: "" });
              }, "Administrador añadido");
            }}>
              <BuscadorUsuario
                empresaId={companyId}
                value={adminForm.usuario}
                onChange={(user) => setAdminForm((current) => ({ ...current, usuario: user }))}
                placeholder="Nombre o correo del administrador"
                disabled={pending}
              />
              <select className="auth-input" value={adminForm.role_id} onChange={(event) => setAdminForm((current) => ({ ...current, role_id: event.target.value }))}>
                <option value="">Sin rol adicional</option>
                {companyRoles.map((role) => <option key={role.id} value={role.id}>{role.nombre}</option>)}
              </select>
              <button className="btn btn-primary" disabled={pending}>Añadir administrador</button>
            </form>
            <AdminDataView empty={!state.admins.length} emptyTitle="Sin administradores">
              <div className="admin-tenant-member-list">
                {state.admins.map((admin) => (
                  <div key={admin.usuario_id} className="admin-tenant-member">
                    <div><strong>{admin.profiles?.full_name || admin.profiles?.email}</strong><span>{admin.roles?.nombre || "Administrador de Empresa"}</span></div>
                    <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => void mutate(() => adminJson(`tenant/empresas/${companyId}/admins/${admin.usuario_id}`, { method: "DELETE" }), "Administrador retirado")}>Retirar</button>
                  </div>
                ))}
              </div>
            </AdminDataView>
          </AdminCard>
        ) : null}

        {tab === "roles" ? (
          <div className="admin-company-layout">
            <AdminCard
              title={editingRole ? `Editar: ${editingRole.slug}` : "Crear puesto"}
              subtitle="Marca los módulos existentes. Los puestos de sistema (Liner, Cerrador…) se pueden renombrar y ajustar módulos, pero no eliminar."
            >
              <form className="admin-inline-form" onSubmit={(event) => {
                event.preventDefault();
                void mutate(async () => {
                  if (editingRole) {
                    // PATCH parcial: solo nombre si los módulos no cambiaron.
                    // Evita reenviar flag_keys=[] y borrar el paquete al “solo renombrar”.
                    const baseline = new Set(editingRole.flag_keys || []);
                    const current = new Set(roleForm.flag_keys || []);
                    const modulesChanged = baseline.size !== current.size
                      || [...current].some((key) => !baseline.has(key));
                    const body = { nombre: roleForm.nombre };
                    if (modulesChanged) body.flag_keys = roleForm.flag_keys;
                    await adminJson(`tenant/empresas/${companyId}/roles/${editingRole.id}`, {
                      method: "PATCH",
                      body,
                    });
                    setEditingRole(null);
                  } else {
                    await adminJson(`tenant/empresas/${companyId}/roles`, {
                      method: "POST",
                      body: {
                        nombre: roleForm.nombre,
                        scope: roleForm.scope,
                        flag_keys: roleForm.flag_keys,
                      },
                    });
                  }
                  setRoleForm({ nombre: "", scope: "workspace", flag_keys: [] });
                }, editingRole ? "Puesto actualizado" : "Puesto creado");
              }}>
                <input
                  className="auth-input"
                  placeholder="Ej. Liner, Cerrador o Recepción"
                  value={roleForm.nombre}
                  onChange={(event) => setRoleForm((current) => ({ ...current, nombre: event.target.value }))}
                  required
                />
                {!editingRole && (
                  <select className="auth-input" value={roleForm.scope} onChange={(event) => setRoleForm((current) => ({ ...current, scope: event.target.value }))}>
                    <option value="workspace">Sala de Ventas</option>
                    <option value="empresa">Empresa</option>
                  </select>
                )}
                {editingRole?.es_sistema && (
                  <p className="admin-card-muted">Clave interna: <code>{editingRole.slug}</code> (no editable)</p>
                )}
                <div className="section-label" style={{ marginTop: 8 }}>Módulos</div>
                <div className="admin-tenant-check-grid">
                  {state.flags.map((flag) => (
                    <label key={flag.id}>
                      <input
                        type="checkbox"
                        checked={roleForm.flag_keys.includes(flag.clave)}
                        onChange={(event) => setRoleForm((current) => ({
                          ...current,
                          flag_keys: event.target.checked
                            ? [...current.flag_keys, flag.clave]
                            : current.flag_keys.filter((key) => key !== flag.clave),
                        }))}
                      />
                      {flag.nombre_visible}
                    </label>
                  ))}
                </div>
                <div className="btn-row" style={{ marginTop: 8 }}>
                  {editingRole && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={pending}
                      onClick={() => {
                        setEditingRole(null);
                        setRoleForm({ nombre: "", scope: "workspace", flag_keys: [] });
                      }}
                    >
                      Cancelar
                    </button>
                  )}
                  <button className="btn btn-primary" disabled={pending}>
                    {editingRole ? "Guardar cambios" : "Crear puesto"}
                  </button>
                </div>
              </form>
            </AdminCard>
            <div className="admin-room-cards">
              {state.roles.map((role) => (
                <AdminCard
                  key={role.id}
                  title={role.nombre}
                  subtitle={
                    role.es_sistema
                      ? `Sistema · ${role.slug}`
                      : (role.scope === "empresa" ? "Administración de empresa" : "Puesto de sala")
                  }
                  action={(
                    <AdminOverflowMenu
                      label={`Acciones de ${role.nombre}`}
                      items={[
                        {
                          id: "edit",
                          label: "Editar nombre/módulos",
                          onSelect: () => {
                            setEditingRole(role);
                            setRoleForm({
                              nombre: role.nombre,
                              scope: role.scope || "workspace",
                              flag_keys: Array.isArray(role.flag_keys) ? role.flag_keys : [],
                            });
                          },
                        },
                        ...(!role.es_sistema
                          ? [{
                            id: "delete",
                            label: "Eliminar puesto",
                            danger: true,
                            onSelect: () => void mutate(
                              () => adminJson(`tenant/empresas/${companyId}/roles/${role.id}`, { method: "DELETE" }),
                              "Puesto eliminado",
                            ),
                          }]
                          : []),
                      ]}
                    />
                  )}
                >
                  <p className="admin-card-muted">
                    {(role.flag_keys?.length ?? 0)} módulos
                    {role.paquetes_acceso?.nombre ? ` · ${role.paquetes_acceso.nombre}` : ""}
                  </p>
                  <div className="admin-tenant-tag-list">
                    {(role.flag_keys || []).slice(0, 6).map((clave) => (
                      <AdminStatusBadge key={clave} tone="info">
                        {state.flags.find((f) => f.clave === clave)?.nombre_visible || clave}
                      </AdminStatusBadge>
                    ))}
                  </div>
                </AdminCard>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "packages" ? (
          <div className="admin-company-layout">
            <AdminCard title="Crear Paquete de Acceso" subtitle="El paquete controla módulos; el puesto controla permisos.">
              <form className="admin-inline-form" onSubmit={(event) => {
                event.preventDefault();
                void mutate(async () => {
                  await adminJson(`tenant/empresas/${companyId}/packages`, { method: "POST", body: packageForm });
                  setPackageForm({ nombre: "", descripcion: "", flag_keys: [] });
                }, "Paquete creado");
              }}>
                <input className="auth-input" placeholder="Nombre del paquete" value={packageForm.nombre} onChange={(event) => setPackageForm((current) => ({ ...current, nombre: event.target.value }))} required />
                <input className="auth-input" placeholder="Descripción" value={packageForm.descripcion} onChange={(event) => setPackageForm((current) => ({ ...current, descripcion: event.target.value }))} />
                <div className="admin-tenant-check-grid">
                  {state.flags.map((flag) => (
                    <label key={flag.id}><input type="checkbox" checked={packageForm.flag_keys.includes(flag.clave)} onChange={(event) => setPackageForm((current) => ({ ...current, flag_keys: event.target.checked ? [...current.flag_keys, flag.clave] : current.flag_keys.filter((key) => key !== flag.clave) }))} />{flag.nombre_visible}</label>
                  ))}
                </div>
                <button className="btn btn-primary" disabled={pending}>Crear paquete</button>
              </form>
            </AdminCard>
            <div className="admin-room-cards">
              {state.packages.map((pack) => (
                <AdminCard key={pack.id} title={pack.nombre} subtitle={pack.descripcion || "Sin descripción"} action={!pack.es_sistema ? <AdminOverflowMenu label={`Acciones de ${pack.nombre}`} items={[{ id: "delete", label: "Eliminar paquete", danger: true, onSelect: () => void mutate(() => adminJson(`tenant/empresas/${companyId}/packages/${pack.id}`, { method: "DELETE" }), "Paquete eliminado") }]} /> : null}>
                  <div className="admin-tenant-tag-list">{(pack.paquete_flags || []).map((entry) => <AdminStatusBadge key={entry.flag_id} tone="info">{entry.flags?.nombre_visible || entry.flags?.clave}</AdminStatusBadge>)}</div>
                </AdminCard>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "branding" ? (
          <AdminCard title={`Branding y plan · ${selectedCompany?.nombre || ""}`} subtitle="La configuración se aplica únicamente a esta empresa.">
            <form className="admin-brand-form" onSubmit={(event) => {
              event.preventDefault();
              void mutate(async () => {
                const updated = await adminJson(`tenant/empresas/${companyId}`, {
                  method: "PATCH",
                  body: {
                    logo_url: brandForm.logo_url || null,
                    colores_marca: { primary: brandForm.primary, accent: brandForm.accent },
                    plan_paquete: brandForm.plan_paquete || null,
                  },
                });
                if (updated?.logo_url !== undefined) {
                  setBrandForm((current) => ({ ...current, logo_url: updated.logo_url || "" }));
                  setLogoPreviewBroken(false);
                }
              });
            }}>
              <label className="admin-form-field">
                <span>Logo por URL</span>
                <input
                  className="auth-input"
                  value={brandForm.logo_url}
                  onChange={(event) => {
                    setLogoPreviewBroken(false);
                    setBrandForm((current) => ({ ...current, logo_url: event.target.value }));
                  }}
                  placeholder="https://…"
                />
              </label>
              <p className="admin-card-muted">También puedes subir un archivo PNG/JPG/WEBP (máx. 2 MB).</p>
              <div className="admin-brand-actions">
                <label className="btn btn-ghost">
                  {logoPending ? "Subiendo…" : "Subir logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    disabled={logoPending || pending || !companyId}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void uploadLogo(file);
                    }}
                  />
                </label>
                <button type="submit" className="btn btn-primary" disabled={pending || logoPending}>Guardar configuración</button>
              </div>
              <div className="admin-color-fields">
                <label><span>Primario</span><input type="color" value={brandForm.primary} onChange={(event) => setBrandForm((current) => ({ ...current, primary: event.target.value }))} /></label>
                <label><span>Acento</span><input type="color" value={brandForm.accent} onChange={(event) => setBrandForm((current) => ({ ...current, accent: event.target.value }))} /></label>
              </div>
              <label className="admin-form-field"><span>Plan comercial</span><input className="auth-input" value={brandForm.plan_paquete} onChange={(event) => setBrandForm((current) => ({ ...current, plan_paquete: event.target.value }))} /></label>
              {brandForm.logo_url ? (
                <div className="admin-brand-preview-logo" style={{ marginTop: 12, width: 64, height: 64 }}>
                  {!logoPreviewBroken ? (
                    <img
                      src={brandForm.logo_url}
                      alt="Vista previa del logo"
                      referrerPolicy="no-referrer"
                      onError={() => setLogoPreviewBroken(true)}
                    />
                  ) : (
                    <span>SA</span>
                  )}
                </div>
              ) : null}
              {brandForm.logo_url && logoPreviewBroken ? (
                <p className="auth-error">No se pudo cargar la vista previa del logo.</p>
              ) : null}
            </form>
          </AdminCard>
        ) : null}
      </AdminPageState>
    </>
  );

  if (embedded) return <div className="admin-tenant-company">{content}</div>;
  return (
    <div className="admin-page admin-companies-enterprise admin-tenant-company">
      <AdminPageHeader eyebrow="Administración tenant" title="Mi empresa" subtitle="Usuarios, salas, puestos, permisos, módulos, marca y plan dentro de tu alcance." />
      {options.length ? content : <AdminEmptyState title="Sin empresa asignada" />}
    </div>
  );
}
