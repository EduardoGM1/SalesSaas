import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  FLAG_TOOL_PERMISSIONS,
  PERMISSION_CATALOG,
  PERMISSION_MODULES,
} from "@salesapp/shared/auth/permission-catalog.js";
import { AdminDataView, AdminPageHeader, AdminPageState } from "@/components/admin/admin-ui.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { hasPermission } from "@/lib/auth/permissions";
import { useI18n } from "@/hooks/use-i18n.js";
import { adminJson } from "@/lib/admin/api.js";

/** Orden de jerarquía de roles de plataforma (gobierno). */
const PLATFORM_ROLE_ORDER = ["superadmin", "admin", "soporte"];
const LEGACY_ROLE_SLUG = "liner";

function collectFlagKeys(nodes, acc = []) {
  for (const n of nodes || []) {
    acc.push(n);
    if (n.children?.length) collectFlagKeys(n.children, acc);
  }
  return acc;
}

function flagKeysForRole(flagTree, roleId) {
  const keys = new Set();
  for (const node of collectFlagKeys(flagTree)) {
    const hit = (node.rules || []).some(
      (r) => r.alcance === "rol" && r.alcance_id === roleId && r.activo === true,
    );
    if (hit) keys.add(node.clave);
  }
  return keys;
}

function sortPlatformRoles(roles) {
  return [...roles].sort((a, b) => {
    const ia = PLATFORM_ROLE_ORDER.indexOf(a.slug);
    const ib = PLATFORM_ROLE_ORDER.indexOf(b.slug);
    const ra = ia === -1 ? 99 : ia;
    const rb = ib === -1 ? 99 : ib;
    if (ra !== rb) return ra - rb;
    return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
  });
}

const TOOL_FLAG_ORDER = ["survey", "worksheet", "analysis", "proyeccion_vacaciones"];

function findFlagNode(nodes, clave) {
  for (const node of collectFlagKeys(nodes)) {
    if (node.clave === clave) return node;
  }
  return null;
}

function dropDisallowedToolPerms(flagKeys, permKeys) {
  const next = new Set(permKeys);
  for (const [flag, perms] of Object.entries(FLAG_TOOL_PERMISSIONS)) {
    if (flagKeys.has(flag)) continue;
    for (const perm of perms) next.delete(perm);
  }
  return next;
}

function normalizeFlagSelection(nodes, selected, parentOn = true, next = new Set()) {
  for (const node of nodes || []) {
    const on = parentOn && selected.has(node.clave);
    if (on) next.add(node.clave);
    if (node.children?.length) normalizeFlagSelection(node.children, selected, on, next);
  }
  return next;
}

function ModuleCheckboxTree({ nodes, selected, onToggle, depth = 0, parentOn = true }) {
  return (nodes || []).map((node) => {
    const on = parentOn && selected.has(node.clave);
    const disabled = !parentOn;
    return (
      <div key={node.id} style={{ marginLeft: depth * 14, marginBottom: 6 }}>
        <label className={`admin-perm-item${disabled ? " is-disabled" : ""}`}>
          <input
            type="checkbox"
            checked={on}
            disabled={disabled}
            onChange={() => {
              if (!disabled) onToggle(node);
            }}
          />
          <span>
            <span>{node.nombre_visible}</span>
            <span className="admin-perm-key">{node.clave}</span>
          </span>
        </label>
        {node.children?.length > 0 && (
          <ModuleCheckboxTree
            nodes={node.children}
            selected={selected}
            onToggle={onToggle}
            depth={depth + 1}
            parentOn={on}
          />
        )}
      </div>
    );
  });
}

function catalogPerm(clave) {
  return PERMISSION_CATALOG.find((item) => item.clave === clave) || null;
}

