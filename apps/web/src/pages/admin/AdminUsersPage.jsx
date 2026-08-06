import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { AdminOverflowMenu } from "@/components/admin/admin-overflow-menu.jsx";
import { AdminUsersFilters } from "@/components/admin/admin-users-filters.jsx";
import { AdminDataView, AdminPageHeader, AdminPageState, AdminStatusBadge } from "@/components/admin/admin-ui.jsx";
import { IconUserCheck, IconUserX } from "@/components/admin/admin-users-icons.jsx";
import { CreditCard, Layers, Shield } from "lucide-react";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import {
  adminPermissionSetHas,
  ASSIGNABLE_ADMIN_PERMISSIONS,
  DELEGATABLE_ADMIN_PERMISSIONS,
  EXPORT_ADMIN_PERMISSIONS,
  expandAdminPermissionSet,
  isSuperAdmin,
} from "@/lib/auth/permissions";
import { parseUserAdminFilters, userAdminUrl, userFiltersToSearchParams } from "@/lib/admin/filters";
import { VENDOR_FEATURE_PERMISSIONS } from "@/lib/auth/user-features";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { longDate } from "@/lib/format/dates";
import { notifyAuthChanged } from "@/lib/session-api.js";

const ROLE_KEYS = {
  vendedor: "admin.users.role.liner",
  liner: "admin.users.role.liner",
  gerente: "admin.users.role.manager",
  admin: "admin.users.role.admin",
  soporte: "admin.users.role.support",
};
const ERROR_KEYS = {
  invalid: "admin.users.error.invalid",
  role: "admin.users.error.role",
  status: "admin.users.error.status",
  permissions: "admin.users.error.permissions",
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

function RolePickerModal({ user, roles, onClose, onContinue }) {
  const { t } = useI18n();
  const [roleId, setRoleId] = useState(user.role_id || roles[0]?.id || "");
  return (
    <>
      <button type="button" className="modal-backdrop" aria-label={t("common.cancel")} onClick={onClose} />
      <div className="admin-confirm-panel" role="dialog" aria-modal="true" aria-labelledby="role-picker-title">
        <div className="admin-confirm-head">
          <span id="role-picker-title" className="admin-confirm-title">{t("admin.users.confirm.roleTitle")}</span>
          <span className="admin-confirm-sub">{user.name}</span>
        </div>
        <div className="admin-user-modal-field">
          <label htmlFor="role-picker-select">{t("admin.users.col.role")}</label>
          <select id="role-picker-select" className="auth-input" value={roleId} onChange={(event) => setRoleId(event.target.value)}>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.nombre}</option>)}
          </select>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-primary" disabled={!roleId} onClick={() => onContinue(roleId)}>Continuar</button>
        </div>
      </div>
    </>
  );
}

