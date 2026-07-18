import { useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { hasPermission } from "@/lib/auth/permissions";
import { useI18n } from "@/hooks/use-i18n.js";
import { longDate } from "@/lib/format/dates";
import { ADMIN_AUDIT_ACTIONS } from "@salesapp/shared/auth/permission-catalog.js";

const ACTION_OPTIONS = [
  { value: "", key: "admin.logs.filter.allActions" },
  { value: ADMIN_AUDIT_ACTIONS.CAMBIO_ROL, key: "admin.logs.action.cambio_rol" },
  { value: ADMIN_AUDIT_ACTIONS.CAMBIO_PLAN, key: "admin.logs.action.cambio_plan" },
  { value: ADMIN_AUDIT_ACTIONS.CREACION_ROL, key: "admin.logs.action.creacion_rol" },
  { value: ADMIN_AUDIT_ACTIONS.EDICION_ROL, key: "admin.logs.action.edicion_rol" },
  { value: ADMIN_AUDIT_ACTIONS.ELIMINACION_ROL, key: "admin.logs.action.eliminacion_rol" },
  { value: ADMIN_AUDIT_ACTIONS.EDICION_PERMISOS_USUARIO, key: "admin.logs.action.edicion_permisos_usuario" },
  { value: ADMIN_AUDIT_ACTIONS.ACTIVACION_CUENTA, key: "admin.logs.action.activacion_cuenta" },
  { value: ADMIN_AUDIT_ACTIONS.DESACTIVACION_CUENTA, key: "admin.logs.action.desactivacion_cuenta" },
  { value: ADMIN_AUDIT_ACTIONS.RESPUESTA_TICKET_SOPORTE, key: "admin.logs.action.respuesta_ticket_soporte" },
  { value: ADMIN_AUDIT_ACTIONS.CAMBIO_ESTADO_TICKET, key: "admin.logs.action.cambio_estado_ticket" },
];

function formatDetalle(detalle) {
  if (!detalle || typeof detalle !== "object") return "—";
  try {
    return JSON.stringify(detalle, null, 2);
  } catch {
    return String(detalle);
  }
}

function detailSummary(detalle) {
  if (!detalle || typeof detalle !== "object") return "—";
  if (detalle.de != null || detalle.a != null) {
    return `${detalle.de ?? "—"} → ${detalle.a ?? "—"}`;
  }
  if (detalle.fragmento) return String(detalle.fragmento);
  if (detalle.tipo) return String(detalle.tipo);
  return "…";
}

export function AdminLogsPage() {
  const { t, lang } = useI18n();
  const session = useOutletContext();
  const [searchParams] = useSearchParams();
  const [expanded, setExpanded] = useState(null);

  const filters = useMemo(() => ({
    from: searchParams.get("from") || "",
    to: searchParams.get("to") || "",
    actor: searchParams.get("actor") || "",
    accion: searchParams.get("accion") || "",
  }), [searchParams]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
    if (filters.actor) p.set("actor", filters.actor);
    if (filters.accion) p.set("accion", filters.accion);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [filters]);

  const { loading, data, error } = useAdminFetch("logs", qs || "?");
  const { data: sellers } = useAdminFetch("sellers", "");

  if (!hasPermission(session?.profile, "ver_logs_administracion")) {
    return <div className="admin-page admin-empty">{t("admin.logs.forbidden")}</div>;
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const exportHref = `/api/v1/admin/export/logs${qs}`;
  const actionLabel = (accion) => {
    const opt = ACTION_OPTIONS.find((o) => o.value === accion);
    return opt ? t(opt.key) : accion;
  };

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">{t("admin.logs.title")}</h1>
        <p className="admin-sub">{t("admin.logs.sub")}</p>
      </div>

      <div className="admin-filters">
        <form method="GET" action="/admin/logs" className="admin-filters-form">
          <div className="admin-filter-field">
            <label htmlFor="logs-from">{t("admin.logs.filter.from")}</label>
            <input id="logs-from" type="date" name="from" defaultValue={filters.from} className="auth-input" />
          </div>
          <div className="admin-filter-field">
            <label htmlFor="logs-to">{t("admin.logs.filter.to")}</label>
            <input id="logs-to" type="date" name="to" defaultValue={filters.to} className="auth-input" />
          </div>
          <div className="admin-filter-field">
            <label htmlFor="logs-actor">{t("admin.logs.filter.actor")}</label>
            <select id="logs-actor" name="actor" defaultValue={filters.actor} className="auth-input">
              <option value="">{t("admin.logs.filter.allActors")}</option>
              {(Array.isArray(sellers) ? sellers : []).map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.email || s.id}</option>
              ))}
            </select>
          </div>
          <div className="admin-filter-field">
            <label htmlFor="logs-accion">{t("admin.logs.filter.action")}</label>
            <select id="logs-accion" name="accion" defaultValue={filters.accion} className="auth-input">
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>{t(o.key)}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary">{t("admin.filters.apply")}</button>
          {qs && <Link to="/admin/logs" className="btn btn-ghost">{t("common.clear")}</Link>}
        </form>
        <a href={exportHref} className="btn btn-ghost admin-export-btn">{t("admin.filters.exportCsv")}</a>
      </div>

      {loading && <div className="admin-page">{t("admin.loading.logs")}</div>}
      {error && <div className="admin-page admin-empty">{error}</div>}
      {!loading && !error && (
        <div className="client-table-card">
          {items.length === 0 ? (
            <div className="admin-empty">{t("admin.logs.empty")}</div>
          ) : (
            <table className="client-table admin-users-table">
              <thead>
                <tr>
                  <th>{t("admin.logs.col.fecha")}</th>
                  <th>{t("admin.logs.col.actor")}</th>
                  <th>{t("admin.logs.col.accion")}</th>
                  <th>{t("admin.logs.col.entidad")}</th>
                  <th>{t("admin.logs.col.detalle")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const open = expanded === row.id;
                  return (
                    <tr key={row.id}>
                      <td className="admin-cell-date">
                        {row.fecha ? longDate(String(row.fecha).slice(0, 10), lang) : "—"}
                        <div className="admin-cell-muted" style={{ fontSize: 12 }}>
                          {row.fecha ? String(row.fecha).slice(11, 19) : ""}
                        </div>
                      </td>
                      <td className="admin-cell-name" title={row.actor_email || undefined}>
                        {row.actor_nombre || "—"}
                      </td>
                      <td>{actionLabel(row.accion)}</td>
                      <td className="admin-cell-muted">
                        {row.entidad_afectada}
                        {row.entidad_id ? ` · ${String(row.entidad_id).slice(0, 8)}…` : ""}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setExpanded(open ? null : row.id)}
                        >
                          {open ? t("admin.logs.detail.hide") : detailSummary(row.detalle)}
                        </button>
                        {open && (
                          <pre className="admin-confirm-body" style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 12 }}>
                            {formatDetalle(row.detalle)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
