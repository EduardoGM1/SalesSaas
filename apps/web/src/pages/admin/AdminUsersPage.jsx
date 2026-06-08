import { useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { AdminUsersFilters } from "@/components/admin/admin-users-filters.jsx";
import { IconSave, IconUserCheck, IconUserX } from "@/components/admin/admin-users-icons.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { hasPermission } from "@/lib/auth/permissions";
import { parseUserAdminFilters, userAdminUrl, userFiltersToSearchParams } from "@/lib/admin/filters";
import { DELEGATABLE_ADMIN_PERMISSIONS } from "@/lib/auth/permissions";
import { fmt, fmtN } from "@/lib/format/money";
import { longDate } from "@/lib/format/dates";

const ROLES = [
  { value: "vendedor", label: "Vendedor" },
  { value: "admin", label: "Admin" },
];

const ROLE_LABELS = { vendedor: "Vendedor", gerente: "Gerente", admin: "Admin" };

const ERRORS = {
  invalid: "Datos inválidos.",
  role: "No se pudo actualizar el rol.",
  status: "No se pudo actualizar el estado.",
  permissions: "No se pudieron guardar los permisos.",
};

async function patchAdmin(path, body) {
  const res = await fetch(`/api/v1/admin/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Error");
}

function ConfirmModal({ kind, user, newRole, onClose, onDone }) {
  const [pending, setPending] = useState(false);
  const roleUnchanged = kind === "role" && user.role === newRole;

  const submit = async () => {
    setPending(true);
    try {
      if (kind === "role") {
        await patchAdmin(`users/${user.id}/role`, { role: newRole });
      } else {
        await patchAdmin(`users/${user.id}/status`, { is_active: kind === "activate" });
      }
      onDone();
    } catch {
      onDone("role");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button type="button" className="modal-backdrop" aria-label="Cancelar" onClick={onClose} />
      <div className="admin-confirm-panel" role="alertdialog" aria-modal="true">
        <div className="admin-confirm-head">
          <span className="admin-confirm-title">
            {kind === "role" && (roleUnchanged ? "Sin cambios de rol" : "¿Guardar cambios de rol?")}
            {kind === "deactivate" && "¿Desactivar esta cuenta?"}
            {kind === "activate" && "¿Activar esta cuenta?"}
          </span>
          <span className="admin-confirm-sub">{user.name}</span>
        </div>
        <p className="admin-confirm-body">
          {kind === "role" && roleUnchanged && <>El rol seleccionado es el mismo que el actual.</>}
          {kind === "role" && !roleUnchanged && (
            <>Rol actual: <strong>{ROLE_LABELS[user.role] ?? user.role}</strong> → Nuevo: <strong>{ROLE_LABELS[newRole] ?? newRole}</strong></>
          )}
          {kind === "deactivate" && <><strong>{user.name}</strong> no podrá iniciar sesión.</>}
          {kind === "activate" && <><strong>{user.name}</strong> podrá volver a iniciar sesión.</>}
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{roleUnchanged ? "Cerrar" : "Cancelar"}</button>
          {!roleUnchanged && (
            <button type="button" className={`btn ${kind === "deactivate" ? "btn-danger" : "btn-primary"}`} disabled={pending} onClick={submit}>
              {pending ? "Guardando…" : kind === "role" ? "Guardar" : kind === "deactivate" ? "Desactivar" : "Activar"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function PermissionsModal({ user, onClose, onDone }) {
  const [pending, setPending] = useState(false);
  const current = new Set(user.admin_permissions);

  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const permissions = fd.getAll("permissions").map(String);
    try {
      await patchAdmin(`users/${user.id}/permissions`, { permissions });
      onDone();
    } catch {
      onDone("permissions");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button type="button" className="modal-backdrop" aria-label="Cerrar" onClick={onClose} />
      <div className="admin-confirm-panel admin-perms-modal" role="dialog" aria-modal="true">
        <div className="admin-confirm-head">
          <span className="admin-confirm-title">Permisos de administrador</span>
          <span className="admin-confirm-sub">{user.name}</span>
        </div>
        <form onSubmit={submit}>
          <div className="admin-perms-grid">
            {DELEGATABLE_ADMIN_PERMISSIONS.map((p) => (
              <label key={p.key} className="admin-perm-item">
                <input type="checkbox" name="permissions" value={p.key} defaultChecked={current.has(p.key)} />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Guardando…" : "Guardar permisos"}</button>
          </div>
        </form>
      </div>
    </>
  );
}

export function AdminUsersPage() {
  const session = useOutletContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [reloadKey, setReloadKey] = useState(0);
  const filters = useMemo(() => parseUserAdminFilters(Object.fromEntries(searchParams.entries())), [searchParams]);
  const qs = searchParams.toString();
  const search = qs ? `?${qs}&_=${reloadKey}` : `?_=${reloadKey}`;
  const { loading, data, error } = useAdminFetch("users", search);

  const profile = session?.profile;
  const caps = {
    canRole: hasPermission(profile, "users:role"),
    canDeactivate: hasPermission(profile, "users:deactivate"),
    canActivate: hasPermission(profile, "users:activate"),
    canPermissions: hasPermission(profile, "users:permissions"),
  };

  const confirmKind = searchParams.get("confirm");
  const confirmUserId = searchParams.get("userId");
  const newRole = searchParams.get("newRole");
  const editPermsId = searchParams.get("editPerms");
  const errorCode = searchParams.get("error");
  const returnTo = `/admin/users${userFiltersToSearchParams(filters)}`;
  const exportHref = `/api/v1/admin/export/users${userFiltersToSearchParams(filters)}`;

  const users = data ?? [];
  const confirmUser = confirmUserId ? users.find((u) => u.id === confirmUserId) : undefined;
  const permsUser = editPermsId ? users.find((u) => u.id === editPermsId) : undefined;

  const refresh = (err) => {
    const url = err ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${err}` : returnTo;
    navigate(url, { replace: true });
    setReloadKey((k) => k + 1);
  };

  if (loading) return <div className="admin-page">Cargando usuarios…</div>;
  if (error) return <div className="admin-page admin-empty">{error}</div>;

  const hasActions = caps.canRole || caps.canDeactivate || caps.canActivate || caps.canPermissions;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">Usuarios</h1>
        <p className="admin-sub">{fmtN(users.length)} cuenta(s) registradas.</p>
      </div>
      {errorCode && <div className="auth-error" style={{ marginBottom: 16 }}>{ERRORS[errorCode] ?? "Ocurrió un error."}</div>}
      <AdminUsersFilters filters={filters} exportHref={exportHref} showExport={hasPermission(profile, "users:export")} />
      <div className="client-table-card">
        {users.length === 0 ? (
          <div className="admin-empty">Sin usuarios.</div>
        ) : (
          <table className="client-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th style={{ textAlign: "right" }}>Expedientes</th>
                <th style={{ textAlign: "right" }}>Ventas</th>
                <th style={{ textAlign: "right" }}>Volumen</th>
                <th>Alta</th>
                {hasActions && <th style={{ width: 110 }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === session?.userId;
                const formId = `user-role-${u.id}`;
                const roleReadOnly = !caps.canRole || u.is_super_admin || isSelf;
                return (
                  <tr key={u.id} className={!u.is_active ? "admin-user-row-inactive" : undefined}>
                    <td>{u.name}{u.is_super_admin && <span className="admin-super-badge">Principal</span>}</td>
                    <td>{u.email ?? "—"}</td>
                    <td>
                      {roleReadOnly ? (
                        <span className="admin-role-readonly">{ROLES.find((r) => r.value === u.role)?.label ?? u.role}</span>
                      ) : (
                        <select form={formId} name="newRole" defaultValue={u.role} className="admin-role-select" disabled={!u.is_active}>
                          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      )}
                    </td>
                    <td>
                      <span className={`admin-status-badge ${u.is_active ? "admin-status-active" : "admin-status-inactive"}`}>
                        {u.is_active ? "Activa" : "Desactivada"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>{fmtN(u.prospects)}</td>
                    <td style={{ textAlign: "right" }}>{fmtN(u.sales)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(u.volume)}</td>
                    <td>{u.created_at ? longDate(String(u.created_at).slice(0, 10)) : "—"}</td>
                    {hasActions && (
                      <td>
                        <div className="admin-table-actions">
                          {caps.canRole && !roleReadOnly && (
                            <form id={formId} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); navigate(userAdminUrl(filters, { confirm: "role", userId: u.id, newRole: fd.get("newRole") })); }}>
                              <button type="submit" className="icon-btn" title="Guardar rol" disabled={!u.is_active}><IconSave /></button>
                            </form>
                          )}
                          {!isSelf && !u.is_super_admin && caps.canDeactivate && u.is_active && (
                            <Link to={userAdminUrl(filters, { confirm: "deactivate", userId: u.id })} className="icon-btn admin-icon-btn-danger" title="Desactivar cuenta"><IconUserX /></Link>
                          )}
                          {!isSelf && !u.is_super_admin && caps.canActivate && !u.is_active && (
                            <Link to={userAdminUrl(filters, { confirm: "activate", userId: u.id })} className="icon-btn" title="Activar cuenta"><IconUserCheck /></Link>
                          )}
                          {caps.canPermissions && u.role === "admin" && !u.is_super_admin && (
                            <Link to={userAdminUrl(filters, { editPerms: u.id })} className="btn btn-sm btn-ghost">Permisos</Link>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {confirmUser && ["role", "deactivate", "activate"].includes(confirmKind) && !confirmUser.is_super_admin && (
        <ConfirmModal
          kind={confirmKind}
          user={confirmUser}
          newRole={newRole ?? confirmUser.role}
          onClose={() => navigate(returnTo, { replace: true })}
          onDone={(err) => refresh(err)}
        />
      )}
      {permsUser && caps.canPermissions && permsUser.role === "admin" && !permsUser.is_super_admin && (
        <PermissionsModal
          user={permsUser}
          onClose={() => navigate(returnTo, { replace: true })}
          onDone={(err) => refresh(err)}
        />
      )}
    </div>
  );
}