function RoleEditor({ role, flagTree, onClose, onSaved }) {
  const { t } = useI18n();
  const isNew = !role?.id;
  const [nombre, setNombre] = useState(role?.nombre ?? "");
  const [keys, setKeys] = useState(() => (
    isNew ? new Set() : normalizeFlagSelection(flagTree, flagKeysForRole(flagTree, role.id))
  ));
  const [permKeys, setPermKeys] = useState(() => dropDisallowedToolPerms(
    isNew ? new Set() : normalizeFlagSelection(flagTree, flagKeysForRole(flagTree, role.id)),
    new Set(role?.permission_keys || []),
  ));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const toggle = (node) => {
    setKeys((prev) => {
      const next = new Set(prev);
      const turningOn = !next.has(node.clave);
      const affected = [node, ...collectFlagKeys(node.children || [])];
      if (turningOn) {
        for (const item of affected) next.add(item.clave);
      } else {
        for (const item of affected) next.delete(item.clave);
        const drop = new Set();
        for (const item of affected) {
          for (const perm of FLAG_TOOL_PERMISSIONS[item.clave] || []) drop.add(perm);
        }
        setPermKeys((perms) => {
          const pnext = new Set(perms);
          for (const perm of drop) pnext.delete(perm);
          return pnext;
        });
      }
      return next;
    });
  };

  const togglePerm = (clave) => {
    setPermKeys((prev) => {
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
      const flag_keys = [...keys];
      const permission_keys = [...dropDisallowedToolPerms(keys, permKeys)];
      if (isNew) {
        await adminJson("roles", { method: "POST", body: { nombre, flag_keys, permission_keys } });
      } else {
        await adminJson(`roles/${role.id}`, {
          method: "PATCH",
          body: {
            nombre: role.es_sistema ? undefined : nombre,
            flag_keys,
            permission_keys,
          },
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
      <div className="admin-confirm-panel admin-perms-modal" role="dialog" aria-modal="true">
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
          <div className="admin-confirm-body admin-role-editor-body">
            <section className="admin-role-zone">
              <div className="section-label" style={{ marginBottom: 8 }}>{t("admin.roles.zone.sees")}</div>
              <ModuleCheckboxTree nodes={flagTree} selected={keys} onToggle={toggle} />
            </section>
            <section className="admin-role-zone">
              <div className="section-label" style={{ marginBottom: 4 }}>{t("admin.roles.zone.does")}</div>
              <p className="admin-confirm-sub" style={{ marginBottom: 10 }}>{t("admin.roles.zone.doesHint")}</p>
              {TOOL_FLAG_ORDER.map((flag) => {
                if (!keys.has(flag)) return null;
                const node = findFlagNode(flagTree, flag);
                const perms = FLAG_TOOL_PERMISSIONS[flag] || [];
                return (
                  <div key={flag} className="admin-role-perm-group">
                    <div className="admin-role-perm-heading">{node?.nombre_visible || flag}</div>
                    {perms.map((clave) => {
                      const item = catalogPerm(clave);
                      if (!item) return null;
                      return (
                        <label key={clave} className="admin-perm-item">
                          <input
                            type="checkbox"
                            checked={permKeys.has(clave)}
                            onChange={() => togglePerm(clave)}
                          />
                          <span>{item.nombre_visible}</span>
                        </label>
                      );
                    })}
                  </div>
                );
              })}
              {PERMISSION_MODULES.filter((mod) => mod.id !== "herramientas").map((mod) => {
                const items = PERMISSION_CATALOG.filter((item) => item.modulo === mod.id);
                if (!items.length) return null;
                return (
                  <div key={mod.id} className="admin-role-perm-group">
                    <div className="admin-role-perm-heading">{mod.label}</div>
                    {items.map((item) => (
                      <label key={item.clave} className="admin-perm-item">
                        <input
                          type="checkbox"
                          checked={permKeys.has(item.clave)}
                          onChange={() => togglePerm(item.clave)}
                        />
                        <span>{item.nombre_visible}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </section>
          </div>
          <p className="admin-confirm-sub admin-role-editor-foot">{t("admin.roles.footer.sala")}</p>
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

function RolesTable({
  roles,
  moduleCounts,
  busyId,
  onEdit,
  onRemove,
  t,
  emptyLabel,
  allowDelete = false,
}) {
  if (!roles.length) {
    return <div className="admin-empty" style={{ padding: 16 }}>{emptyLabel}</div>;
  }
  return (
    <div className="client-table-card admin-system-table">
      <table className="client-table admin-users-table">
        <thead>
          <tr>
            <th>{t("admin.roles.col.name")}</th>
            <th>{t("admin.roles.col.slug")}</th>
            <th style={{ textAlign: "right" }}>{t("admin.roles.col.modules")}</th>
            <th className="admin-cell-actions">{t("admin.users.col.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => {
            const canEdit = role.slug !== "superadmin";
            return (
              <tr key={role.id}>
                <td className="admin-cell-name">{role.nombre}</td>
                <td className="admin-cell-muted"><code>{role.slug}</code></td>
                <td className="admin-cell-num" style={{ textAlign: "right" }}>
                  {moduleCounts.get(role.id) ?? 0}
                </td>
                <td className="admin-cell-actions">
                  <div className="admin-table-actions">
                    {canEdit ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => onEdit(role)}
                      >
                        {t("admin.roles.action.edit")}
                      </button>
                    ) : null}
                    {allowDelete && !role.es_sistema ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={busyId === role.id}
                        onClick={() => onRemove(role)}
                      >
                        {t("admin.roles.action.delete")}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AdminRolesPage() {
  const { t } = useI18n();
  const session = useOutletContext();
  const [reloadKey, setReloadKey] = useState(0);
  const [editor, setEditor] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const { loading, data, error } = useAdminFetch("roles", `?_=${reloadKey}`);
  const { data: flagsData } = useAdminFetch("flags", `?_=${reloadKey}`);
  const flagTree = Array.isArray(flagsData) ? flagsData : [];

  const canManageRoles = Boolean(
    session?.isSuperAdmin
    || (session?.profile && hasPermission(session.profile, "gestionar_roles_permisos")),
  );

  const allRoles = useMemo(
    () => (Array.isArray(data) ? data : []),
    [data],
  );
  const globalRoles = useMemo(
    () => allRoles.filter((r) => !r.empresa_id),
    [allRoles],
  );
  const platformRoles = useMemo(
    () => sortPlatformRoles(globalRoles.filter((r) => PLATFORM_ROLE_ORDER.includes(r.slug))),
    [globalRoles],
  );
  const legacyRoles = useMemo(
    () => globalRoles.filter((r) => r.slug === LEGACY_ROLE_SLUG),
    [globalRoles],
  );
  const customRoles = useMemo(
    () => [...globalRoles.filter((r) => !r.es_sistema && r.slug !== LEGACY_ROLE_SLUG)].sort((a, b) =>
      String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")),
    [globalRoles],
  );

  const moduleCounts = useMemo(() => {
    const map = new Map();
    for (const role of globalRoles) {
      map.set(role.id, flagKeysForRole(flagTree, role.id).size);
    }
    return map;
  }, [globalRoles, flagTree]);

  if (!canManageRoles) {
    return <div className="admin-page admin-empty">{t("admin.roles.forbidden")}</div>;
  }

  const refresh = () => {
    setEditor(null);
    setReloadKey((k) => k + 1);
  };

  const removeRole = async (role) => {
    if (role.es_sistema || role.empresa_id) return;
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

  return (
    <div className="admin-page admin-system-page">
      <AdminPageHeader
        eyebrow="Gobierno de acceso"
        title={t("admin.roles.title")}
        actions={<button type="button" className="btn btn-primary" onClick={() => setEditor({})}>
          {t("admin.roles.create")}
        </button>}
      />
      <AdminPageState loading={loading} error={error}>
        <AdminDataView empty={!globalRoles.length} emptyTitle={t("admin.roles.empty")}>
          <section className="admin-roles-section">
            <div className="admin-roles-section-head">
              <h2 className="admin-roles-section-title">{t("admin.roles.section.platform")}</h2>
            </div>
            <RolesTable
              roles={platformRoles}
              moduleCounts={moduleCounts}
              busyId={busyId}
              onEdit={setEditor}
              onRemove={removeRole}
              t={t}
              emptyLabel={t("admin.roles.empty")}
            />
          </section>

          <section className="admin-roles-section">
            <div className="admin-roles-section-head">
              <h2 className="admin-roles-section-title">{t("admin.roles.section.legacy")}</h2>
              <p className="admin-roles-section-sub">{t("admin.roles.section.legacySub")}</p>
            </div>
            <RolesTable
              roles={legacyRoles}
              moduleCounts={moduleCounts}
              busyId={busyId}
              onEdit={setEditor}
              onRemove={removeRole}
              t={t}
              emptyLabel={t("admin.roles.empty")}
            />
          </section>

          <section className="admin-roles-section">
            <div className="admin-roles-section-head">
              <h2 className="admin-roles-section-title">{t("admin.roles.section.created")}</h2>
            </div>
            <RolesTable
              roles={customRoles}
              moduleCounts={moduleCounts}
              busyId={busyId}
              onEdit={setEditor}
              onRemove={removeRole}
              t={t}
              emptyLabel={t("admin.roles.emptyCustom")}
              allowDelete
            />
          </section>
        </AdminDataView>
      </AdminPageState>
      {editor && !editor.empresa_id && (
        <RoleEditor
          role={editor.id ? editor : null}
          flagTree={flagTree}
          onClose={() => setEditor(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
