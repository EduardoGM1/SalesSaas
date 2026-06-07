import { getUsers } from "@/lib/admin/data";
import { parseUserAdminFilters, userFiltersToSearchParams } from "@/lib/admin/filters";
import { requireAdminPermission } from "@/lib/admin/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { AdminUsersFilters } from "@/components/admin/admin-users-filters";
import { AdminUsersTable } from "./users-table";
import { AdminUsersConfirmModal } from "./users-confirm-modal";
import { AdminUsersPermissionsModal } from "./users-permissions-modal";
import type { UsersTableRow } from "@/lib/admin/types";
import { fmtN } from "@/lib/format/money";

const ERRORS: Record<string, string> = {
  invalid: "Datos inválidos.",
  "self-role": "No puedes quitarte el rol de administrador.",
  role: "No se pudo actualizar el rol.",
  "self-status": "No puedes desactivar tu propia cuenta.",
  status: "No se pudo actualizar el estado.",
  permissions: "No se pudieron guardar los permisos.",
};

const CONFIRM_KINDS = new Set(["role", "deactivate", "activate"]);

const CONFIRM_PERM: Record<string, string> = {
  role: "users:role",
  deactivate: "users:deactivate",
  activate: "users:activate",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { profile } = await requireAdminPermission("users:read");
  const sp = await searchParams;
  const filters = parseUserAdminFilters(sp);
  const [users] = await Promise.all([getUsers(filters)]);

  const rows: UsersTableRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    is_active: u.is_active,
    is_super_admin: u.is_super_admin,
    admin_permissions: u.admin_permissions,
    created_at: u.created_at,
    prospects: u.prospects,
    sales: u.sales,
    volume: u.volume,
  }));

  const caps = {
    canRole: hasPermission(profile, "users:role"),
    canDeactivate: hasPermission(profile, "users:deactivate"),
    canActivate: hasPermission(profile, "users:activate"),
    canPermissions: hasPermission(profile, "users:permissions"),
  };

  const returnTo = `/admin/users${userFiltersToSearchParams(filters)}`;
  const cancelHref = returnTo;
  const exportHref = `/admin/export/users${userFiltersToSearchParams(filters)}`;
  const hasFilters = Boolean(filters.q || filters.role || filters.state);
  const errorCode = typeof sp.error === "string" ? sp.error : undefined;
  const errorMsg = errorCode ? ERRORS[errorCode] ?? "Ocurrió un error." : null;

  const confirmRaw = typeof sp.confirm === "string" ? sp.confirm : undefined;
  const confirmKind = confirmRaw && CONFIRM_KINDS.has(confirmRaw)
    ? (confirmRaw as "role" | "deactivate" | "activate")
    : undefined;
  const confirmUserId = typeof sp.userId === "string" ? sp.userId : undefined;
  const newRole = typeof sp.newRole === "string" ? sp.newRole : undefined;
  const confirmUser = confirmUserId ? rows.find((r) => r.id === confirmUserId) : undefined;
  const canConfirm = confirmKind && confirmUser && hasPermission(profile, CONFIRM_PERM[confirmKind]);
  const confirmBlocked =
    confirmKind === "deactivate" && confirmUser?.is_super_admin
      || confirmKind === "role" && confirmUser?.is_super_admin;

  const editPermsId = typeof sp.editPerms === "string" ? sp.editPerms : undefined;
  const permsUser = editPermsId ? rows.find((r) => r.id === editPermsId) : undefined;
  const canEditPerms =
    caps.canPermissions
    && permsUser
    && permsUser.role === "admin"
    && !permsUser.is_super_admin;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">Usuarios</h1>
        <p className="admin-sub">
          {fmtN(rows.length)} cuenta(s){hasFilters ? " con estos filtros" : " registradas"}.
        </p>
      </div>

      {errorMsg && <div className="auth-error" style={{ marginBottom: 16 }}>{errorMsg}</div>}

      <AdminUsersFilters
        filters={filters}
        exportHref={exportHref}
        showExport={hasPermission(profile, "users:export")}
      />

      <div className="client-table-card">
        {rows.length === 0 ? (
          <div className="admin-empty">
            {hasFilters ? "Sin usuarios que coincidan con los filtros." : "Sin usuarios."}
          </div>
        ) : (
          <AdminUsersTable users={rows} filters={filters} currentUserId={profile.id} caps={caps} />
        )}
      </div>

      {canConfirm && !confirmBlocked && (
        <AdminUsersConfirmModal
          kind={confirmKind}
          userId={confirmUser.id}
          userName={confirmUser.name}
          currentRole={confirmUser.role}
          newRole={confirmKind === "role" ? newRole : undefined}
          returnTo={returnTo}
          cancelHref={cancelHref}
        />
      )}

      {canEditPerms && (
        <AdminUsersPermissionsModal
          userId={permsUser.id}
          userName={permsUser.name}
          currentPermissions={permsUser.admin_permissions}
          returnTo={returnTo}
          cancelHref={returnTo}
        />
      )}
    </div>
  );
}
