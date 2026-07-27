import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
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

/** Editor reutilizable: default global + excepciones rol/usuario. */
function FlagRulesEditor({
  flag,
  roles,
  users,
  onClose,
  onSaved,
}) {
  const { t } = useI18n();
  const [defaultGlobal, setDefaultGlobal] = useState(flag.default_global === true);
  const [rules, setRules] = useState(() =>
    (flag.rules || []).map((r) => ({
      alcance: r.alcance,
      alcance_id: r.alcance_id,
      activo: r.activo === true,
    })),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const roleLabel = (id) => roles.find((r) => r.id === id)?.nombre || id.slice(0, 8);
  const userLabel = (id) => {
    const u = users.find((x) => x.id === id);
    return u ? (u.name || u.full_name || u.email || id.slice(0, 8)) : id.slice(0, 8);
  };

  const addRule = (alcance) => {
    const options = alcance === "rol" ? roles : users;
    const first = options[0];
    if (!first) {
      setError(alcance === "rol" ? t("admin.modules.error.noRoles") : t("admin.modules.error.noUsers"));
      return;
    }
    setRules((prev) => [
      ...prev,
      { alcance, alcance_id: first.id, activo: true },
    ]);
    setError("");
  };

  const updateRule = (idx, patch) => {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRule = (idx) => {
    setRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      if (defaultGlobal !== flag.default_global) {
        await adminJson(`flags/${flag.id}`, {
          method: "PATCH",
          body: { default_global: defaultGlobal },
        });
      }
      await adminJson(`flags/${flag.id}/rules`, {
        method: "PUT",
        body: { rules },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.modules.error.save"));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button type="button" className="modal-backdrop" aria-label={t("common.cancel")} onClick={onClose} />
      <div className="admin-confirm-panel admin-perms-modal admin-modules-modal" role="dialog" aria-modal="true">
        <div className="admin-confirm-head">
          <span className="admin-confirm-title">{flag.nombre_visible}</span>
          <span className="admin-cell-muted" style={{ fontSize: 12 }}>{flag.clave}</span>
        </div>
        <form onSubmit={submit}>
          <div style={{ padding: "0 20px 16px" }}>
            <label className="admin-perm-item" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={defaultGlobal}
                onChange={(e) => setDefaultGlobal(e.target.checked)}
              />
              <span>{t("admin.modules.defaultGlobal")}</span>
            </label>
            <p className="admin-confirm-sub" style={{ marginTop: 8 }}>
              {t("admin.modules.precedenceHint")}
            </p>
          </div>

          <div className="admin-confirm-body admin-modules-modal-body">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div className="section-label" style={{ marginBottom: 0 }}>{t("admin.modules.rules")}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => addRule("rol")}>
                  {t("admin.modules.addRole")}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => addRule("usuario")}>
                  {t("admin.modules.addUser")}
                </button>
              </div>
            </div>

            {rules.length === 0 ? (
              <div className="admin-empty" style={{ padding: 12 }}>{t("admin.modules.rulesEmpty")}</div>
            ) : (
              <table className="client-table admin-users-table">
                <thead>
                  <tr>
                    <th>{t("admin.modules.col.scope")}</th>
                    <th>{t("admin.modules.col.target")}</th>
                    <th>{t("admin.modules.col.active")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule, idx) => (
                    <tr key={`${rule.alcance}-${rule.alcance_id}-${idx}`}>
                      <td>
                        <select
                          className="admin-role-select"
                          value={rule.alcance}
                          onChange={(e) => {
                            const alcance = e.target.value;
                            const first = (alcance === "rol" ? roles : users)[0];
                            updateRule(idx, {
                              alcance,
                              alcance_id: first?.id || rule.alcance_id,
                            });
                          }}
                        >
                          <option value="rol">{t("admin.modules.scope.role")}</option>
                          <option value="usuario">{t("admin.modules.scope.user")}</option>
                        </select>
                      </td>
                      <td>
                        <select
                          className="admin-role-select"
                          value={rule.alcance_id}
                          onChange={(e) => updateRule(idx, { alcance_id: e.target.value })}
                          style={{ minWidth: 160 }}
                        >
                          {(rule.alcance === "rol" ? roles : users).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {rule.alcance === "rol"
                                ? (opt.nombre || opt.id)
                                : (opt.name || opt.full_name || opt.email || opt.id)}
                            </option>
                          ))}
                          {/* Si el id actual no está en la lista (paginación), mantener opción */}
                          {(rule.alcance === "rol"
                            ? !roles.some((r) => r.id === rule.alcance_id)
                            : !users.some((u) => u.id === rule.alcance_id)) && (
                            <option value={rule.alcance_id}>
                              {rule.alcance === "rol" ? roleLabel(rule.alcance_id) : userLabel(rule.alcance_id)}
                            </option>
                          )}
                        </select>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={rule.activo === true}
                          onChange={(e) => updateRule(idx, { activo: e.target.checked })}
                          aria-label={t("admin.modules.col.active")}
                        />
                      </td>
                      <td>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeRule(idx)}>
                          {t("admin.modules.remove")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {error && <div className="auth-error" style={{ margin: "0 20px 12px" }}>{error}</div>}
          <div className="btn-row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? t("admin.users.confirm.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function FlagTreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onEdit,
}) {
  const { t } = useI18n();
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const rulesCount = Array.isArray(node.rules) ? node.rules.length : 0;

  return (
    <>
      <tr>
        <td className="admin-cell-name" style={{ paddingLeft: 12 + depth * 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {hasChildren ? (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                aria-expanded={isOpen}
                onClick={() => onToggle(node.id)}
                style={{ minWidth: 28, padding: "2px 6px" }}
              >
                {isOpen ? "▾" : "▸"}
              </button>
            ) : (
              <span style={{ width: 28, display: "inline-block" }} />
            )}
            <span>{node.nombre_visible}</span>
          </div>
        </td>
        <td className="admin-cell-muted">{node.clave}</td>
        <td>
          <span className={`admin-status-badge ${node.default_global ? "admin-status-active" : "admin-status-inactive"}`}>
            {node.default_global ? t("admin.modules.on") : t("admin.modules.off")}
          </span>
        </td>
        <td className="admin-cell-num" style={{ textAlign: "right" }}>{rulesCount}</td>
        <td className="admin-cell-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onEdit(node)}>
            {t("admin.modules.action.edit")}
          </button>
        </td>
      </tr>
      {hasChildren && isOpen && node.children.map((child) => (
        <FlagTreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onEdit={onEdit}
        />
      ))}
    </>
  );
}

export function AdminModulesPage() {
  const { t } = useI18n();
  const session = useOutletContext();
  const [reloadKey, setReloadKey] = useState(0);
  const [editor, setEditor] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  const { loading, data, error } = useAdminFetch("flags", `?_=${reloadKey}`);
  const { data: rolesData } = useAdminFetch(session?.isSuperAdmin ? "roles" : "", "");
  const { data: usersData } = useAdminFetch(session?.isSuperAdmin ? "users" : "", "");

  const tree = Array.isArray(data) ? data : [];
  const roles = Array.isArray(rolesData) ? rolesData : [];
  const users = useMemo(() => {
    if (Array.isArray(usersData)) return usersData;
    if (Array.isArray(usersData?.users)) return usersData.users;
    return [];
  }, [usersData]);

  useEffect(() => {
    if (!tree.length) return;
    setExpanded((prev) => {
      if (prev.size) return prev;
      return new Set(tree.map((n) => n.id));
    });
  }, [tree]);

  if (!session?.isSuperAdmin) {
    return <div className="admin-page admin-empty">{t("admin.modules.forbidden")}</div>;
  }

  const refresh = () => {
    setEditor(null);
    setReloadKey((k) => k + 1);
  };

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) return <div className="admin-page">{t("admin.loading.modules")}</div>;
  if (error) return <div className="admin-page admin-empty">{error}</div>;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">{t("admin.modules.title")}</h1>
        <p className="admin-sub">{t("admin.modules.sub")}</p>
      </div>

      <div className="client-table-card">
        {tree.length === 0 ? (
          <div className="admin-empty">{t("admin.modules.empty")}</div>
        ) : (
          <table className="client-table admin-users-table">
            <thead>
              <tr>
                <th>{t("admin.modules.col.name")}</th>
                <th>{t("admin.modules.col.key")}</th>
                <th>{t("admin.modules.col.default")}</th>
                <th style={{ textAlign: "right" }}>{t("admin.modules.col.rules")}</th>
                <th className="admin-cell-actions">{t("admin.users.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {tree.map((node) => (
                <FlagTreeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  onToggle={toggle}
                  onEdit={setEditor}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editor && (
        <FlagRulesEditor
          flag={editor}
          roles={roles}
          users={users}
          onClose={() => setEditor(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
