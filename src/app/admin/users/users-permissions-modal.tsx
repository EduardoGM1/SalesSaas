import Link from "next/link";
import { DELEGATABLE_ADMIN_PERMISSIONS } from "@/lib/auth/permissions";
import { updateUserPermissions } from "./actions";

export function AdminUsersPermissionsModal({
  userId,
  userName,
  currentPermissions,
  returnTo,
  cancelHref,
}: {
  userId: string;
  userName: string;
  currentPermissions: string[];
  returnTo: string;
  cancelHref: string;
}) {
  const current = new Set(currentPermissions);

  return (
    <>
      <Link href={cancelHref} className="modal-backdrop" aria-label="Cerrar" tabIndex={-1} />
      <div className="admin-confirm-panel admin-perms-modal" role="dialog" aria-modal="true">
        <div className="admin-confirm-head">
          <span className="admin-confirm-title">Permisos de administrador</span>
          <span className="admin-confirm-sub">{userName}</span>
        </div>
        <p className="admin-confirm-body">
          Este usuario tiene rol <strong>Admin</strong> pero acceso limitado. Marca solo lo que necesite.
          Cambiar roles y promover admins sigue siendo exclusivo del administrador principal.
        </p>
        <form action={updateUserPermissions}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="admin-perms-grid">
            {DELEGATABLE_ADMIN_PERMISSIONS.map((p) => (
              <label key={p.key} className="admin-perm-item">
                <input type="checkbox" name="permissions" value={p.key} defaultChecked={current.has(p.key)} />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
          <div className="btn-row">
            <Link href={cancelHref} className="btn btn-ghost">Cancelar</Link>
            <button type="submit" className="btn btn-primary">Guardar permisos</button>
          </div>
        </form>
      </div>
    </>
  );
}
