import { PERMISSION_CATALOG } from "@salesapp/shared/auth/permission-catalog.js";

const PERM_LABEL = new Map(PERMISSION_CATALOG.map((p) => [p.clave, p.nombre_visible]));

/** Etiqueta legible de una clave de permiso (fallback = clave). */
export function permissionLabel(clave) {
  return PERM_LABEL.get(String(clave || "")) || String(clave || "—");
}

/**
 * Convierte el jsonb `detalle` de logs_administracion en líneas de lenguaje natural.
 * @param {object|null} detalle
 * @param {(key: string, vars?: object) => string} t
 * @returns {string[]}
 */
export function narrateAdminLogDetalle(detalle, t) {
  if (!detalle || typeof detalle !== "object") return [t("admin.logs.narrative.empty")];

  const lines = [];
  const tipo = detalle.tipo;

  if (tipo === "features_overrides" || tipo === "features_legacy") {
    const list = Array.isArray(detalle.a) ? detalle.a : Array.isArray(detalle.enabled) ? detalle.enabled : [];
    if (!list.length) {
      lines.push(t("admin.logs.narrative.featuresCleared"));
    } else {
      lines.push(t("admin.logs.narrative.featuresUpdated"));
      for (const key of list) {
        lines.push(`• ${t("admin.logs.narrative.featureItem", { name: permissionLabel(key) })}`);
      }
    }
    return lines;
  }

  if (tipo === "admin_permissions" || tipo === "overrides") {
    const list = Array.isArray(detalle.a)
      ? detalle.a
      : Array.isArray(detalle.permission_keys)
        ? detalle.permission_keys
        : [];
    lines.push(t("admin.logs.narrative.permissionsUpdated"));
    if (list.length) {
      for (const key of list) {
        lines.push(`• ${permissionLabel(key)}`);
      }
    } else if (detalle.de != null || detalle.a != null) {
      lines.push(t("admin.logs.narrative.fromTo", {
        from: formatValue(detalle.de, t),
        to: formatValue(detalle.a, t),
      }));
    }
    return lines;
  }

  if (detalle.permission_keys && Array.isArray(detalle.permission_keys) && detalle.nombre) {
    lines.push(t("admin.logs.narrative.rolePerms", { name: detalle.nombre }));
    for (const key of detalle.permission_keys.slice(0, 12)) {
      lines.push(`• ${permissionLabel(key)}`);
    }
    if (detalle.permission_keys.length > 12) {
      lines.push(t("admin.logs.narrative.more", { n: detalle.permission_keys.length - 12 }));
    }
    return lines;
  }

  if (detalle.de != null || detalle.a != null) {
    lines.push(t("admin.logs.narrative.fromTo", {
      from: formatValue(detalle.de, t),
      to: formatValue(detalle.a, t),
    }));
  }

  if (detalle.nombre) {
    lines.push(t("admin.logs.narrative.named", { name: detalle.nombre }));
  }
  if (detalle.slug) {
    lines.push(t("admin.logs.narrative.slug", { slug: detalle.slug }));
  }
  if (detalle.fragmento) {
    lines.push(t("admin.logs.narrative.reply", { text: String(detalle.fragmento) }));
  }
  if (detalle.is_active === true) lines.push(t("admin.logs.narrative.activated"));
  if (detalle.is_active === false) lines.push(t("admin.logs.narrative.deactivated"));

  if (!lines.length) {
    lines.push(t("admin.logs.narrative.generic"));
  }
  return lines;
}

function formatValue(v, t) {
  if (v == null || v === "") return t("admin.logs.narrative.none");
  if (typeof v === "boolean") return v ? t("admin.logs.narrative.yes") : t("admin.logs.narrative.no");
  if (Array.isArray(v)) {
    if (!v.length) return t("admin.logs.narrative.none");
    return v.map((k) => permissionLabel(k)).join(", ");
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Resumen corto para la celda colapsada. */
export function narrateAdminLogSummary(detalle, t) {
  const lines = narrateAdminLogDetalle(detalle, t);
  return lines[0] || t("admin.logs.narrative.empty");
}
