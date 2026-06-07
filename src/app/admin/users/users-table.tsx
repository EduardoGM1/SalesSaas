import Link from "next/link";
import { userAdminUrl } from "@/lib/admin/filters";
import { fmt, fmtN } from "@/lib/format/money";
import { longDate } from "@/lib/format/dates";
import type { UserAdminFilters, UsersTableRow } from "@/lib/admin/types";
import { IconSave, IconUserCheck, IconUserX } from "./users-icons";

const ROLES = [
  { value: "vendedor", label: "Vendedor" },
  { value: "admin", label: "Admin" },
] as const;

export type UserTableCaps = {
  canRole: boolean;
  canDeactivate: boolean;
  canActivate: boolean;
  canPermissions: boolean;
};

function FilterFields({ filters }: { filters: UserAdminFilters }) {
  return (
    <>
      {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
      {filters.role ? <input type="hidden" name="role" value={filters.role} /> : null}
      {filters.state ? <input type="hidden" name="state" value={filters.state} /> : null}
    </>
  );
}

export function AdminUsersTable({
  users,
  filters,
  currentUserId,
  caps,
}: {
  users: UsersTableRow[];
  filters: UserAdminFilters;
  currentUserId?: string;
  caps: UserTableCaps;
}) {
  const hasActions = caps.canRole || caps.canDeactivate || caps.canActivate || caps.canPermissions;

  return (
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
          const isSelf = u.id === currentUserId;
          const formId = `user-role-${u.id}`;
          const roleReadOnly = !caps.canRole || u.is_super_admin || isSelf;

          return (
            <tr key={u.id} className={!u.is_active ? "admin-user-row-inactive" : undefined}>
              <td>
                {u.name}
                {u.is_super_admin && <span className="admin-super-badge">Principal</span>}
              </td>
              <td>{u.email ?? "—"}</td>
              <td>
                {roleReadOnly ? (
                  <span className="admin-role-readonly">
                    {ROLES.find((r) => r.value === u.role)?.label ?? u.role}
                  </span>
                ) : (
                  <select
                    form={formId}
                    name="newRole"
                    defaultValue={u.role}
                    className="admin-role-select"
                    disabled={!u.is_active}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td>
                <span
                  className={`admin-status-badge ${u.is_active ? "admin-status-active" : "admin-status-inactive"}`}
                >
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
                      <form id={formId} method="GET" action="/admin/users">
                        <FilterFields filters={filters} />
                        <input type="hidden" name="confirm" value="role" />
                        <input type="hidden" name="userId" value={u.id} />
                        <button
                          type="submit"
                          className="icon-btn"
                          title="Guardar rol"
                          disabled={!u.is_active}
                        >
                          <IconSave />
                        </button>
                      </form>
                    )}
                    {!isSelf && !u.is_super_admin && caps.canDeactivate && u.is_active && (
                      <Link
                        href={userAdminUrl(filters, { confirm: "deactivate", userId: u.id })}
                        className="icon-btn admin-icon-btn-danger"
                        title="Desactivar cuenta"
                      >
                        <IconUserX />
                      </Link>
                    )}
                    {!isSelf && !u.is_super_admin && caps.canActivate && !u.is_active && (
                      <Link
                        href={userAdminUrl(filters, { confirm: "activate", userId: u.id })}
                        className="icon-btn"
                        title="Activar cuenta"
                      >
                        <IconUserCheck />
                      </Link>
                    )}
                    {caps.canPermissions && u.role === "admin" && !u.is_super_admin && (
                      <Link
                        href={userAdminUrl(filters, { editPerms: u.id })}
                        className="btn btn-sm btn-ghost"
                        title="Editar permisos"
                      >
                        Permisos
                      </Link>
                    )}
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
