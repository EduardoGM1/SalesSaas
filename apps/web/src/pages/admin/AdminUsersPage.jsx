import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { AdminOverflowMenu } from "@/components/admin/admin-overflow-menu.jsx";
import { AdminUsersFilters } from "@/components/admin/admin-users-filters.jsx";
import { IconSave, IconUserCheck, IconUserX } from "@/components/admin/admin-users-icons.jsx";
import { CreditCard, Layers, Shield } from "lucide-react";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import {
  adminPermissionSetHas,
  canViewUserFinancialMetrics,
  DELEGATABLE_ADMIN_PERMISSIONS,
  expandAdminPermissionSet,
  isSuperAdmin,
} from "@/lib/auth/permissions";
import { parseUserAdminFilters, userAdminUrl, userFiltersToSearchParams } from "@/lib/admin/filters";
import { VENDOR_FEATURE_PERMISSIONS } from "@/lib/auth/user-features";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { longDate } from "@/lib/format/dates";
import { notifyAuthChanged } from "@/lib/session-api.js";

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
  const current = expandAdminPermissionSet(user.admin_permissions);

  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const permissions = fd.getAll("permissions").map(String);
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
        <form onSubmit={submit}>
          <div className="admin-perms-grid">
            {DELEGATABLE_ADMIN_PERMISSIONS.map((p) => (
              <label key={p.key} className="admin-perm-item">
                <input
                  type="checkbox"
                  name="permissions"
                  value={p.key}
                  defaultChecked={adminPermissionSetHas(current, p.key)}
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
      </div>
    </>
  );
}

export function AdminUsersPage() {
  const { t } = useI18n();
  const { fmt, fmtN } = useMoney();
  const session = useOutletContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [reloadKey, setReloadKey] = useState(0);
  const filters = useMemo(() => parseUserAdminFilters(Object.fromEntries(searchParams.entries())), [searchParams]);
  const qs = searchParams.toString();
  const search = qs ? `?${qs}&_=${reloadKey}` : `?_=${reloadKey}`;
  const { loading, data, error } = useAdminFetch("users", search);
  const viewerIsSuper = Boolean(
    session?.isSuperAdmin || (session?.profile && isSuperAdmin(session.profile)),
  );
  const profile = session?.profile;
  const permSet = expandAdminPermissionSet(session?.permissions || profile?.admin_permissions || []);
  const canManageUsers = viewerIsSuper || adminPermissionSetHas(permSet, "gestionar_usuarios");
  const showUserMetrics = canViewUserFinancialMetrics({
    isSuperAdmin: viewerIsSuper,
    permissions: session?.permissions || [],
  });
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
  const errorCode = searchParams.get("error");
  const returnTo = `/admin/users${userFiltersToSearchParams(filters)}`;
  const exportHref = `/api/v1/admin/export/users${userFiltersToSearchParams(filters)}`;

  const users = data ?? [];
  const confirmUser = confirmUserId ? users.find((u) => u.id === confirmUserId) : undefined;
  const permsUser = editPermsId ? users.find((u) => u.id === editPermsId) : undefined;
  const featuresUser = editFeaturesId ? users.find((u) => u.id === editFeaturesId) : undefined;
  const membershipUser = editMembershipId ? users.find((u) => u.id === editMembershipId) : undefined;
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
      <AdminUsersFilters filters={filters} exportHref={exportHref} showExport={canManageUsers} />
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
                <th>{t("admin.users.col.plan")}</th>
                <th>{t("admin.users.col.membership")}</th>
                <th>{t("admin.users.col.status")}</th>
                {showUserMetrics && (
                  <>
                    <th style={{ textAlign: "right" }}>{t("admin.users.col.files")}</th>
                    <th style={{ textAlign: "right" }}>{t("admin.users.col.sales")}</th>
                    <th style={{ textAlign: "right" }}>{t("admin.users.col.volume")}</th>
                  </>
                )}
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
                    <td className="admin-cell-name" title={u.name}>
                      {u.name}
                      {viewerIsSuper && u.is_super_admin ? (
                        <span className="admin-super-badge">{t("admin.users.badge.super")}</span>
                      ) : null}
                    </td>
                    <td className="admin-cell-email" title={u.email ?? undefined}>{u.email ?? "—"}</td>
                    <td className="admin-cell-role">
                      {roleReadOnly ? (
                        <span className="admin-role-readonly">{displayRole(u)}</span>
                      ) : (
                        <select
                          form={formId}
                          name="newRoleId"
                          defaultValue={u.role_id || ""}
                          className="admin-role-select"
                          disabled={!u.is_active || assignableRoles.length === 0}
                        >
                          {assignableRoles.map((r) => (
                            <option key={r.id} value={r.id}>{r.nombre}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="admin-cell-role">
                      <span className={`admin-status-badge ${u.plan === "pro" ? "admin-status-active" : "admin-status-inactive"}`}>
                        {planLabel(u.plan)}
                      </span>
                    </td>
                    <td className="admin-cell-muted">{membershipLabel(u.membership_status)}</td>
                    <td className="admin-cell-status">
                      <span className={`admin-status-badge ${u.is_active ? "admin-status-active" : "admin-status-inactive"}`}>
                        {u.is_active ? t("admin.users.status.active") : t("admin.users.status.inactive")}
                      </span>
                    </td>
                    {showUserMetrics && (
                      <>
                        <td className="admin-cell-num" style={{ textAlign: "right" }}>{fmtN(u.prospects)}</td>
                        <td className="admin-cell-num" style={{ textAlign: "right" }}>{fmtN(u.sales)}</td>
                        <td className="admin-cell-num" style={{ textAlign: "right" }}>{fmt(u.volume)}</td>
                      </>
                    )}
                    <td className="admin-cell-date">{u.created_at ? longDate(String(u.created_at).slice(0, 10)) : "—"}</td>
                    {hasActions && (
                      <td className="admin-cell-actions">
                        <div className="admin-table-actions">
                          {caps.canRole && !roleReadOnly ? (
                            <form
                              id={formId}
                              className="admin-overflow-role-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const fd = new FormData(e.currentTarget);
                                navigate(userAdminUrl(filters, {
                                  confirm: "role",
                                  userId: u.id,
                                  newRoleId: fd.get("newRoleId"),
                                }));
                              }}
                            >
                              <button type="submit" tabIndex={-1} aria-hidden="true" />
                            </form>
                          ) : null}
                          <AdminOverflowMenu
                            label={t("admin.users.action.more")}
                            items={[
                              caps.canRole && !roleReadOnly && {
                                id: "save-role",
                                label: t("admin.users.action.saveRole"),
                                icon: <IconSave size={15} />,
                                disabled: !u.is_active,
                                onSelect: () => {
                                  const form = document.getElementById(formId);
                                  if (form instanceof HTMLFormElement) form.requestSubmit();
                                },
                              },
                              caps.canRole && (!u.is_super_admin || isSelf) && {
                                id: "change-plan",
                                label: t("admin.users.action.changePlan"),
                                icon: <CreditCard size={15} />,
                                href: userAdminUrl(filters, { editMembership: u.id }),
                              },
                              !isSelf && !u.is_super_admin && caps.canDeactivate && u.is_active && {
                                id: "deactivate",
                                label: t("admin.users.action.deactivate"),
                                icon: <IconUserX size={15} />,
                                href: userAdminUrl(filters, { confirm: "deactivate", userId: u.id }),
                                danger: true,
                              },
                              !isSelf && !u.is_super_admin && caps.canActivate && !u.is_active && {
                                id: "activate",
                                label: t("admin.users.action.activate"),
                                icon: <IconUserCheck size={15} />,
                                href: userAdminUrl(filters, { confirm: "activate", userId: u.id }),
                              },
                              caps.canPermissions && u.role === "admin" && !u.is_super_admin && {
                                id: "permissions",
                                label: t("admin.users.action.permissions"),
                                icon: <Shield size={15} />,
                                href: userAdminUrl(filters, { editPerms: u.id }),
                              },
                              caps.canPermissions && !u.is_super_admin && {
                                id: "features",
                                label: t("admin.users.action.features"),
                                icon: <Layers size={15} />,
                                href: userAdminUrl(filters, { editFeatures: u.id }),
                              },
                            ]}
                          />
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
