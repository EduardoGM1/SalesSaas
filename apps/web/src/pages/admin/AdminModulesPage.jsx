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

export function AdminModulesPage() {
  const { t } = useI18n();
  const session = useOutletContext();
  const viewerIsSuper = Boolean(
    session?.isSuperAdmin || (session?.profile && isSuperAdmin(session.profile)),
  );
  const [reloadKey, setReloadKey] = useState(0);
  const { loading, data, error } = useAdminFetch(viewerIsSuper ? "modules" : null, `?_=${reloadKey}`);
  const catalog = data?.catalog || [];
  const activations = data?.activations || [];
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState("");

  const defaultOrgId = "b0000000-0000-4000-8000-000000000001";

  const orgActs = useMemo(() => {
    const map = new Map();
    for (const a of activations) {
      if (a.scope_tipo === "organizacion" && a.organizacion_id === defaultOrgId) {
        map.set(a.modulo_clave, a);
      }
    }
    return map;
  }, [activations]);

  if (!viewerIsSuper) {
    return <div className="admin-page admin-empty">{t("admin.panel.forbidden")}</div>;
  }
  if (loading) return <div className="admin-page">{t("admin.loading.generic")}</div>;
  if (error) return <div className="admin-page admin-empty">{error}</div>;

  const setOrgActive = async (clave, activo) => {
    setPending(true);
    setMsg("");
    try {
      await adminJson("modules/activation", {
        method: "POST",
        body: {
          modulo_clave: clave,
          scope_tipo: "organizacion",
          organizacion_id: defaultOrgId,
          activo,
        },
      });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setMsg(err.message || "Error");
    } finally {
      setPending(false);
    }
  };

  const clearAct = async (id) => {
    setPending(true);
    try {
      await adminJson(`modules/activation/${id}`, { method: "DELETE" });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setMsg(err.message || "Error");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">{t("admin.modules.title")}</h1>
        <p className="admin-sub">{t("admin.modules.sub")}</p>
      </div>
      {msg ? <div className="auth-error" style={{ marginBottom: 12 }}>{msg}</div> : null}
      <div className="client-table-card">
        <table className="client-table">
          <thead>
            <tr>
              <th>{t("admin.modules.col.module")}</th>
              <th>{t("admin.modules.col.default")}</th>
              <th>{t("admin.modules.col.plan")}</th>
              <th>{t("admin.modules.col.org")}</th>
              <th>{t("admin.users.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {catalog.map((m) => {
              const act = orgActs.get(m.clave);
              const orgState = act ? (act.activo ? "on" : "off") : "default";
              return (
                <tr key={m.clave}>
                  <td>
                    <strong>{m.nombre_visible || m.clave}</strong>
                    <div className="admin-cell-muted">{m.clave}</div>
                  </td>
                  <td>{m.activo_por_default === false ? t("admin.modules.off") : t("admin.modules.on")}</td>
                  <td>{m.requiere_plan || "—"}</td>
                  <td>
                    {orgState === "default" && t("admin.modules.inherit")}
                    {orgState === "on" && t("admin.modules.on")}
                    {orgState === "off" && t("admin.modules.off")}
                  </td>
                  <td>
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={pending}
                        onClick={() => setOrgActive(m.clave, true)}
                      >
                        {t("admin.modules.forceOn")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={pending}
                        onClick={() => setOrgActive(m.clave, false)}
                      >
                        {t("admin.modules.forceOff")}
                      </button>
                      {act ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={pending}
                          onClick={() => clearAct(act.id)}
                        >
                          {t("admin.modules.clear")}
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
      <p className="admin-sub" style={{ marginTop: 16 }}>{t("admin.modules.hint")}</p>
    </div>
  );
}
