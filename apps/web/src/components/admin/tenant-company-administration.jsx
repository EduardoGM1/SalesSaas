import { useEffect, useMemo, useState } from "react";
import { Building2, Boxes, Puzzle, ShieldCheck, UsersRound } from "lucide-react";
import { EXTENSION_POINT_META } from "@/lib/custom-modules/extension-points.js";
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
import { AdminSidePanel } from "@/components/admin/admin-side-panel.jsx";
import { ModuleChecklist } from "@/components/admin/module-checklist.jsx";
import { RoleEditorModal } from "@/components/admin/role-editor-modal.jsx";
import { PermissionMatrix } from "@/components/admin/permission-matrix.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { adminJson } from "@/lib/admin/api.js";
import {
  BRAND_ICON_PRESET,
  processBrandingImage,
} from "@/lib/branding-image.js";
import { toast } from "@/lib/toast";

const TABS = [
  { id: "summary", label: "Resumen", icon: Building2 },
  { id: "rooms", label: "Salas y miembros", icon: UsersRound },
  { id: "admins", label: "Administradores", icon: ShieldCheck },
  { id: "roles", label: "Puestos", icon: UsersRound },
  { id: "packages", label: "Paquetes", icon: Boxes },
  { id: "modules", label: "Módulos custom", icon: Puzzle },
  { id: "catalogo-rh", label: "Catálogo RH", icon: Boxes },
  { id: "branding", label: "Branding y plan", icon: Building2 },
];

const EMPTY_MODULE_FORM = {
  clave: "",
  nombre_visible: "",
  punto_extension: "expediente.tab",
  schema_json: '{\n  "fields": [\n    { "key": "nota", "label": "Nota", "type": "textarea", "required": false }\n  ]\n}',
};
const EMPTY_COMPANIES = [];

function companyOptionsFromContext(context) {
  return (context?.memberships || []).map((membership) => ({
    id: membership.empresa_id,
    nombre: membership.empresas?.nombre || membership.empresa_id,
    logo_url: membership.empresas?.logo_url || null,
    logo_icono_url: membership.empresas?.logo_icono_url || null,
    colores_marca: membership.empresas?.colores_marca || {},
    plan_paquete: membership.empresas?.plan_paquete || null,
  }));
}

function memberRows(room) {
  return Array.isArray(room?.workspace_miembros) ? room.workspace_miembros : [];
}

