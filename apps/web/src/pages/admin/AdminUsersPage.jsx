import { useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { AdminUsersFilters } from "@/components/admin/admin-users-filters.jsx";
import { IconSave, IconUserCheck, IconUserX } from "@/components/admin/admin-users-icons.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { hasPermission } from "@/lib/auth/permissions";
import { parseUserAdminFilters, userAdminUrl, userFiltersToSearchParams } from "@/lib/admin/filters";
import { DELEGATABLE_ADMIN_PERMISSIONS } from "@/lib/auth/permissions";
import { VENDOR_FEATURE_PERMISSIONS } from "@/lib/auth/user-features";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { longDate } from "@/lib/format/dates";

const ROLE_KEYS = { vendedor: "admin.users.role.seller", gerente: "admin.users.role.manager", admin: "admin.users.role.admin" };
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

function ConfirmModal({ kind, user, newRole, onClose, onDone }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const roleUnchanged = kind === "role" && user.role === newRole;
  const roleLabel = (r) => t(ROLE_KEYS[r] ?? r);

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
          {kind === "role" && !roleUnchanged && t("admin.users.confirm.roleChange", { current: roleLabel(user.role), next: roleLabel(newRole) })}
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

function VendorFeaturesModal({ user, onClose, onDone }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const current = new Set(user.user_permissions || []);

  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const features = fd.getAll("features").map(String);
    if (!features.length) return;
    const payload = features.length === VENDOR_FEATURE_PERMISSIONS.length ? [] : features;
    try {
      await patchAdmin(`users/${user.id}/features`, { features: payload });
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
          <span className="admin-confirm-title">{t("admin.users.features.title")}</span>
          <span className="admin-confirm-sub">{user.name}</span>
        </div>
        <p className="admin-confirm-body">{t("admin.users.features.hint")}</p>
        <form onSubmit={submit}>
          <div className="admin-perms-grid">
            {VENDOR_FEATURE_PERMISSIONS.map((p) => (
              <label key={p.key} className="admin-perm-item">
                <input type="checkbox" name="features" value={p.key} defaultChecked={current.size === 0 || current.has(p.key)} />
                <span>{t(p.labelKey)}</span>
              </label>
            ))}
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t("admin.users.confirm.saving") : t("admin.users.features.save")}</button>
          </div>
        </form>
      </div>
    </>
  );
}

function PermissionsModal({ user, onClose, onDone }) {
  const { t } = useI18n();
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
      <button type="button" className="modal-backdrop" aria-label={t("common.cancel")} onClick={onClose} />
      <div className="admin-confirm-panel admin-perms-modal" role="dialog" aria-modal="true">
        <div className="admin-confirm-head">
          <span className="admin-confirm-title">{t("admin.users.perms.title")}</span>
          <span className="admin-confirm-sub">{user.name}</span>
        </div>
        <form onSubmit={submit}>
          <div className="admin-perms-grid">
            {DELEGATABLE_ADMIN_PERMISSIONS.map((p) => (
              <label key={p.key} className="admin-perm-item">
                <input type="checkbox" name="permissions" value={p.key} defaultChecked={current.has(p.key)} />
                <span>{t(p.labelKey)}</span>
              </label>
            ))}
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t("admin.users.confirm.saving") : t("admin.users.perms.save")}</button>
          </div>
        </form>
      </div>
    </>
  );
}