function ConfirmModal({ kind, user, newRoleId, newRoleLabel, onClose, onDone }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const roleUnchanged = kind === "role" && (user.role_id === newRoleId || (!user.role_id && !newRoleId));
  const roleLabel = (r) => t(ROLE_KEYS[r] ?? r);

  const submit = async () => {
    setPending(true);
    try {
      if (kind === "role") {
        await patchAdmin(`users/${user.id}/role-id`, { role_id: newRoleId });
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
      <button type="button" className="modal-backdrop" aria-label={t("common.cancel")} onClick={onClose} />
      <div className="admin-confirm-panel" role="alertdialog" aria-modal="true">
        <div className="admin-confirm-head">
          <span className="admin-confirm-title">
            {kind === "role" && (roleUnchanged ? t("admin.users.confirm.roleSame") : t("admin.users.confirm.roleTitle"))}
            {kind === "deactivate" && t("admin.users.confirm.deactivate")}
            {kind === "activate" && t("admin.users.confirm.activate")}
          </span>
          <span className="admin-confirm-sub">{user.name}</span>
        </div>
        <p className="admin-confirm-body">
          {kind === "role" && roleUnchanged && t("admin.users.confirm.roleSameBody")}
          {kind === "role" && !roleUnchanged && t("admin.users.confirm.roleChange", {
            current: user.role_nombre || roleLabel(user.role),
            next: newRoleLabel || newRoleId,
          })}
          {kind === "deactivate" && t("admin.users.confirm.deactivateBody", { name: user.name })}
          {kind === "activate" && t("admin.users.confirm.activateBody", { name: user.name })}
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{roleUnchanged ? t("admin.users.confirm.close") : t("common.cancel")}</button>
          {!roleUnchanged && (
            <button type="button" className={`btn ${kind === "deactivate" ? "btn-danger" : "btn-primary"}`} disabled={pending} onClick={submit}>
              {pending ? t("admin.users.confirm.saving") : kind === "role" ? t("common.save") : kind === "deactivate" ? t("admin.users.confirm.deactivateBtn") : t("admin.users.confirm.activateBtn")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function MembershipModal({ user, onClose, onDone }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [plan, setPlan] = useState(user.plan === "pro" ? "pro" : "basico");

  const submit = async () => {
    setPending(true);
    try {
      await patchAdmin(`users/${user.id}/membership`, { plan });
      onDone();
    } catch {
      onDone("permissions");
    } finally {
      setPending(false);
    }
  };

  const planLabel = (p) => t(p === "pro" ? "admin.users.plan.pro" : "admin.users.plan.basico");

  return (
    <>
      <button type="button" className="modal-backdrop" aria-label={t("common.cancel")} onClick={onClose} />
      <div className="admin-confirm-panel" role="alertdialog" aria-modal="true">
        <div className="admin-confirm-head">
          <span className="admin-confirm-title">{t("admin.users.confirm.planTitle")}</span>
          <span className="admin-confirm-sub">{user.name}</span>
        </div>
        <p className="admin-confirm-body">
          {t("admin.users.confirm.planBody", { name: user.name, next: planLabel(plan) })}
        </p>
        <div style={{ padding: "0 20px 8px" }}>
          <select className="admin-role-select" value={plan} onChange={(e) => setPlan(e.target.value)} style={{ width: "100%" }}>
            <option value="basico">{t("admin.users.plan.basico")}</option>
            <option value="pro">{t("admin.users.plan.pro")}</option>
          </select>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={submit}>
            {pending ? t("admin.users.confirm.saving") : t("admin.users.confirm.planBtn")}
          </button>
        </div>
      </div>
    </>
  );
}

function VendorFeaturesModal({ user, onClose, onDone }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(() => new Set(VENDOR_FEATURE_PERMISSIONS.map((p) => p.key)));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/admin/users/${user.id}/permission-context`, { credentials: "include" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Error");
        const allow = Array.isArray(body.data?.feature_allowlist)
          ? body.data.feature_allowlist
          : VENDOR_FEATURE_PERMISSIONS.map((p) => p.key);
        if (!cancelled) setChecked(new Set(allow));
      })
      .catch(() => {
        const legacy = new Set(user.user_permissions || []);
        if (!cancelled) {
          setChecked(new Set(
            VENDOR_FEATURE_PERMISSIONS
              .filter((p) => legacy.size === 0 || legacy.has(p.key) || p.key.startsWith("herramientas:"))
              .map((p) => p.key),
          ));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user.id, user.user_permissions]);

  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    const features = [...checked];
    try {
      await patchAdmin(`users/${user.id}/features`, { features });
      onDone();
    } catch {
      onDone("permissions");
    } finally {
      setPending(false);
    }
  };

  const toggle = (key) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <>
      <button type="button" className="modal-backdrop" aria-label={t("common.cancel")} onClick={onClose} />
      <div className="admin-confirm-panel admin-perms-modal" role="dialog" aria-modal="true">
        <div className="admin-confirm-head">
          <span className="admin-confirm-title">{t("admin.users.features.title")}</span>
          <span className="admin-confirm-sub">{user.name}</span>
        </div>
        <p className="admin-confirm-body">{t("admin.users.features.hint")}</p>
        {loading ? (
          <p className="admin-confirm-body">{t("admin.users.confirm.saving")}</p>
        ) : (
          <form onSubmit={submit}>
            <div className="admin-perms-grid">
              {VENDOR_FEATURE_PERMISSIONS.map((p) => (
                <label key={p.key} className="admin-perm-item">
                  <input
                    type="checkbox"
                    checked={checked.has(p.key)}
                    onChange={() => toggle(p.key)}
                  />
                  <span>{t(p.labelKey)}</span>
                </label>
              ))}
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
              <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t("admin.users.confirm.saving") : t("admin.users.features.save")}</button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

function PermissionsModal({ user, onClose, onDone }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(() => new Set());

  const toCanonicalSet = (perms) => {
    const expanded = expandAdminPermissionSet(perms);
    return new Set(
      ASSIGNABLE_ADMIN_PERMISSIONS.map((p) => p.key).filter((key) => adminPermissionSetHas(expanded, key)),
    );
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/admin/users/${user.id}/permission-context`, { credentials: "include" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Error");
        const stored = Array.isArray(body.data?.profile?.admin_permissions)
          ? body.data.profile.admin_permissions
          : (user.admin_permissions || []);
        if (!cancelled) setChecked(toCanonicalSet(stored));
      })
      .catch(() => {
        if (!cancelled) setChecked(toCanonicalSet(user.admin_permissions));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user.id, user.admin_permissions]);

  const toggle = (key) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    const permissions = ASSIGNABLE_ADMIN_PERMISSIONS
      .map((p) => p.key)
      .filter((key) => checked.has(key));
    try {
      await patchAdmin(`users/${user.id}/permissions`, { permissions });
      try {
        window.dispatchEvent(new Event("admin:permissions-changed"));
      } catch {
        // ignore
      }
      onDone();
    } catch {
      onDone("permissions");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button type="button" className="modal-backdrop" aria-label={t("common.cancel")} onClick={onClose} />
      <div className="admin-confirm-panel admin-perms-modal" role="dialog" aria-modal="true">
        <div className="admin-confirm-head">
          <span className="admin-confirm-title">{t("admin.users.perms.title")}</span>
          <span className="admin-confirm-sub">{user.name}</span>
        </div>
        {loading ? (
          <p className="admin-confirm-body">{t("admin.users.confirm.saving")}</p>
        ) : (
          <form onSubmit={submit}>
            <p className="admin-confirm-body">{t("admin.users.perms.sectionsHint")}</p>
            <div className="admin-perms-grid">
              {DELEGATABLE_ADMIN_PERMISSIONS.map((p) => (
                <label key={p.key} className="admin-perm-item">
                  <input
                    type="checkbox"
                    checked={checked.has(p.key)}
                    onChange={() => toggle(p.key)}
                  />
                  <span>{t(p.labelKey)}</span>
                </label>
              ))}
            </div>
            <p className="admin-confirm-body" style={{ marginTop: 12 }}>{t("admin.users.perms.exportsHint")}</p>
            <div className="admin-perms-grid">
              {EXPORT_ADMIN_PERMISSIONS.map((p) => (
                <label key={p.key} className="admin-perm-item">
                  <input
                    type="checkbox"
                    checked={checked.has(p.key)}
                    onChange={() => toggle(p.key)}
                  />
                  <span>{t(p.labelKey)}</span>
                </label>
              ))}
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
              <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t("admin.users.confirm.saving") : t("admin.users.perms.save")}</button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

export function AdminUsersPage() {
  const { t } = useI18n();
  const { fmtN } = useMoney();
  const session = useOutletContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [reloadKey, setReloadKey] = useState(0);
  const filters = useMemo(() => parseUserAdminFilters(Object.fromEntries(searchParams.entries())), [searchParams]);
  const backendSearch = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.role) params.set("role", filters.role);
    if (filters.state) params.set("state", filters.state);
    params.set("_", String(reloadKey));
    return `?${params.toString()}`;
  }, [filters.q, filters.role, filters.state, reloadKey]);
  const search = backendSearch;
  const { loading, data, error } = useAdminFetch("users", search);
  const viewerIsSuper = Boolean(
    session?.isSuperAdmin || (session?.profile && isSuperAdmin(session.profile)),
  );
  const profile = session?.profile;
  const permSet = expandAdminPermissionSet(session?.permissions || profile?.admin_permissions || []);
  const canManageUsers = viewerIsSuper || adminPermissionSetHas(permSet, "gestionar_usuarios");
  const canExportUsers = viewerIsSuper || adminPermissionSetHas(permSet, "usuarios.export_csv");
  const { data: rolesData } = useAdminFetch(canManageUsers ? "roles" : null, canManageUsers ? `?_=${reloadKey}` : "");

  const caps = {
    canRole: canManageUsers,
    canDeactivate: canManageUsers,
    canActivate: canManageUsers,
    canPermissions: canManageUsers,
  };

  const assignableRoles = useMemo(() => {
    const list = Array.isArray(rolesData) ? rolesData : [];
    return list.filter((r) => r.slug !== "superadmin");
  }, [rolesData]);

  const confirmKind = searchParams.get("confirm");
  const confirmUserId = searchParams.get("userId");
  const newRoleId = searchParams.get("newRoleId");
  const editPermsId = searchParams.get("editPerms");
  const editFeaturesId = searchParams.get("editFeatures");
  const editMembershipId = searchParams.get("editMembership");
  const editRoleId = searchParams.get("editRole");
  const errorCode = searchParams.get("error");
  const returnTo = `/admin/users${userFiltersToSearchParams(filters)}`;
  const exportHref = `/api/v1/admin/export/users${userFiltersToSearchParams(filters)}`;

  const allUsers = Array.isArray(data) ? data : [];
  const users = filters.plan ? allUsers.filter((user) => (user.plan || "basico") === filters.plan) : allUsers;
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(users.length / pageSize));
  const currentPage = Math.min(filters.page || 1, pageCount);
  const pageUsers = users.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const confirmUser = confirmUserId ? users.find((u) => u.id === confirmUserId) : undefined;
  const permsUser = editPermsId ? users.find((u) => u.id === editPermsId) : undefined;
  const featuresUser = editFeaturesId ? users.find((u) => u.id === editFeaturesId) : undefined;
  const membershipUser = editMembershipId ? users.find((u) => u.id === editMembershipId) : undefined;
  const rolePickerUser = editRoleId ? users.find((u) => u.id === editRoleId) : undefined;
  const newRoleLabel = assignableRoles.find((r) => r.id === newRoleId)?.nombre;

  const planLabel = (p) => t(p === "pro" ? "admin.users.plan.pro" : "admin.users.plan.basico");
  const membershipLabel = (s) => {
    const key = `admin.users.membership.${s || "activa"}`;
    const translated = t(key);
    return translated === key ? (s || "activa") : translated;
  };
  const displayRole = (u) => u.role_nombre || t(ROLE_KEYS[u.role] ?? u.role);

  const refresh = (err) => {
    const url = err ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${err}` : returnTo;
    navigate(url, { replace: true });
    setReloadKey((k) => k + 1);
  };

  const hasActions = caps.canRole || caps.canDeactivate || caps.canActivate || caps.canPermissions;
  const userActions = (user) => {
    const isSelf = user.id === session?.userId;
    const roleReadOnly = !caps.canRole || user.is_super_admin || isSelf;
    return [
      caps.canRole && !roleReadOnly && {
        id: "change-role",
        label: t("admin.users.confirm.roleTitle"),
        icon: <Shield size={15} />,
        disabled: !user.is_active || assignableRoles.length === 0,
        href: userAdminUrl(filters, { editRole: user.id }),
      },
      caps.canRole && (!user.is_super_admin || isSelf) && {
        id: "change-plan",
        label: t("admin.users.action.changePlan"),
        icon: <CreditCard size={15} />,
        href: userAdminUrl(filters, { editMembership: user.id }),
      },
      !isSelf && !user.is_super_admin && caps.canDeactivate && user.is_active && {
        id: "deactivate",
        label: t("admin.users.action.deactivate"),
        icon: <IconUserX size={15} />,
        href: userAdminUrl(filters, { confirm: "deactivate", userId: user.id }),
        danger: true,
      },
      !isSelf && !user.is_super_admin && caps.canActivate && !user.is_active && {
        id: "activate",
        label: t("admin.users.action.activate"),
        icon: <IconUserCheck size={15} />,
        href: userAdminUrl(filters, { confirm: "activate", userId: user.id }),
      },
      caps.canPermissions && user.role === "admin" && !user.is_super_admin && {
        id: "permissions",
        label: t("admin.users.action.permissions"),
        icon: <Shield size={15} />,
        href: userAdminUrl(filters, { editPerms: user.id }),
      },
      caps.canPermissions && !user.is_super_admin && {
        id: "features",
        label: t("admin.users.action.features"),
        icon: <Layers size={15} />,
        href: userAdminUrl(filters, { editFeatures: user.id }),
      },
    ];
  };
  const pageUrl = (page) => userAdminUrl({ ...filters, page: page > 1 ? page : undefined });

  return (
    <div className="admin-page admin-users-enterprise">
      <AdminPageHeader
        eyebrow="Identidad y acceso"
        title={t("admin.users.title")}
        subtitle="Administra cuentas, roles, planes y permisos desde una vista central."
        meta={<><span>{fmtN(users.length)} resultados</span><span>{fmtN(users.filter((user) => user.is_active).length)} activos</span><span>{fmtN(users.filter((user) => user.plan === "pro").length)} PRO</span></>}
      />
      {errorCode && <div className="auth-error" style={{ marginBottom: 16 }}>{t(ERROR_KEYS[errorCode] ?? "admin.users.error.generic")}</div>}
      <AdminUsersFilters filters={filters} exportHref={exportHref} showExport={canExportUsers} />
      <AdminPageState loading={loading} error={error}>
        <AdminDataView empty={!users.length} emptyTitle={t("admin.users.empty")} emptyBody="Prueba limpiando o modificando los filtros activos.">
          <div className="admin-users-data-card">
            <div className="admin-users-table-wrap">
              <table className="client-table admin-users-table admin-users-table--enterprise">
                <thead><tr>
                  <th>{t("admin.users.col.name")}</th><th>{t("admin.users.col.email")}</th><th>{t("admin.users.col.role")}</th>
                  <th>{t("admin.users.col.plan")}</th><th>{t("admin.users.col.status")}</th><th>{t("admin.users.col.lastSeen")}</th>
                  <th>{t("admin.users.col.created")}</th>{hasActions ? <th className="admin-cell-actions">{t("admin.users.col.actions")}</th> : null}
                </tr></thead>
                <tbody>{pageUsers.map((user) => (
                  <tr key={user.id} className={!user.is_active ? "admin-user-row-inactive" : undefined}>
                    <td className="admin-cell-name">{user.name}{viewerIsSuper && user.is_super_admin ? <span className="admin-super-badge">{t("admin.users.badge.super")}</span> : null}</td>
                    <td className="admin-cell-email">{user.email || "—"}</td>
                    <td>{displayRole(user)}</td>
                    <td><AdminStatusBadge tone={user.plan === "pro" ? "info" : "neutral"}>{planLabel(user.plan)}</AdminStatusBadge></td>
                    <td><AdminStatusBadge tone={user.is_active ? "success" : "neutral"}>{user.is_active ? t("admin.users.status.active") : t("admin.users.status.inactive")}</AdminStatusBadge></td>
                    <td className="admin-cell-date admin-cell-muted">{user.last_seen_at ? longDate(String(user.last_seen_at).slice(0, 10)) : t("admin.users.lastSeen.never")}</td>
                    <td className="admin-cell-date">{user.created_at ? longDate(String(user.created_at).slice(0, 10)) : "—"}</td>
                    {hasActions ? <td className="admin-cell-actions"><AdminOverflowMenu label={`${t("admin.users.action.more")}: ${user.name}`} items={userActions(user)} /></td> : null}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="admin-user-cards">
              {pageUsers.map((user) => (
                <article key={user.id} className={!user.is_active ? "is-inactive" : undefined}>
                  <div className="admin-user-card-head">
                    <div className="admin-user-avatar">{(user.name || user.email || "?").slice(0, 2).toUpperCase()}</div>
                    <div><strong>{user.name}</strong><span>{user.email || "—"}</span></div>
                    {hasActions ? <AdminOverflowMenu label={`${t("admin.users.action.more")}: ${user.name}`} items={userActions(user)} /> : null}
                  </div>
                  <div className="admin-user-card-badges"><AdminStatusBadge tone={user.plan === "pro" ? "info" : "neutral"}>{planLabel(user.plan)}</AdminStatusBadge><AdminStatusBadge tone={user.is_active ? "success" : "neutral"}>{user.is_active ? t("admin.users.status.active") : t("admin.users.status.inactive")}</AdminStatusBadge></div>
                  <dl><div><dt>{t("admin.users.col.role")}</dt><dd>{displayRole(user)}</dd></div><div><dt>{t("admin.users.col.lastSeen")}</dt><dd>{user.last_seen_at ? longDate(String(user.last_seen_at).slice(0, 10)) : t("admin.users.lastSeen.never")}</dd></div><div><dt>{t("admin.users.col.created")}</dt><dd>{user.created_at ? longDate(String(user.created_at).slice(0, 10)) : "—"}</dd></div><div><dt>{t("admin.users.col.membership")}</dt><dd>{membershipLabel(user.membership_status)}</dd></div></dl>
                </article>
              ))}
            </div>
            {pageCount > 1 ? <nav className="admin-pagination" aria-label="Paginación"><Link className={`btn btn-ghost${currentPage === 1 ? " disabled" : ""}`} to={pageUrl(currentPage - 1)} aria-disabled={currentPage === 1}>Anterior</Link><span>Página {currentPage} de {pageCount}</span><Link className={`btn btn-ghost${currentPage === pageCount ? " disabled" : ""}`} to={pageUrl(currentPage + 1)} aria-disabled={currentPage === pageCount}>Siguiente</Link></nav> : null}
          </div>
        </AdminDataView>
      </AdminPageState>
      {rolePickerUser && caps.canRole && !rolePickerUser.is_super_admin && rolePickerUser.id !== session?.userId ? (
        <RolePickerModal
          user={rolePickerUser}
          roles={assignableRoles}
          onClose={() => navigate(returnTo, { replace: true })}
          onContinue={(roleId) => navigate(userAdminUrl(filters, { confirm: "role", userId: rolePickerUser.id, newRoleId: roleId }))}
        />
      ) : null}
      {confirmUser && ["role", "deactivate", "activate"].includes(confirmKind) && !confirmUser.is_super_admin && (
        <ConfirmModal
          kind={confirmKind}
          user={confirmUser}
          newRoleId={newRoleId ?? confirmUser.role_id}
          newRoleLabel={newRoleLabel}
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
      {featuresUser && caps.canPermissions && !featuresUser.is_super_admin && (
        <VendorFeaturesModal
          user={featuresUser}
          onClose={() => navigate(returnTo, { replace: true })}
          onDone={(err) => refresh(err)}
        />
      )}
      {membershipUser && caps.canRole && (!membershipUser.is_super_admin || membershipUser.id === session?.userId) && (
        <MembershipModal
          user={membershipUser}
          onClose={() => navigate(returnTo, { replace: true })}
          onDone={(err) => {
            if (!err && membershipUser.id === session?.userId) {
              notifyAuthChanged();
            }
            refresh(err);
          }}
        />
      )}
    </div>
  );
}
