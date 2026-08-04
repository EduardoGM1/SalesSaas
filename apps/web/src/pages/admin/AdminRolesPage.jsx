import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AdminDataView, AdminPageHeader, AdminPageState, AdminStatusBadge } from "@/components/admin/admin-ui.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { hasPermission } from "@/lib/auth/permissions";
import { useI18n } from "@/hooks/use-i18n.js";
import { adminJson } from "@/lib/admin/api.js";

/** Orden de jerarquía de roles de plataforma (gobierno). */
const SYSTEM_ROLE_ORDER = ["superadmin", "admin", "soporte", "vendedor"];

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

function sortSystemRoles(roles) {
  return [...roles].sort((a, b) => {
    const ia = SYSTEM_ROLE_ORDER.indexOf(a.slug);
    const ib = SYSTEM_ROLE_ORDER.indexOf(b.slug);
    const ra = ia === -1 ? 99 : ia;
    const rb = ib === -1 ? 99 : ib;
    if (ra !== rb) return ra - rb;
    return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
  });
}

function ModuleCheckboxTree({ nodes, selected, onToggle, depth = 0 }) {
  return (nodes || []).map((node) => (
    <div key={node.id} style={{ marginLeft: depth * 14, marginBottom: 6 }}>
      <label className="admin-perm-item">
        <input
          type="checkbox"
          checked={selected.has(node.clave)}
          onChange={() => onToggle(node)}
        />
        <span>
          {node.nombre_visible}
          <span className="admin-cell-muted" style={{ marginLeft: 6, fontSize: 11 }}>{node.clave}</span>
        </span>
      </label>
      {node.children?.length > 0 && (
        <ModuleCheckboxTree
          nodes={node.children}
          selected={selected}
          onToggle={onToggle}
          depth={depth + 1}
        />
      )}
    </div>
  ));
}

function RoleEditor({ role, flagTree, onClose, onSaved }) {
  const { t } = useI18n();
  const isNew = !role?.id;
  const [nombre, setNombre] = useState(role?.nombre ?? "");
  const [keys, setKeys] = useState(() => (
    isNew ? new Set() : flagKeysForRole(flagTree, role.id)
  ));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const toggle = (node) => {
    setKeys((prev) => {
      const next = new Set(prev);
      const turningOn = !next.has(node.clave);
      if (turningOn) {
        next.add(node.clave);
        for (const child of collectFlagKeys(node.children || [])) next.add(child.clave);
      } else {
        next.delete(node.clave);
        for (const child of collectFlagKeys(node.children || [])) next.delete(child.clave);
      }
      return next;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const flag_keys = [...keys];
      if (isNew) {
        await adminJson("roles", { method: "POST", body: { nombre, flag_keys } });
      } else {
        await adminJson(`roles/${role.id}`, {
          method: "PATCH",
          body: {
            nombre: role.es_sistema ? undefined : nombre,
            flag_keys,
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
            <p className="admin-confirm-sub" style={{ marginTop: 10 }}>
              {t("admin.roles.modulesHint")}
            </p>
          </div>
          <div className="admin-confirm-body" style={{ maxHeight: 360, overflow: "auto" }}>
            <div className="section-label" style={{ marginBottom: 8 }}>{t("admin.roles.modulesTitle")}</div>
            <ModuleCheckboxTree nodes={flagTree} selected={keys} onToggle={toggle} />
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

function RolesTable({ roles, moduleCounts, busyId, onEdit, onRemove, t, emptyLabel }) {
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
          {roles.map((role) => (
            <tr key={role.id}>
              <td className="admin-cell-name">{role.nombre}</td>
              <td className="admin-cell-muted"><code>{role.slug}</code></td>
              <td className="admin-cell-num" style={{ textAlign: "right" }}>
                {moduleCounts.get(role.id) ?? (Array.isArray(role.permission_keys) ? role.permission_keys.length : 0)}
              </td>
              <td className="admin-cell-actions">
                <div className="admin-table-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => onEdit(role)}
                    disabled={role.slug === "superadmin"}
                  >
                    {t("admin.roles.action.edit")}
                  </button>
                  {!role.es_sistema && (
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={busyId === role.id}
                      onClick={() => onRemove(role)}
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

  const roles = useMemo(
    () => (Array.isArray(data) ? data : []).filter((r) => !r.empresa_id),
    [data],
  );
  const systemRoles = useMemo(
    () => sortSystemRoles(roles.filter((r) => r.es_sistema)),
    [roles],
  );
  const customRoles = useMemo(
    () => [...roles.filter((r) => !r.es_sistema)].sort((a, b) =>
      String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")),
    [roles],
  );

  const moduleCounts = useMemo(() => {
    const map = new Map();
    for (const role of roles) {
      map.set(role.id, flagKeysForRole(flagTree, role.id).size);
    }
    return map;
  }, [roles, flagTree]);

  if (!canManageRoles) {
    return <div className="admin-page admin-empty">{t("admin.roles.forbidden")}</div>;
  }

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

  return (
    <div className="admin-page admin-system-page">
      <AdminPageHeader
        eyebrow="Gobierno de acceso"
        title={t("admin.roles.title")}
        subtitle={t("admin.roles.subPlatform")}
        actions={<button type="button" className="btn btn-primary" onClick={() => setEditor({})}>
          {t("admin.roles.create")}
        </button>}
      />
      <AdminPageState loading={loading} error={error}>
        <AdminDataView empty={!roles.length} emptyTitle={t("admin.roles.empty")}>
          <section className="admin-roles-section">
            <div className="admin-roles-section-head">
              <h2 className="admin-roles-section-title">{t("admin.roles.section.system")}</h2>
              <p className="admin-roles-section-sub">{t("admin.roles.section.systemSub")}</p>
            </div>
            <RolesTable
              roles={systemRoles}
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
              <h2 className="admin-roles-section-title">{t("admin.roles.section.custom")}</h2>
              <p className="admin-roles-section-sub">{t("admin.roles.section.customSub")}</p>
            </div>
            <RolesTable
              roles={customRoles}
              moduleCounts={moduleCounts}
              busyId={busyId}
              onEdit={setEditor}
              onRemove={removeRole}
              t={t}
              emptyLabel={t("admin.roles.emptyCustom")}
            />
          </section>
        </AdminDataView>
      </AdminPageState>
      {editor && (
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