export function AdminUsersPage() {
  const { t } = useI18n();
  const { fmt, fmtN } = useMoney();
  const roles = [
    { value: "vendedor", label: t("admin.users.role.seller") },
    { value: "admin", label: t("admin.users.role.admin") },
  ];
  const roleLabel = (r) => t(ROLE_KEYS[r] ?? r);
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
  const editFeaturesId = searchParams.get("editFeatures");
  const errorCode = searchParams.get("error");
  const returnTo = `/admin/users${userFiltersToSearchParams(filters)}`;
  const exportHref = `/api/v1/admin/export/users${userFiltersToSearchParams(filters)}`;

  const users = data ?? [];
  const confirmUser = confirmUserId ? users.find((u) => u.id === confirmUserId) : undefined;
  const permsUser = editPermsId ? users.find((u) => u.id === editPermsId) : undefined;
  const featuresUser = editFeaturesId ? users.find((u) => u.id === editFeaturesId) : undefined;

  const refresh = (err) => {
    const url = err ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${err}` : returnTo;
    navigate(url, { replace: true });
    setReloadKey((k) => k + 1);
  };

  if (loading) return <div className="admin-page">{t("admin.loading.users")}</div>;
  if (error) return <div className="admin-page admin-empty">{error}</div>;

  const hasActions = caps.canRole || caps.canDeactivate || caps.canActivate || caps.canPermissions;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">{t("admin.users.title")}</h1>
        <p className="admin-sub">{t("admin.users.sub", { count: fmtN(users.length) })}</p>
      </div>
      {errorCode && <div className="auth-error" style={{ marginBottom: 16 }}>{t(ERROR_KEYS[errorCode] ?? "admin.users.error.generic")}</div>}
      <AdminUsersFilters filters={filters} exportHref={exportHref} showExport={hasPermission(profile, "users:export")} />
      <div className="client-table-card">
        {users.length === 0 ? (
          <div className="admin-empty">{t("admin.users.empty")}</div>
        ) : (
          <table className="client-table admin-users-table">
            <thead>
              <tr>
                <th>{t("admin.users.col.name")}</th>
                <th>{t("admin.users.col.email")}</th>
                <th>{t("admin.users.col.role")}</th>
                <th>{t("admin.users.col.status")}</th>
                <th style={{ textAlign: "right" }}>{t("admin.users.col.files")}</th>
                <th style={{ textAlign: "right" }}>{t("admin.users.col.sales")}</th>
                <th style={{ textAlign: "right" }}>{t("admin.users.col.volume")}</th>
                <th>{t("admin.users.col.created")}</th>
                {hasActions && <th className="admin-cell-actions">{t("admin.users.col.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === session?.userId;
                const formId = `user-role-${u.id}`;
                const roleReadOnly = !caps.canRole || u.is_super_admin || isSelf;
                return (
                  <tr key={u.id} className={!u.is_active ? "admin-user-row-inactive" : undefined}>
                    <td className="admin-cell-name" title={u.name}>{u.name}{u.is_super_admin && <span className="admin-super-badge">{t("admin.users.badge.super")}</span>}</td>
                    <td className="admin-cell-email" title={u.email ?? undefined}>{u.email ?? "—"}</td>
                    <td className="admin-cell-role">
                      {roleReadOnly ? (
                        <span className="admin-role-readonly">{roleLabel(u.role)}</span>
                      ) : (
                        <select form={formId} name="newRole" defaultValue={u.role} className="admin-role-select" disabled={!u.is_active}>
                          {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="admin-cell-status">
                      <span className={`admin-status-badge ${u.is_active ? "admin-status-active" : "admin-status-inactive"}`}>
                        {u.is_active ? t("admin.users.status.active") : t("admin.users.status.inactive")}
                      </span>
                    </td>
                    <td className="admin-cell-num" style={{ textAlign: "right" }}>{fmtN(u.prospects)}</td>
                    <td className="admin-cell-num" style={{ textAlign: "right" }}>{fmtN(u.sales)}</td>
                    <td className="admin-cell-num" style={{ textAlign: "right" }}>{fmt(u.volume)}</td>
                    <td className="admin-cell-date">{u.created_at ? longDate(String(u.created_at).slice(0, 10)) : "—"}</td>
                    {hasActions && (
                      <td className="admin-cell-actions">
                        <div className="admin-table-actions">
                          {caps.canRole && !roleReadOnly && (
                            <form id={formId} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); navigate(userAdminUrl(filters, { confirm: "role", userId: u.id, newRole: fd.get("newRole") })); }}>
                              <button type="submit" className="icon-btn" title={t("admin.users.action.saveRole")} disabled={!u.is_active}><IconSave /></button>
                            </form>
                          )}
                          {!isSelf && !u.is_super_admin && caps.canDeactivate && u.is_active && (
                            <Link to={userAdminUrl(filters, { confirm: "deactivate", userId: u.id })} className="icon-btn admin-icon-btn-danger" title={t("admin.users.action.deactivate")}><IconUserX /></Link>
                          )}
                          {!isSelf && !u.is_super_admin && caps.canActivate && !u.is_active && (
                            <Link to={userAdminUrl(filters, { confirm: "activate", userId: u.id })} className="icon-btn" title={t("admin.users.action.activate")}><IconUserCheck /></Link>
                          )}
                          {caps.canPermissions && u.role === "admin" && !u.is_super_admin && (
                            <Link to={userAdminUrl(filters, { editPerms: u.id })} className="btn btn-sm btn-ghost">{t("admin.users.action.permissions")}</Link>
                          )}
                          {caps.canPermissions && u.role !== "admin" && !u.is_super_admin && (
                            <Link to={userAdminUrl(filters, { editFeatures: u.id })} className="btn btn-sm btn-ghost">{t("admin.users.action.features")}</Link>
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
      {featuresUser && caps.canPermissions && featuresUser.role !== "admin" && !featuresUser.is_super_admin && (
        <VendorFeaturesModal
          user={featuresUser}
          onClose={() => navigate(returnTo, { replace: true })}
          onDone={(err) => refresh(err)}
        />
      )}
    </div>
  );
}
