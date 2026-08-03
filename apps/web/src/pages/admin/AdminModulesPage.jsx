import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { AdminDataView, AdminPageHeader, AdminPageState } from "@/components/admin/admin-ui.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { adminJson } from "@/lib/admin/api.js";

function flattenFlags(nodes, acc = []) {
  for (const n of nodes || []) {
    acc.push(n);
    if (n.children?.length) flattenFlags(n.children, acc);
  }
  return acc;
}

function ModuleCard({
  node,
  roles,
  users,
  planes,
  onSaved,
}) {
  const { t } = useI18n();
  const [defaultGlobal, setDefaultGlobal] = useState(node.default_global === true);
  const [rules, setRules] = useState(() =>
    (node.rules || []).map((r) => ({
      alcance: r.alcance,
      alcance_id: r.alcance_id,
      activo: r.activo === true,
    })),
  );
  const [rulesOpen, setRulesOpen] = useState(false);
  const [childrenOpen, setChildrenOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  const roleLabel = (id) => roles.find((r) => r.id === id)?.nombre || id.slice(0, 8);
  const userLabel = (id) => {
    const u = users.find((x) => x.id === id);
    return u ? (u.name || u.full_name || u.email || id.slice(0, 8)) : id.slice(0, 8);
  };
  const planLabel = (id) => planes.find((p) => p.id === id)?.nombre || id.slice(0, 8);

  const optionsFor = (alcance) => {
    if (alcance === "rol") return roles;
    if (alcance === "membresia") return planes;
    return users;
  };

  const addRule = (alcance) => {
    const options = optionsFor(alcance);
    const first = options[0];
    if (!first) {
      setError(
        alcance === "rol"
          ? t("admin.modules.error.noRoles")
          : alcance === "membresia"
            ? t("admin.modules.error.noPlans")
            : t("admin.modules.error.noUsers"),
      );
      return;
    }
    setRules((prev) => [...prev, { alcance, alcance_id: first.id, activo: true }]);
    setRulesOpen(true);
    setDirty(true);
    setError("");
  };

  const updateRule = (idx, patch) => {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const removeRule = (idx) => {
    setRules((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const persist = async (nextDefault = defaultGlobal, nextRules = rules) => {
    setPending(true);
    setError("");
    try {
      if (nextDefault !== node.default_global) {
        await adminJson(`flags/${node.id}`, {
          method: "PATCH",
          body: { default_global: nextDefault },
        });
      }
      await adminJson(`flags/${node.id}/rules`, {
        method: "PUT",
        body: { rules: nextRules },
      });
      setDirty(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.modules.error.save"));
    } finally {
      setPending(false);
    }
  };

  const toggleSystem = async () => {
    const next = !defaultGlobal;
    setDefaultGlobal(next);
    setDirty(true);
    await persist(next, rules);
  };

  const children = Array.isArray(node.children) ? node.children : [];

  return (
    <article className="admin-module-card">
      <header className="admin-module-card-head">
        <div>
          <h3 className="admin-module-card-title">{node.nombre_visible}</h3>
          <p className="admin-module-card-key">{node.clave}</p>
        </div>
        <label className="admin-module-toggle">
          <input
            type="checkbox"
            checked={defaultGlobal}
            disabled={pending}
            onChange={() => void toggleSystem()}
          />
          <span className={`admin-status-badge ${defaultGlobal ? "admin-status-active" : "admin-status-inactive"}`}>
            {defaultGlobal ? t("admin.modules.activeSystem") : t("admin.modules.inactiveSystem")}
          </span>
        </label>
      </header>

      <button
        type="button"
        className="admin-module-rules-toggle"
        aria-expanded={rulesOpen}
        onClick={() => setRulesOpen((v) => !v)}
      >
        <span>
          {t("admin.modules.rules")}
          {rules.length ? ` (${rules.length})` : ""}
        </span>
        <ChevronDown size={16} className={rulesOpen ? "is-open" : ""} aria-hidden />
      </button>

      {rulesOpen && (
        <div className="admin-module-rules">
          <p className="admin-confirm-sub" style={{ marginTop: 0 }}>
            {t("admin.modules.precedenceHint")}
          </p>
          <div className="admin-module-rule-actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => addRule("rol")}>
              {t("admin.modules.addRole")}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => addRule("usuario")}>
              {t("admin.modules.addUser")}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => addRule("membresia")}>
              {t("admin.modules.addMembership")}
            </button>
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
                          const first = optionsFor(alcance)[0];
                          updateRule(idx, {
                            alcance,
                            alcance_id: first?.id || rule.alcance_id,
                          });
                        }}
                      >
                        <option value="rol">{t("admin.modules.scope.role")}</option>
                        <option value="usuario">{t("admin.modules.scope.user")}</option>
                        <option value="membresia">{t("admin.modules.scope.membership")}</option>
                      </select>
                    </td>
                    <td>
                      <select
                        className="admin-role-select"
                        value={rule.alcance_id}
                        onChange={(e) => updateRule(idx, { alcance_id: e.target.value })}
                        style={{ minWidth: 160 }}
                      >
                        {optionsFor(rule.alcance).map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {rule.alcance === "rol"
                              ? (opt.nombre || opt.id)
                              : rule.alcance === "membresia"
                                ? (opt.nombre || opt.id)
                                : (opt.name || opt.full_name || opt.email || opt.id)}
                          </option>
                        ))}
                        {!optionsFor(rule.alcance).some((o) => o.id === rule.alcance_id) && (
                          <option value={rule.alcance_id}>
                            {rule.alcance === "rol"
                              ? roleLabel(rule.alcance_id)
                              : rule.alcance === "membresia"
                                ? planLabel(rule.alcance_id)
                                : userLabel(rule.alcance_id)}
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

          {error && <div className="auth-error" style={{ marginTop: 8 }}>{error}</div>}
          {dirty && (
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending}
                onClick={() => void persist()}
              >
                {pending ? t("admin.users.confirm.saving") : t("common.save")}
              </button>
            </div>
          )}
        </div>
      )}

      {children.length > 0 && (
        <>
          <button
            type="button"
            className="admin-module-rules-toggle"
            aria-expanded={childrenOpen}
            onClick={() => setChildrenOpen((v) => !v)}
          >
            <span>{t("admin.modules.subfeatures")} ({children.length})</span>
            <ChevronDown size={16} className={childrenOpen ? "is-open" : ""} aria-hidden />
          </button>
          {childrenOpen && (
            <div className="admin-module-children">
              {children.map((child) => (
                <ModuleCard
                  key={child.id}
                  node={child}
                  roles={roles}
                  users={users}
                  planes={planes}
                  onSaved={onSaved}
                />
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}

export function AdminModulesPage() {
  const { t } = useI18n();
  const session = useOutletContext();
  const [reloadKey, setReloadKey] = useState(0);

  const { loading, data, error } = useAdminFetch("flags", `?_=${reloadKey}`);
  const { data: rolesData } = useAdminFetch(session?.isSuperAdmin ? "roles" : "", "");
  const { data: usersData } = useAdminFetch(session?.isSuperAdmin ? "users" : "", "");
  const { data: planesData } = useAdminFetch(session?.isSuperAdmin ? "planes" : "", "");

  const tree = Array.isArray(data) ? data : [];
  const roles = Array.isArray(rolesData) ? rolesData : [];
  const planes = Array.isArray(planesData) ? planesData : [];
  const users = useMemo(() => {
    if (Array.isArray(usersData)) return usersData;
    if (Array.isArray(usersData?.users)) return usersData.users;
    return [];
  }, [usersData]);

  if (!session?.isSuperAdmin) {
    return <div className="admin-page admin-empty">{t("admin.modules.forbidden")}</div>;
  }

  const refresh = () => setReloadKey((k) => k + 1);

  return (
    <div className="admin-page admin-system-page">
      <AdminPageHeader
        eyebrow="Configuración de producto"
        title={t("admin.modules.title")}
        subtitle={t("admin.modules.sub")}
      />
      <AdminPageState loading={loading} error={error}>
        <AdminDataView empty={!tree.length} emptyTitle={t("admin.modules.empty")}>
          <div className="admin-modules-grid">
            {tree.map((node) => (
              <ModuleCard
                key={`${node.id}-${reloadKey}`}
                node={node}
                roles={roles}
                users={users}
                planes={planes}
                onSaved={refresh}
              />
            ))}
          </div>
        </AdminDataView>
      </AdminPageState>
      <p className="admin-confirm-sub" style={{ marginTop: 16 }}>
        {t("admin.modules.cardHint", { count: flattenFlags(tree).length })}
      </p>
    </div>
  );
}
