import { useMemo, useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import {
  AdminDataView,
  AdminDialog,
  AdminPageHeader,
  AdminPageState,
} from "@/components/admin/admin-ui.jsx";
import {
  ModulePowerToggle,
  modulePartStatusLabel,
} from "@/components/admin/module-power-toggle.jsx";
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

function ModulePrecedenceSteps() {
  const { t } = useI18n();
  const steps = [
    t("admin.modules.precedenceStep1"),
    t("admin.modules.precedenceStep2"),
    t("admin.modules.precedenceStep3"),
    t("admin.modules.precedenceStep4"),
  ];
  return (
    <div className="admin-module-precedence">
      <h4 className="admin-module-precedence-title">{t("admin.modules.precedenceTitle")}</h4>
      <ol className="admin-module-precedence-list">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

/** Editor de casos especiales (presentación). */
function ModuleExceptionsEditor({
  rules,
  roles,
  users,
  planes,
  pending,
  error,
  dirty,
  onAddRule,
  onUpdateRule,
  onRemoveRule,
  onPersist,
}) {
  const { t } = useI18n();

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

  return (
    <div className="admin-module-exceptions">
      <ModulePrecedenceSteps />
      <div className="admin-module-rule-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onAddRule("rol")}>
          {t("admin.modules.addRole")}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onAddRule("usuario")}>
          {t("admin.modules.addUser")}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onAddRule("membresia")}>
          {t("admin.modules.addMembership")}
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="admin-empty" style={{ padding: 12 }}>{t("admin.modules.rulesEmpty")}</div>
      ) : (
        <div className="admin-module-exceptions-table-wrap">
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
                        onUpdateRule(idx, {
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
                      onChange={(e) => onUpdateRule(idx, { alcance_id: e.target.value })}
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
                    <label className="admin-module-rule-active">
                      <input
                        type="checkbox"
                        checked={rule.activo === true}
                        onChange={(e) => onUpdateRule(idx, { activo: e.target.checked })}
                        aria-label={t("admin.modules.col.active")}
                      />
                      <span>{rule.activo ? t("admin.modules.on") : t("admin.modules.off")}</span>
                    </label>
                  </td>
                  <td>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => onRemoveRule(idx)}>
                      {t("admin.modules.remove")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="auth-error" style={{ marginTop: 8 }}>{error}</div>}
      {dirty && (
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => void onPersist()}
          >
            {pending ? t("admin.users.confirm.saving") : t("common.save")}
          </button>
        </div>
      )}
    </div>
  );
}

function ModuleSubfeatureRow({
  node,
  roles,
  users,
  planes,
  onSaved,
  parentOff,
  parentName,
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  const empresasDistintas = node.empresas_distintas ?? 0;
  const statusLabel = modulePartStatusLabel(defaultGlobal, empresasDistintas, t);
  const unavailable = parentOff === true;

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

  const togglePower = async () => {
    if (unavailable) return;
    const next = !defaultGlobal;
    setDefaultGlobal(next);
    setDirty(true);
    await persist(next, rules);
  };

  return (
    <article className={`admin-module-subfeature${unavailable ? " is-unavailable" : ""}`}>
      <header className="admin-module-card-head">
        <div>
          <h4 className="admin-module-card-title">{node.nombre_visible}</h4>
          <p className="admin-module-part-status">{statusLabel}</p>
        </div>
        <ModulePowerToggle
          id={`module-part-${node.id}`}
          checked={defaultGlobal}
          disabled={pending || unavailable}
          onChange={() => void togglePower()}
        />
      </header>

      {unavailable ? (
        <p className="admin-module-unavailable-note">
          {t("admin.modules.subfeaturesUnavailable", { name: parentName })}
        </p>
      ) : null}

      {!unavailable ? (
        <button
          type="button"
          className="admin-module-rules-toggle"
          aria-expanded={rulesOpen}
          onClick={() => setRulesOpen((v) => !v)}
        >
          <span>{t("admin.modules.rules")}</span>
          <ChevronRight size={16} className={rulesOpen ? "is-open" : ""} aria-hidden />
        </button>
      ) : null}

      {rulesOpen && !unavailable ? (
        <ModuleExceptionsEditor
          rules={rules}
          roles={roles}
          users={users}
          planes={planes}
          pending={pending}
          error={error}
          dirty={dirty}
          onAddRule={addRule}
          onUpdateRule={updateRule}
          onRemoveRule={removeRule}
          onPersist={() => persist()}
        />
      ) : null}
    </article>
  );
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
  const [panel, setPanel] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  const empresasDistintas = node.empresas_distintas ?? 0;

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

  const togglePower = async () => {
    const next = !defaultGlobal;
    setDefaultGlobal(next);
    setDirty(true);
    await persist(next, rules);
  };

  const children = Array.isArray(node.children) ? node.children : [];
  const closePanel = () => setPanel(null);

  return (
    <article className="admin-module-card">
      <header className="admin-module-card-head">
        <div>
          <h3 className="admin-module-card-title">{node.nombre_visible}</h3>
        </div>
        <ModulePowerToggle
          id={`module-${node.id}`}
          checked={defaultGlobal}
          disabled={pending}
          onChange={() => void togglePower()}
        />
      </header>

      {empresasDistintas > 0 ? (
        <div className="admin-module-empresas-notice">
          <Info size={16} aria-hidden />
          <p>{t("admin.modules.empresasNotice", { count: empresasDistintas })}</p>
        </div>
      ) : null}

      {empresasDistintas > 0 ? (
        <button
          type="button"
          className="admin-module-rules-toggle admin-module-rules-toggle--primary"
          aria-haspopup="dialog"
          aria-expanded={panel === "rules"}
          onClick={() => setPanel("rules")}
        >
          <span>{t("admin.modules.viewEmpresas", { count: empresasDistintas })}</span>
          <ChevronRight size={16} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          className="admin-module-rules-toggle"
          aria-haspopup="dialog"
          aria-expanded={panel === "rules"}
          onClick={() => setPanel("rules")}
        >
          <span>{t("admin.modules.rules")}</span>
          <ChevronRight size={16} aria-hidden />
        </button>
      )}

      {children.length > 0 && (
        <button
          type="button"
          className="admin-module-rules-toggle"
          aria-haspopup="dialog"
          aria-expanded={panel === "children"}
          onClick={() => setPanel("children")}
        >
          <span>{t("admin.modules.subfeatures")} ({children.length})</span>
          <ChevronRight size={16} aria-hidden />
        </button>
      )}

      <AdminDialog
        open={panel === "rules"}
        onClose={closePanel}
        size="modules"
        title={`${t("admin.modules.rules")} — ${node.nombre_visible}`}
        footer={(
          <button type="button" className="btn btn-ghost" onClick={closePanel}>
            {t("admin.modules.close")}
          </button>
        )}
      >
        <ModuleExceptionsEditor
          rules={rules}
          roles={roles}
          users={users}
          planes={planes}
          pending={pending}
          error={error}
          dirty={dirty}
          onAddRule={addRule}
          onUpdateRule={updateRule}
          onRemoveRule={removeRule}
          onPersist={() => persist()}
        />
      </AdminDialog>

      <AdminDialog
        open={panel === "children"}
        onClose={closePanel}
        size="modules"
        title={`${t("admin.modules.subfeatures")} — ${node.nombre_visible}`}
        subtitle={t("admin.modules.subfeaturesHint")}
        footer={(
          <button type="button" className="btn btn-ghost" onClick={closePanel}>
            {t("admin.modules.close")}
          </button>
        )}
      >
        <div className="admin-module-subfeatures-list">
          {children.map((child) => (
            <ModuleSubfeatureRow
              key={child.id}
              node={child}
              roles={roles}
              users={users}
              planes={planes}
              onSaved={onSaved}
              parentOff={!defaultGlobal}
              parentName={node.nombre_visible}
            />
          ))}
        </div>
      </AdminDialog>
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