function permisoLabel(permisos, clave) {
  return (permisos || []).find((p) => p.clave === clave)?.nombre_visible || clave;
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
    modulos: [],
    permissions: [],
  });
  const [roomForm, setRoomForm] = useState({ nombre: "", gerente: null });
  const [adminForm, setAdminForm] = useState({ usuario: null, role_id: "" });
  const [roleForm, setRoleForm] = useState({ nombre: "", scope: "workspace", flag_keys: [] });
  const [editingRole, setEditingRole] = useState(null);
  const [editRoleForm, setEditRoleForm] = useState({ nombre: "", flag_keys: [] });
  const [packageForm, setPackageForm] = useState({ nombre: "", descripcion: "", flag_keys: [] });
  const [moduleForm, setModuleForm] = useState(EMPTY_MODULE_FORM);
  const [memberForm, setMemberForm] = useState({ workspace_id: "", usuario: null, role_id: "" });
  const [brandForm, setBrandForm] = useState({
    logo_url: "",
    logo_icono_url: "",
    primary: "#1e5eff",
    accent: "#0f2044",
    plan_paquete: "",
  });
  const [pending, setPending] = useState(false);
  const [logoPending, setLogoPending] = useState(false);
  const [logoPreviewBroken, setLogoPreviewBroken] = useState(false);
  const [delegOpen, setDelegOpen] = useState(false);
  const [delegAsistente, setDelegAsistente] = useState(null);
  const [delegCeiling, setDelegCeiling] = useState([]);
  const [delegSelected, setDelegSelected] = useState([]);
  const [delegLoading, setDelegLoading] = useState(false);
  const [crossGerenteId, setCrossGerenteId] = useState("");
  const [crossRows, setCrossRows] = useState([]);
  const [crossLoading, setCrossLoading] = useState(false);

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
      logo_icono_url: selectedCompany.logo_icono_url || "",
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
      const processed = await processBrandingImage(file, BRAND_ICON_PRESET);
      const updated = await adminJson(`tenant/empresas/${companyId}/branding/logo`, {
        method: "POST",
        body: { data_url: processed.dataUrl, slot: "icon" },
      });
      setBrandForm((current) => ({
        ...current,
        logo_icono_url: updated?.logo_icono_url || current.logo_icono_url,
      }));
      setLogoPreviewBroken(false);
      setReload((value) => value + 1);
      toast.success("Ícono de workspace actualizado");
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "No se pudo subir el logo.",
      }));
    } finally {
      setLogoPending(false);
    }
  };

  const iconPreviewUrl = brandForm.logo_icono_url || brandForm.logo_url;

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
      adminJson(`tenant/empresas/${companyId}/modulos-custom`),
      adminJson(`tenant/empresas/${companyId}/permissions`),
    ]).then(([overview, rooms, admins, roles, packages, flags, modulos, permissions]) => {
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
        modulos: Array.isArray(modulos)
          ? modulos.filter((m) => m.tipo === "custom" && m.empresa_id === companyId)
          : [],
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

  const openEmpresaDelegacion = async (adminRow) => {
    setDelegAsistente(adminRow);
    setDelegOpen(true);
    setDelegLoading(true);
    try {
      const [ceiling, keys] = await Promise.all([
        adminJson(`tenant/empresas/${companyId}/delegacion/techo`),
        adminJson(`tenant/empresas/${companyId}/delegacion?asistente_id=${encodeURIComponent(adminRow.usuario_id)}`),
      ]);
      setDelegCeiling(Array.isArray(ceiling) ? ceiling : []);
      setDelegSelected(Array.isArray(keys) ? keys : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar la delegación");
      setDelegOpen(false);
    } finally {
      setDelegLoading(false);
    }
  };

  const saveEmpresaDelegacion = async () => {
    if (!delegAsistente) return;
    setPending(true);
    try {
      await adminJson(`tenant/empresas/${companyId}/delegacion`, {
        method: "PUT",
        body: {
          asistente_id: delegAsistente.usuario_id,
          permiso_keys: delegSelected,
        },
      });
      toast.success("Permisos delegados actualizados");
      setDelegOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar");
    } finally {
      setPending(false);
    }
  };

  const closeRoleEditor = () => {
    setEditingRole(null);
  };

  const openRoleEditor = (role) => {
    setEditingRole(role);
    setEditRoleForm({
      nombre: role.nombre,
      flag_keys: Array.isArray(role.flag_keys) ? role.flag_keys : [],
    });
  };

  const saveEditingRole = () => {
    if (!editingRole) return;
    void mutate(async () => {
      const baseline = new Set(editingRole.flag_keys || []);
      const current = new Set(editRoleForm.flag_keys || []);
      const modulesChanged = baseline.size !== current.size
        || [...current].some((key) => !baseline.has(key));
      const body = { nombre: editRoleForm.nombre };
      if (modulesChanged) body.flag_keys = editRoleForm.flag_keys;
      await adminJson(`tenant/empresas/${companyId}/roles/${editingRole.id}`, {
        method: "PATCH",
        body,
      });
      closeRoleEditor();
    }, "Puesto actualizado");
  };

  const loadAccesoCruzado = async (gerenteId) => {
    setCrossGerenteId(gerenteId);
    setCrossLoading(true);
    try {
      const rows = await adminJson(`tenant/empresas/${companyId}/gerentes/${gerenteId}/acceso-cruzado`);
      setCrossRows(Array.isArray(rows) ? rows : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar acceso cruzado");
      setCrossRows([]);
    } finally {
      setCrossLoading(false);
    }
  };

  const toggleAccesoCruzado = async (salaId, activo) => {
    if (!crossGerenteId) return;
    try {
      await adminJson(`tenant/empresas/${companyId}/gerentes/${crossGerenteId}/acceso-cruzado`, {
        method: "PUT",
        body: { sala_id: salaId, activo },
      });
      await loadAccesoCruzado(crossGerenteId);
      toast.success(activo ? "Acceso otorgado" : "Acceso revocado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el acceso");
    }
  };

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
                      <AdminEmptyState title="Sin miembros" body="Añade miembros a esta sala." />
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

            <AdminCard title="Acceso cruzado entre salas" subtitle="Otorga a un Gerente visibilidad de otra sala de esta misma empresa.">
              <div className="admin-room-form">
                <select
                  className="auth-input"
                  value={crossGerenteId}
                  onChange={(event) => {
                    const id = event.target.value;
                    if (id) void loadAccesoCruzado(id);
                    else {
                      setCrossGerenteId("");
                      setCrossRows([]);
                    }
                  }}
                >
                  <option value="">Selecciona Gerente</option>
                  {state.rooms.flatMap((room) => memberRows(room)
                    .filter((m) => m.rol_en_workspace === "gerente")
                    .map((m) => (
                      <option key={`${room.id}-${m.usuario_id}`} value={m.usuario_id}>
                        {m.profiles?.full_name || m.profiles?.email || m.usuario_id} — {room.nombre}
                      </option>
                    )))}
                </select>
              </div>
              {crossLoading ? <p>Cargando…</p> : null}
              {!crossLoading && crossGerenteId ? (
                <ul className="team-extras-list">
                  {crossRows.filter((r) => !r.es_miembro).map((row) => (
                    <li key={row.sala_id}>
                      <label className="team-extras-item">
                        <input
                          type="checkbox"
                          checked={!!row.acceso_cruzado}
                          onChange={(event) => void toggleAccesoCruzado(row.sala_id, event.target.checked)}
                        />
                        <span>{row.nombre}</span>
                      </label>
                    </li>
                  ))}
                  {!crossRows.filter((r) => !r.es_miembro).length ? (
                    <li className="team-empty">No hay otras salas disponibles para acceso cruzado.</li>
                  ) : null}
                </ul>
              ) : null}
            </AdminCard>
          </div>
        ) : null}

        {tab === "admins" ? (
          <AdminCard title="Administradores de Empresa" subtitle="Nunca podrán administrar otra empresa. Asistente de Empresa recibe solo permisos delegados.">
            <form className="admin-room-form" onSubmit={(event) => {
              event.preventDefault();
              if (!adminForm.usuario?.id) {
                toast.error("Selecciona al administrador desde la lista de sugerencias.");
                return;
              }
              void mutate(async () => {
                const userSnap = adminForm.usuario;
                await adminJson(`tenant/empresas/${companyId}/admins`, { method: "POST", body: { usuario_id: userSnap.id, role_id: adminForm.role_id } });
                const role = companyRoles.find((r) => r.id === adminForm.role_id);
                setAdminForm({ usuario: null, role_id: "" });
                if (role?.slug === "asistente_empresa") {
                  await openEmpresaDelegacion({ usuario_id: userSnap.id, profiles: userSnap });
                }
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
                    <div>
                      <strong>{admin.profiles?.full_name || admin.profiles?.email}</strong>
                      <span>{admin.roles?.nombre || "Administrador de Empresa"}</span>
                    </div>
                    <div className="btn-row">
                      {admin.roles?.slug === "asistente_empresa" ? (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => openEmpresaDelegacion(admin)}>
                          Delegar permisos
                        </button>
                      ) : null}
                      <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => void mutate(() => adminJson(`tenant/empresas/${companyId}/admins/${admin.usuario_id}`, { method: "DELETE" }), "Administrador retirado")}>Retirar</button>
                    </div>
                  </div>
                ))}
              </div>
            </AdminDataView>
          </AdminCard>
        ) : null}

        {tab === "roles" ? (
          <div className="admin-company-layout">
            <AdminCard
              title="Crear puesto"
              subtitle="El puesto controla qué módulos ve el usuario. Para editar un puesto existente, usa el menú de acciones en su tarjeta."
            >
              <form className="admin-inline-form" onSubmit={(event) => {
                event.preventDefault();
                void mutate(async () => {
                  await adminJson(`tenant/empresas/${companyId}/roles`, {
                    method: "POST",
                    body: {
                      nombre: roleForm.nombre,
                      scope: roleForm.scope,
                      flag_keys: roleForm.flag_keys,
                    },
                  });
                  setRoleForm({ nombre: "", scope: "workspace", flag_keys: [] });
                }, "Puesto creado");
              }}>
                <input
                  className="auth-input"
                  placeholder="Ej. Liner, Cerrador o Recepción"
                  value={roleForm.nombre}
                  onChange={(event) => setRoleForm((current) => ({ ...current, nombre: event.target.value }))}
                  required
                />
                <select className="auth-input" value={roleForm.scope} onChange={(event) => setRoleForm((current) => ({ ...current, scope: event.target.value }))}>
                  <option value="workspace">Sala de Ventas</option>
                  <option value="empresa">Empresa</option>
                </select>
                <div className="section-label" style={{ marginTop: 8 }}>Módulos</div>
                <ModuleChecklist
                  flags={state.flags}
                  value={roleForm.flag_keys}
                  idPrefix="role-create"
                  onChange={(flag_keys) => setRoleForm((current) => ({ ...current, flag_keys }))}
                />
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button className="btn btn-primary" disabled={pending}>
                    Crear puesto
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
                          onSelect: () => openRoleEditor(role),
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
                    {role.paquetes_acceso?.nombre ? ` · plantilla: ${role.paquetes_acceso.nombre}` : ""}
                    {(role.permission_keys?.length ?? 0) > 0 ? ` · ${role.permission_keys.length} acciones` : ""}
                  </p>
                  <div className="section-label admin-role-card-section">Módulos</div>
                  <div className="admin-tenant-tag-list">
                    {(role.flag_keys || []).slice(0, 6).map((clave) => (
                      <AdminStatusBadge key={clave} tone="info">
                        {state.flags.find((f) => f.clave === clave)?.nombre_visible || clave}
                      </AdminStatusBadge>
                    ))}
                    {(role.flag_keys?.length ?? 0) > 6 ? (
                      <span className="admin-card-muted">+{role.flag_keys.length - 6} más</span>
                    ) : null}
                  </div>
                  {(role.permission_keys?.length ?? 0) > 0 ? (
                    <>
                      <div className="section-label admin-role-card-section">Acciones</div>
                      <div className="admin-tenant-tag-list">
                        {(role.permission_keys || []).slice(0, 6).map((clave) => (
                          <AdminStatusBadge key={clave} tone="neutral">
                            {permisoLabel(state.permissions, clave)}
                          </AdminStatusBadge>
                        ))}
                        {role.permission_keys.length > 6 ? (
                          <span className="admin-card-muted">+{role.permission_keys.length - 6} más</span>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </AdminCard>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "modules" ? (
          <div className="admin-company-layout">
            <AdminCard
              title="Crear módulo custom"
              subtitle="Solo visible para esta empresa. Actívalo en un Paquete de Acceso para que el puesto lo use."
            >
              <form
                className="admin-inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate(async () => {
                    let schema_ui = {};
                    try {
                      schema_ui = JSON.parse(moduleForm.schema_json || "{}");
                    } catch {
                      throw new Error("schema_ui debe ser JSON válido.");
                    }
                    await adminJson(`tenant/empresas/${companyId}/modulos-custom`, {
                      method: "POST",
                      body: {
                        clave: moduleForm.clave.trim(),
                        nombre_visible: moduleForm.nombre_visible.trim(),
                        punto_extension: moduleForm.punto_extension || null,
                        schema_ui,
                      },
                    });
                    setModuleForm(EMPTY_MODULE_FORM);
                  }, "Módulo custom creado");
                }}
              >
                <input
                  className="auth-input"
                  placeholder="clave (ej. toy.checklist)"
                  value={moduleForm.clave}
                  onChange={(event) => setModuleForm((c) => ({ ...c, clave: event.target.value }))}
                  required
                />
                <input
                  className="auth-input"
                  placeholder="Nombre visible"
                  value={moduleForm.nombre_visible}
                  onChange={(event) => setModuleForm((c) => ({ ...c, nombre_visible: event.target.value }))}
                  required
                />
                <select
                  className="auth-input"
                  value={moduleForm.punto_extension}
                  onChange={(event) => setModuleForm((c) => ({ ...c, punto_extension: event.target.value }))}
                >
                  {Object.entries(EXTENSION_POINT_META).map(([key, meta]) => (
                    <option key={key} value={key}>{meta.label}</option>
                  ))}
                </select>
                <textarea
                  className="auth-input"
                  rows={8}
                  value={moduleForm.schema_json}
                  onChange={(event) => setModuleForm((c) => ({ ...c, schema_json: event.target.value }))}
                  spellCheck={false}
                />
                <button className="btn btn-primary" disabled={pending}>Crear módulo</button>
              </form>
            </AdminCard>
            <div className="admin-room-cards">
              {(state.modulos || []).length === 0 ? (
                <AdminEmptyState title="Sin módulos custom" body="Crea el primero con el formulario. Luego inclúyelo en un paquete." />
              ) : (state.modulos || []).map((mod) => (
                <AdminCard
                  key={mod.id}
                  title={mod.nombre_visible}
                  subtitle={mod.clave}
                >
                  <div className="admin-tenant-tag-list">
                    <AdminStatusBadge tone="info">{mod.punto_extension || "sin punto"}</AdminStatusBadge>
                    <AdminStatusBadge tone="info">custom</AdminStatusBadge>
                  </div>
                  <p className="admin-card-muted" style={{ marginTop: 8 }}>
                    Campos: {Array.isArray(mod.schema_ui?.fields) ? mod.schema_ui.fields.length : 0}
                  </p>
                </AdminCard>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "packages" ? (
          <div className="admin-company-layout">
            <AdminCard
              title="Crear plantilla de módulos"
              subtitle="Paquete reutilizable: define un conjunto de módulos para asignar a varios puestos sin repetir la configuración."
            >
              <form className="admin-inline-form" onSubmit={(event) => {
                event.preventDefault();
                void mutate(async () => {
                  await adminJson(`tenant/empresas/${companyId}/packages`, { method: "POST", body: packageForm });
                  setPackageForm({ nombre: "", descripcion: "", flag_keys: [] });
                }, "Paquete creado");
              }}>
                <input className="auth-input" placeholder="Nombre del paquete" value={packageForm.nombre} onChange={(event) => setPackageForm((current) => ({ ...current, nombre: event.target.value }))} required />
                <input className="auth-input" placeholder="Descripción" value={packageForm.descripcion} onChange={(event) => setPackageForm((current) => ({ ...current, descripcion: event.target.value }))} />
                <div className="section-label">Módulos incluidos</div>
                <ModuleChecklist
                  flags={state.flags}
                  value={packageForm.flag_keys}
                  idPrefix="pkg"
                  onChange={(flag_keys) => setPackageForm((current) => ({ ...current, flag_keys }))}
                />
                <button className="btn btn-primary" disabled={pending}>Crear paquete</button>
              </form>
            </AdminCard>
            <div className="admin-room-cards">
              {state.packages.map((pack) => (
                <AdminCard
                  key={pack.id}
                  title={pack.nombre}
                  subtitle={pack.descripcion || "Plantilla reutilizable de módulos"}
                  action={!pack.es_sistema ? <AdminOverflowMenu label={`Acciones de ${pack.nombre}`} items={[{ id: "delete", label: "Eliminar paquete", danger: true, onSelect: () => void mutate(() => adminJson(`tenant/empresas/${companyId}/packages/${pack.id}`, { method: "DELETE" }), "Paquete eliminado") }]} /> : null}
                >
                  <p className="admin-card-muted">{(pack.paquete_flags?.length ?? 0)} módulos</p>
                  <div className="admin-tenant-tag-list">{(pack.paquete_flags || []).map((entry) => <AdminStatusBadge key={entry.flag_id} tone="info">{entry.flags?.nombre_visible || entry.flags?.clave}</AdminStatusBadge>)}</div>
                </AdminCard>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "catalogo-rh" ? (
          <RoyalHolidayCatalogPanel companyId={companyId} companyName={selectedCompany?.nombre} />
        ) : null}

        {tab === "branding" ? (
          <div className="admin-branding-layout">
            <AdminCard title={`Branding y plan · ${selectedCompany?.nombre || ""}`} subtitle="La configuración se aplica únicamente a esta empresa.">
              <form className="admin-brand-form" onSubmit={(event) => {
                event.preventDefault();
                void mutate(async () => {
                  const updated = await adminJson(`tenant/empresas/${companyId}`, {
                    method: "PATCH",
                    body: {
                      logo_icono_url: brandForm.logo_icono_url || null,
                      colores_marca: { primary: brandForm.primary, accent: brandForm.accent },
                      plan_paquete: brandForm.plan_paquete || null,
                    },
                  });
                  if (updated) {
                    setBrandForm((current) => ({
                      ...current,
                      logo_icono_url: updated.logo_icono_url || "",
                    }));
                    setLogoPreviewBroken(false);
                  }
                });
              }}>
                <fieldset className="admin-brand-slot">
                  <legend>Ícono de workspace</legend>
                  <p className="admin-card-muted">
                    {BRAND_ICON_PRESET.hint} Se muestra en el selector de workspace (esquina superior izquierda).
                  </p>
                  <label className="admin-form-field">
                    <span>URL del ícono</span>
                    <input
                      className="auth-input"
                      value={brandForm.logo_icono_url}
                      onChange={(event) => {
                        setLogoPreviewBroken(false);
                        setBrandForm((current) => ({ ...current, logo_icono_url: event.target.value }));
                      }}
                      placeholder="https://…"
                    />
                  </label>
                  <label className="btn btn-ghost">
                    {logoPending ? "Subiendo…" : "Subir ícono"}
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
                  {brandForm.logo_icono_url && logoPreviewBroken ? (
                    <p className="auth-error">No se pudo cargar la vista previa del ícono.</p>
                  ) : null}
                </fieldset>

                <div className="admin-brand-actions">
                  <span className="admin-card-muted">Si no subes ícono, se usará el logo principal guardado como respaldo.</span>
                  <button type="submit" className="btn btn-primary" disabled={pending || logoPending}>Guardar configuración</button>
                </div>
                <div className="admin-color-fields">
                  <label><span>Primario</span><input type="color" value={brandForm.primary} onChange={(event) => setBrandForm((current) => ({ ...current, primary: event.target.value }))} /></label>
                  <label><span>Acento</span><input type="color" value={brandForm.accent} onChange={(event) => setBrandForm((current) => ({ ...current, accent: event.target.value }))} /></label>
                </div>
                <label className="admin-form-field"><span>Plan comercial</span><input className="auth-input" value={brandForm.plan_paquete} onChange={(event) => setBrandForm((current) => ({ ...current, plan_paquete: event.target.value }))} /></label>
              </form>
            </AdminCard>
            <AdminCard title="Vista previa" subtitle="Así se verán los logos en la aplicación.">
              <div className="admin-brand-preview" style={{ "--brand-preview-primary": brandForm.primary, "--brand-preview-accent": brandForm.accent }}>
                <div className="admin-brand-preview-sidebar">
                  <div className="admin-brand-preview-logo">
                    {iconPreviewUrl && !logoPreviewBroken ? (
                      <img
                        src={iconPreviewUrl}
                        alt="Ícono de workspace"
                        referrerPolicy="no-referrer"
                        onError={() => setLogoPreviewBroken(true)}
                      />
                    ) : (
                      <span>{selectedCompany?.nombre?.slice(0, 2).toUpperCase() || "SA"}</span>
                    )}
                  </div>
                  <span /><span /><span />
                </div>
                <div className="admin-brand-preview-main">
                  <div className="admin-brand-preview-bar">
                    <div className="admin-brand-preview-header-logo admin-brand-preview-header-logo--saletse">
                      <img src="/saletse-logo.png" alt="Saletse" />
                    </div>
                  </div>
                  <div className="admin-brand-preview-copy">
                    <strong>Panel de ventas</strong>
                    <span>Ícono de empresa (izquierda) · logo Saletse fijo (header)</span>
                    <button type="button">Acción principal</button>
                  </div>
                </div>
              </div>
            </AdminCard>
          </div>
        ) : null}
      </AdminPageState>

      <RoleEditorModal
        open={!!editingRole}
        role={editingRole}
        form={editRoleForm}
        onFormChange={setEditRoleForm}
        onClose={closeRoleEditor}
        onSave={saveEditingRole}
        pending={pending}
        flags={state.flags}
        permissions={state.permissions}
      />

      <AdminSidePanel
        open={delegOpen}
        onClose={() => {
          setDelegOpen(false);
          setDelegAsistente(null);
        }}
        title="Delegar permisos"
        subtitle={delegAsistente?.profiles?.full_name || delegAsistente?.profiles?.email || ""}
        footer={(
          <div className="btn-row admin-side-panel-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setDelegOpen(false);
                setDelegAsistente(null);
              }}
              disabled={pending}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveEmpresaDelegacion}
              disabled={pending || delegLoading}
            >
              Guardar delegación
            </button>
          </div>
        )}
      >
        <p className="team-hint">
          Solo puedes marcar acciones que tú ya tienes como Admin de Empresa. Los módulos del puesto se configuran en Puestos.
        </p>
        <PermissionMatrix
          permisos={state.permissions}
          ceiling={delegCeiling}
          value={delegSelected}
          onChange={setDelegSelected}
          loading={delegLoading}
          emptyLabel="No hay acciones que puedas delegar."
        />
      </AdminSidePanel>
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

function editCell(rows, idx, key, value) {
  const next = rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r));
  return next;
}

function RoyalHolidayCatalogPanel({ companyId, companyName }) {
  const [cat, setCat] = useState(null);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(false);
  const [sub, setSub] = useState("parametros");
  const [maxDp, setMaxDp] = useState(6);
  const [maxCc, setMaxCc] = useState(6);
  const [bottomLine, setBottomLine] = useState([]);
  const [financiamiento, setFinanciamiento] = useState([]);
  const [comisiones, setComisiones] = useState([]);
  const [regalos, setRegalos] = useState([]);
  const [costoAdmin, setCostoAdmin] = useState([]);

  const reload = async () => {
    if (!companyId) return;
    setErr("");
    try {
      const data = await adminJson(`tenant/empresas/${companyId}/catalogo-rh`);
      setCat(data);
      setMaxDp(data?.parametros?.max_extra_dp ?? 6);
      setMaxCc(data?.parametros?.max_extra_cc ?? 6);
      setBottomLine(data?.bottom_line || []);
      setFinanciamiento(data?.financiamiento || []);
      setComisiones(data?.comisiones || []);
      setRegalos(data?.regalos || []);
      setCostoAdmin(data?.costo_administrativo || []);
    } catch (e) {
      setCat(null);
      setErr(e.message || "Sin catálogo RH");
    }
  };

  useEffect(() => { void reload(); }, [companyId]);

  const publish = async () => {
    setPending(true);
    try {
      await adminJson(`tenant/empresas/${companyId}/catalogo-rh/publish`, {
        method: "POST",
        body: {
          notas: "Publicación desde Configuraciones Catálogo RH",
          parametros: {
            ...(cat?.parametros || {}),
            max_extra_dp: Number(maxDp),
            max_extra_cc: Number(maxCc),
          },
          bottom_line: bottomLine,
          financiamiento,
          comisiones,
          regalos,
          costo_administrativo: costoAdmin,
        },
      });
      toast.success("Nueva versión de catálogo publicada");
      await reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPending(false);
    }
  };

  if (!companyId) return <AdminEmptyState title="Selecciona una empresa" />;
  if (err) {
    return (
      <AdminCard title="Catálogo Worksheet Royal Holiday" subtitle={companyName}>
        <p className="muted">{err}</p>
        <p className="muted">Solo aplica a empresas con Worksheet RH sembrado (p. ej. Royal Holiday).</p>
      </AdminCard>
    );
  }
  if (!cat) return <AdminCard title="Catálogo RH"><p>Cargando…</p></AdminCard>;

  const subs = [
    { id: "parametros", label: "Parámetros" },
    { id: "bottom_line", label: "Bottom line" },
    { id: "financiamiento", label: "Financiamiento" },
    { id: "comisiones", label: "Comisiones" },
    { id: "regalos", label: "Regalos" },
    { id: "costo", label: "Costo admin" },
  ];

  return (
    <div className="admin-company-layout">
      <AdminCard
        title={`Configuraciones · Catálogo RH v${cat.catalogo?.version}`}
        subtitle="Edita tablas y publica una versión nueva. Ventas previas conservan su catálogo_id."
      >
        <nav className="admin-subnav" style={{ marginBottom: 12 }}>
          {subs.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`admin-subnav-item${sub === s.id ? " active" : ""}`}
              onClick={() => setSub(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {sub === "parametros" && (
          <div className="admin-inline-form">
            <label>
              Max Extra DP
              <input className="auth-input" type="number" value={maxDp} onChange={(e) => setMaxDp(e.target.value)} />
            </label>
            <label>
              Max Extra CC
              <input className="auth-input" type="number" value={maxCc} onChange={(e) => setMaxCc(e.target.value)} />
            </label>
            <p className="muted" style={{ fontSize: 13, width: "100%" }}>
              Bottom line: {bottomLine.length} · Financiamiento: {financiamiento.length} ·
              Comisiones: {comisiones.length} · Regalos: {regalos.length}
            </p>
          </div>
        )}

        {sub === "bottom_line" && (
          <div className="admin-users-table-wrap">
            <table className="client-table">
              <thead><tr><th>Programa</th><th>HC</th><th>Mín s/IVA</th><th>Mín c/IVA</th><th>M.Fee</th></tr></thead>
              <tbody>
                {bottomLine.map((r, idx) => (
                  <tr key={r.id || idx}>
                    {["programa", "holiday_credits", "precio_minimo_sin_iva", "precio_minimo_con_iva", "cuota_anual_mfee"].map((k) => (
                      <td key={k}>
                        <input
                          className="auth-input"
                          value={r[k] ?? ""}
                          onChange={(e) => setBottomLine(editCell(bottomLine, idx, k, e.target.value))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => setBottomLine([...bottomLine, {
                programa: "", holiday_credits: 0, precio_minimo_sin_iva: 0, precio_minimo_con_iva: 0, cuota_anual_mfee: 0,
              }])}
            >
              + Fila
            </button>
          </div>
        )}

        {sub === "financiamiento" && (
          <div className="admin-users-table-wrap">
            <table className="client-table">
              <thead><tr><th>Enganche %</th><th>Plazo</th><th>Nac.</th><th>Tasa</th><th>Factor</th></tr></thead>
              <tbody>
                {financiamiento.map((r, idx) => (
                  <tr key={r.id || idx}>
                    {["enganche_pct", "plazo_meses", "nacionalidad", "tasa_interes", "factor_mensual"].map((k) => (
                      <td key={k}>
                        <input
                          className="auth-input"
                          value={r[k] ?? ""}
                          onChange={(e) => setFinanciamiento(editCell(financiamiento, idx, k, e.target.value))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => setFinanciamiento([...financiamiento, {
                enganche_pct: 15, plazo_meses: 60, nacionalidad: "mexicano", tasa_interes: 0, factor_mensual: 0,
              }])}
            >
              + Fila
            </button>
          </div>
        )}

        {sub === "comisiones" && (
          <div className="admin-users-table-wrap">
            <table className="client-table">
              <thead><tr><th>DP%</th><th>HC min</th><th>HC max</th><th>Pos</th><th>%</th></tr></thead>
              <tbody>
                {comisiones.map((r, idx) => (
                  <tr key={r.id || idx}>
                    {["down_payment_pct", "hc_rango_min", "hc_rango_max", "posicion", "porcentaje_comision"].map((k) => (
                      <td key={k}>
                        <input
                          className="auth-input"
                          value={r[k] ?? ""}
                          onChange={(e) => setComisiones(editCell(comisiones, idx, k, e.target.value))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => setComisiones([...comisiones, {
                down_payment_pct: 15, hc_rango_min: 0, hc_rango_max: 999999, posicion: "ftb", porcentaje_comision: 0,
              }])}
            >
              + Fila
            </button>
          </div>
        )}

        {sub === "regalos" && (
          <div className="admin-users-table-wrap">
            <table className="client-table">
              <thead><tr><th>Nombre</th><th>Costo</th><th>Cargas (csv)</th></tr></thead>
              <tbody>
                {regalos.map((r, idx) => (
                  <tr key={r.id || idx}>
                    <td>
                      <input className="auth-input" value={r.nombre ?? ""} onChange={(e) => setRegalos(editCell(regalos, idx, "nombre", e.target.value))} />
                    </td>
                    <td>
                      <input className="auth-input" value={r.costo ?? ""} onChange={(e) => setRegalos(editCell(regalos, idx, "costo", e.target.value))} />
                    </td>
                    <td>
                      <input
                        className="auth-input"
                        value={Array.isArray(r.cargas_permitidas) ? r.cargas_permitidas.join(",") : (r.cargas_permitidas || "")}
                        onChange={(e) => setRegalos(editCell(
                          regalos,
                          idx,
                          "cargas_permitidas",
                          e.target.value.split(",").map((x) => x.trim()).filter(Boolean),
                        ))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => setRegalos([...regalos, { nombre: "", costo: null, cargas_permitidas: [] }])}
            >
              + Fila
            </button>
          </div>
        )}

        {sub === "costo" && (
          <div className="admin-users-table-wrap">
            <table className="client-table">
              <thead><tr><th>Enganche % mín</th><th>Monto USD</th></tr></thead>
              <tbody>
                {costoAdmin.map((r, idx) => (
                  <tr key={r.id || idx}>
                    <td>
                      <input className="auth-input" value={r.enganche_pct_min ?? ""} onChange={(e) => setCostoAdmin(editCell(costoAdmin, idx, "enganche_pct_min", e.target.value))} />
                    </td>
                    <td>
                      <input className="auth-input" value={r.monto_usd ?? ""} onChange={(e) => setCostoAdmin(editCell(costoAdmin, idx, "monto_usd", e.target.value))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => setCostoAdmin([...costoAdmin, { enganche_pct_min: 15, monto_usd: 750 }])}
            >
              + Fila
            </button>
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={publish}>
            {pending ? "Publicando…" : "Publicar nueva versión"}
          </button>
        </div>
      </AdminCard>
    </div>
  );
}
