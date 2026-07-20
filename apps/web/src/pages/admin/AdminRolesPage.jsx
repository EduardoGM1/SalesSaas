import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { hasPermission } from "@/lib/auth/permissions";
import { permissionsByModule } from "@salesapp/shared/auth/permission-catalog.js";
import { useI18n } from "@/hooks/use-i18n.js";

async function adminJson(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/v1/admin/${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Error");
  return data.data ?? data;
}

function RoleEditor({ role, modules, onClose, onSaved }) {
  const { t } = useI18n();
  const isNew = !role?.id;
  const [nombre, setNombre] = useState(role?.nombre ?? "");
  const [keys, setKeys] = useState(() => new Set(role?.permission_keys ?? []));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const toggle = (clave) => {
    setKeys((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const permission_keys = [...keys];
      if (isNew) {
        await adminJson("roles", { method: "POST", body: { nombre, permission_keys } });
      } else {
        await adminJson(`roles/${role.id}`, {
          method: "PATCH",
          body: { nombre: role.es_sistema ? undefined : nombre, permission_keys },
        });
      }
      try {
        window.dispatchEvent(new Event("admin:permissions-changed"));
      } catch {
        // ignore
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.roles.error.save"));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button type="button" className="modal-backdrop" aria-label={t("common.cancel")} onClick={onClose} />
      <div className="admin-confirm-panel admin-perms-modal" role="dialog" aria-modal="true" style={{ maxWidth: 560 }}>
        <div className="admin-confirm-head">
          <span className="admin-confirm-title">
            {isNew ? t("admin.roles.createTitle") : t("admin.roles.editTitle")}
          </span>
          {role?.es_sistema && <span className="admin-super-badge">{t("admin.roles.badge.system")}</span>}
        </div>
        <form onSubmit={submit}>
          <div style={{ padding: "0 20px 12px" }}>
            <label className="admin-confirm-sub" htmlFor="role-nombre">{t("admin.roles.field.name")}</label>
            <input
              id="role-nombre"
              className="admin-role-select"
              style={{ width: "100%", marginTop: 6 }}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={role?.es_sistema === true}
              required={isNew || !role?.es_sistema}
            />
          </div>
          <div className="admin-confirm-body" style={{ maxHeight: 360, overflow: "auto" }}>
            {modules.map((mod) => (
              <div key={mod.id} style={{ marginBottom: 16 }}>
                <div className="section-label" style={{ marginBottom: 8 }}>{mod.label}</div>
                <div className="admin-perms-grid">
                  {mod.permissions.map((p) => (
                    <label key={p.clave} className="admin-perm-item">
                      <input
                        type="checkbox"
                        checked={keys.has(p.clave)}
                        onChange={() => toggle(p.clave)}
                        disabled={role?.slug === "superadmin"}
                      />
                      <span>{p.nombre_visible}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {error && <div className="auth-error" style={{ margin: "0 20px 12px" }}>{error}</div>}
          <div className="btn-row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
            {role?.slug !== "superadmin" && (
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? t("admin.users.confirm.saving") : t("common.save")}
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

export function AdminRolesPage() {
  const { t } = useI18n();
  const session = useOutletContext();
  const [reloadKey, setReloadKey] = useState(0);
  const [editor, setEditor] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const { loading, data, error } = useAdminFetch("roles", `?_=${reloadKey}`);
  const modules = useMemo(() => permissionsByModule(), []);

  if (!hasPermission(session?.profile, "admin:roles")) {
    return <div className="admin-page admin-empty">{t("admin.roles.forbidden")}</div>;
  }

  const roles = Array.isArray(data) ? data : [];
  const refresh = () => {
    setEditor(null);
    setReloadKey((k) => k + 1);
  };

  const removeRole = async (role) => {
    if (role.es_sistema) return;
    if (!window.confirm(t("admin.roles.confirmDelete", { name: role.nombre }))) return;
    setBusyId(role.id);
    try {
      await adminJson(`roles/${role.id}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t("admin.roles.error.delete"));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="admin-page">{t("admin.loading.roles")}</div>;
  if (error) return <div className="admin-page admin-empty">{error}</div>;

  return (
    <div className="admin-page">
      <div className="admin-page-head" style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <h1 className="admin-h1">{t("admin.roles.title")}</h1>
          <p className="admin-sub">{t("admin.roles.sub")}</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditor({ permission_keys: [] })}>
          {t("admin.roles.create")}
        </button>
      </div>
      <div className="client-table-card">
        {roles.length === 0 ? (
          <div className="admin-empty">{t("admin.roles.empty")}</div>
        ) : (
          <table className="client-table admin-users-table">
            <thead>
              <tr>
                <th>{t("admin.roles.col.name")}</th>
                <th>{t("admin.roles.col.slug")}</th>
                <th>{t("admin.roles.col.type")}</th>
                <th style={{ textAlign: "right" }}>{t("admin.roles.col.perms")}</th>
                <th className="admin-cell-actions">{t("admin.users.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td className="admin-cell-name">{role.nombre}</td>
                  <td className="admin-cell-muted">{role.slug}</td>
                  <td>
                    {role.es_sistema
                      ? <span className="admin-status-badge admin-status-active">{t("admin.roles.badge.system")}</span>
                      : <span className="admin-status-badge admin-status-inactive">{t("admin.roles.badge.custom")}</span>}
                  </td>
                  <td className="admin-cell-num" style={{ textAlign: "right" }}>
                    {Array.isArray(role.permission_keys) ? role.permission_keys.length : 0}
                  </td>
                  <td className="admin-cell-actions">
                    <div className="admin-table-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => setEditor(role)}
                        disabled={role.slug === "superadmin"}
                      >
                        {t("admin.roles.action.edit")}
                      </button>
                      {!role.es_sistema && (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          disabled={busyId === role.id}
                          onClick={() => removeRole(role)}
                        >
                          {t("admin.roles.action.delete")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editor && (
        <RoleEditor
          role={editor.id ? editor : null}
          modules={modules}
          onClose={() => setEditor(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
