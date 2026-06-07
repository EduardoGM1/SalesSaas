import Link from "next/link";
import { setUserActive, updateUserRole } from "./actions";

const ROLE_LABELS: Record<string, string> = {
  vendedor: "Vendedor",
  gerente: "Gerente",
  admin: "Admin",
};

function roleLabel(value: string): string {
  return ROLE_LABELS[value] ?? value;
}

export function AdminUsersConfirmModal({
  kind,
  userId,
  userName,
  currentRole,
  newRole,
  returnTo,
  cancelHref,
}: {
  kind: "role" | "deactivate" | "activate";
  userId: string;
  userName: string;
  currentRole?: string;
  newRole?: string;
  returnTo: string;
  cancelHref: string;
}) {
  const roleUnchanged = kind === "role" && currentRole === newRole;

  return (
    <>
      <Link href={cancelHref} className="modal-backdrop" aria-label="Cancelar" tabIndex={-1} />
      <div className="admin-confirm-panel" role="alertdialog" aria-modal="true">
        <div className="admin-confirm-head">
          <span className="admin-confirm-title">
            {kind === "role" && (roleUnchanged ? "Sin cambios de rol" : "¿Guardar cambios de rol?")}
            {kind === "deactivate" && "¿Desactivar esta cuenta?"}
            {kind === "activate" && "¿Activar esta cuenta?"}
          </span>
          <span className="admin-confirm-sub">{userName}</span>
        </div>
        <p className="admin-confirm-body">
          {kind === "role" && roleUnchanged && (
            <>El rol seleccionado es el mismo que el actual (<strong>{roleLabel(currentRole ?? "")}</strong>).</>
          )}
          {kind === "role" && !roleUnchanged && (
            <>
              Vas a cambiar el rol de <strong>{userName}</strong>.
              <br />
              Rol actual: <strong>{roleLabel(currentRole ?? "")}</strong>
              <br />
              Nuevo rol: <strong>{roleLabel(newRole ?? "")}</strong>
            </>
          )}
          {kind === "deactivate" && (
            <>
              <strong>{userName}</strong> no podrá iniciar sesión. Sus expedientes, ventas y datos se conservan; la
              cuenta no se elimina.
            </>
          )}
          {kind === "activate" && (
            <>
              <strong>{userName}</strong> podrá volver a iniciar sesión con su correo y contraseña.
            </>
          )}
        </p>
        <div className="btn-row">
          <Link href={cancelHref} className="btn btn-ghost">
            {roleUnchanged ? "Cerrar" : "Cancelar"}
          </Link>
          {!roleUnchanged && (
            <form
              action={kind === "role" ? updateUserRole : setUserActive}
              style={{ display: "inline" }}
            >
              <input type="hidden" name="userId" value={userId} />
              {kind === "role" ? (
                <>
                  <input type="hidden" name="role" value={newRole ?? ""} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                </>
              ) : (
                <>
                  <input type="hidden" name="is_active" value={kind === "activate" ? "true" : "false"} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                </>
              )}
              <button
                type="submit"
                className={`btn ${kind === "deactivate" ? "btn-danger" : "btn-primary"}`}
              >
                {kind === "role" ? "Guardar" : kind === "deactivate" ? "Desactivar" : "Activar"}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
