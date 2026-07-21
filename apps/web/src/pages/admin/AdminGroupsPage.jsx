import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { useI18n } from "@/hooks/use-i18n.js";

async function adminJson(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/v1/admin/${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error");
  return data.data ?? data;
}

export function AdminGroupsPage() {
  const { t } = useI18n();
  const session = useOutletContext();
  const viewerIsSuper = Boolean(
    session?.isSuperAdmin || (session?.profile && isSuperAdmin(session.profile)),
  );
  const [reloadKey, setReloadKey] = useState(0);
  const { loading, data, error } = useAdminFetch(viewerIsSuper ? "groups" : null, `?_=${reloadKey}`);
  const { data: usersData } = useAdminFetch(viewerIsSuper ? "users" : null, `?_=${reloadKey}`);
  const groups = Array.isArray(data) ? data : [];
  const users = Array.isArray(usersData) ? usersData : [];

  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");

  const userOptions = useMemo(
    () => users.filter((u) => u.is_active !== false && !u.is_super_admin),
    [users],
  );

  if (!viewerIsSuper) {
    return <div className="admin-page admin-empty">{t("admin.panel.forbidden")}</div>;
  }
  if (loading) return <div className="admin-page">{t("admin.loading.generic")}</div>;
  if (error) return <div className="admin-page admin-empty">{error}</div>;

  const openCreate = () => {
    setFormError("");
    setEditing({
      id: null,
      nombre: "",
      gerente_id: userOptions[0]?.id || "",
      miembro_ids: [],
    });
  };

  const openEdit = (g) => {
    setFormError("");
    setEditing({
      id: g.id,
      nombre: g.nombre,
      gerente_id: g.gerente_id,
      miembro_ids: [...(g.miembro_ids || [])],
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setPending(true);
    setFormError("");
    try {
      if (editing.id) {
        await adminJson(`groups/${editing.id}`, {
          method: "PATCH",
          body: {
            nombre: editing.nombre,
            gerente_id: editing.gerente_id,
            miembro_ids: editing.miembro_ids,
          },
        });
      } else {
        await adminJson("groups", {
          method: "POST",
          body: {
            nombre: editing.nombre,
            gerente_id: editing.gerente_id,
            miembro_ids: editing.miembro_ids,
          },
        });
      }
      setEditing(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(err.message || "Error");
    } finally {
      setPending(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm(t("admin.groups.confirmDelete"))) return;
    setPending(true);
    try {
      await adminJson(`groups/${id}`, { method: "DELETE" });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(err.message || "Error");
    } finally {
      setPending(false);
    }
  };

  const toggleMember = (uid) => {
    setEditing((prev) => {
      const set = new Set(prev.miembro_ids || []);
      if (set.has(uid)) set.delete(uid);
      else set.add(uid);
      return { ...prev, miembro_ids: [...set] };
    });
  };

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">{t("admin.groups.title")}</h1>
        <p className="admin-sub">{t("admin.groups.sub")}</p>
      </div>
      <div className="btn-row" style={{ marginBottom: 16 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
          {t("admin.groups.create")}
        </button>
      </div>
      {formError ? <div className="auth-error" style={{ marginBottom: 12 }}>{formError}</div> : null}
      <div className="client-table-card">
        {groups.length === 0 ? (
          <div className="admin-empty">{t("admin.groups.empty")}</div>
        ) : (
          <table className="client-table">
            <thead>
              <tr>
                <th>{t("admin.groups.col.name")}</th>
                <th>{t("admin.groups.col.manager")}</th>
                <th>{t("admin.groups.col.members")}</th>
                <th>{t("admin.users.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>{g.nombre}</td>
                  <td>{g.gerente?.full_name || g.gerente?.email || g.gerente_id}</td>
                  <td>{(g.miembro_ids || []).length}</td>
                  <td>
                    <div className="btn-row">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(g)} disabled={pending}>
                        {t("common.edit")}
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(g.id)} disabled={pending}>
                        {t("common.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing ? (
        <>
          <button type="button" className="modal-backdrop" aria-label={t("common.cancel")} onClick={() => setEditing(null)} />
          <div className="admin-confirm-panel admin-perms-modal" role="dialog" aria-modal="true">
            <div className="admin-confirm-head">
              <span className="admin-confirm-title">
                {editing.id ? t("admin.groups.editTitle") : t("admin.groups.create")}
              </span>
            </div>
            <form onSubmit={save}>
              <div style={{ padding: "0 20px 12px", display: "grid", gap: 10 }}>
                <label>
                  <div className="admin-sub">{t("admin.groups.col.name")}</div>
                  <input
                    className="admin-role-select"
                    style={{ width: "100%" }}
                    value={editing.nombre}
                    onChange={(e) => setEditing((p) => ({ ...p, nombre: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  <div className="admin-sub">{t("admin.groups.col.manager")}</div>
                  <select
                    className="admin-role-select"
                    style={{ width: "100%" }}
                    value={editing.gerente_id}
                    onChange={(e) => setEditing((p) => ({ ...p, gerente_id: e.target.value }))}
                    required
                  >
                    {userOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.name || u.email}</option>
                    ))}
                  </select>
                </label>
                <div>
                  <div className="admin-sub">{t("admin.groups.col.members")}</div>
                  <div className="admin-perms-grid">
                    {userOptions
                      .filter((u) => u.id !== editing.gerente_id)
                      .map((u) => (
                        <label key={u.id} className="admin-perm-item">
                          <input
                            type="checkbox"
                            checked={(editing.miembro_ids || []).includes(u.id)}
                            onChange={() => toggleMember(u.id)}
                          />
                          <span>{u.name || u.email}</span>
                        </label>
                      ))}
                  </div>
                </div>
              </div>
              <div className="btn-row">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>{t("common.cancel")}</button>
                <button type="submit" className="btn btn-primary" disabled={pending}>
                  {pending ? t("admin.users.confirm.saving") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
