import {
  BarChart3,
  Calendar,
  MessageSquareText,
  MessagesSquare,
  Receipt,
  Shield,
  Target,
  UserPlus,
  Users,
  UsersRound,
  Wrench,
} from "lucide-react";
import { RH_TOOL_FLAGS, ROYAL_HOLIDAY_EMPRESA_ID, WORKSHEET_ROYAL_HOLIDAY_FLAG } from "@/lib/auth/tool-flags.js";

/** Grupos de navegación principal (sidebar escritorio + barra inferior móvil). */
export const NAV_GROUPS = [
  [
    { href: "/", label: "Agenda", icon: Calendar },
    { href: "/metas", label: "Metas", icon: Target },
    { href: "/clients", label: "Clientes", icon: Users },
    // Solo sidebar: gestión de sala (invitar / ver expedientes). No va al header.
    {
      href: "/team",
      label: "Mi equipo",
      icon: UsersRound,
      gerenteOnly: true,
      keepInSidebar: true,
    },
    { href: "/goals", label: "Dashboard", icon: BarChart3 },
    { href: "/tools", label: "Herramientas", icon: Wrench },
    { href: "/sales", label: "Ventas", icon: Receipt, feature: "sales:history" },
  ],
  [
    // Personal → Red | Sala → Chat de equipo (mismo slot del header, iconos distintos).
    {
      href: "/network",
      label: "Red",
      icon: UserPlus,
      cloudOnly: true,
      mobileHeader: true,
      personalOnly: true,
    },
    {
      href: "/messages?scope=team",
      label: "Chat equipo",
      icon: MessagesSquare,
      cloudOnly: true,
      mobileHeader: true,
      salaOnly: true,
      badgeKey: "messages",
    },
    {
      href: "/messages",
      label: "Mensajes",
      icon: MessageSquareText,
      cloudOnly: true,
      mobileHeader: true,
      personalOnly: true,
      badgeKey: "messages",
    },
  ],
];

export const ADMIN_NAV_ITEM = {
  href: "/admin",
  label: "Admin",
  icon: Shield,
  adminOnly: true,
};

/** Orden fijo del sidebar recortado en sala Royal Holiday (Liner / Cerrador / OPC). */
export const RH_COMPACT_NAV_HREFS = ["/", "/clients", "/metas"];

/**
 * OPC en sala RH: el icono Calendario abre Premanifiesto (olas), no la Agenda CRM.
 * Antes del recorte, OPC llegaba vía Herramientas → Operaciones sala → Premanifiesto.
 */
export const RH_OPC_CALENDAR_HREF = "/ops/rh/premanifiesto";

/**
 * Recorte de 3 iconos SOLO si el workspace activo es la sala RH
 * (empresa Royal Holiday o flag worksheet.royal_holiday en sesión),
 * para Liner/Cerrador/OPC/.rep. El paquete Liner no incluye el flag RH,
 * así que empresa_id del workspace es la señal primaria.
 * Gerente, admin, Marketing y cualquier otra sala: sidebar completo.
 */
export function shouldCompactRhFloorNav({
  workspaceTipo,
  isGerenteSala,
  isAdmin,
  roleSlug,
  flags,
  empresaId,
} = {}) {
  if (isAdmin || isGerenteSala) return false;
  if (workspaceTipo !== "sala_de_venta") return false;
  const inRhSala =
    empresaId === ROYAL_HOLIDAY_EMPRESA_ID
    || flags?.[WORKSHEET_ROYAL_HOLIDAY_FLAG] === true;
  if (!inRhSala) return false;
  const slug = String(roleSlug || "").toLowerCase();
  if (slug === "gerente") return false;
  if (slug === "liner" || slug === "cerrador" || slug === "opc") return true;
  if (flags?.[RH_TOOL_FLAGS.premanifiestoOpc] === true) return true;
  if (flags?.[RH_TOOL_FLAGS.premanifiestoRep] === true) return true;
  return false;
}

/** Puesto OPC (slug o flag) dentro del recorte RH — Calendario = Premanifiesto. */
export function isRhOpcFloorNav({ roleSlug, flags } = {}) {
  const slug = String(roleSlug || "").toLowerCase();
  if (slug === "opc") return true;
  return flags?.[RH_TOOL_FLAGS.premanifiestoOpc] === true;
}

export function filterCompactRhNavItems(items = [], options = {}) {
  const byHref = new Map(items.map((item) => [item.href.split("?")[0], item]));
  const opcCalendar = isRhOpcFloorNav(options);
  return RH_COMPACT_NAV_HREFS.map((href) => {
    const item = byHref.get(href);
    if (!item) return null;
    if (opcCalendar && href === "/") {
      return { ...item, href: RH_OPC_CALENDAR_HREF, label: "Calendario" };
    }
    return item;
  }).filter(Boolean);
}

export function flattenNavGroups(groups = NAV_GROUPS) {
  return groups.flat();
}

export function isNavItemActive(pathname, href, search = "") {
  if (href === "/") return pathname === "/";
  if (href === "/network") {
    return pathname.startsWith("/network") || pathname.startsWith("/red");
  }
  if (href === "/messages?scope=team") {
    return pathname.startsWith("/messages") && String(search).includes("scope=team");
  }
  if (href === "/messages") {
    return pathname.startsWith("/messages") && !String(search).includes("scope=team");
  }
  const pathOnly = href.split("?")[0];
  return pathname.startsWith(pathOnly);
}

export function itemVisible(item, {
  cloudEnabled,
  isAdmin,
  canFeature,
  isGerenteSala,
  workspaceTipo,
}) {
  if (item.adminOnly && !isAdmin) return false;
  if (item.cloudOnly && !cloudEnabled) return false;
  if (item.gerenteOnly && !isGerenteSala) return false;
  if (item.personalOnly && workspaceTipo !== "personal") return false;
  if (item.salaOnly && workspaceTipo !== "sala_de_venta") return false;
  if (item.feature && !canFeature(item.feature)) return false;
  return true;
}

export function getSidebarNavGroups(options) {
  if (shouldCompactRhFloorNav(options)) {
    const items = flattenNavGroups().filter((item) => {
      if (!itemVisible(item, options)) return false;
      if (item.mobileHeader && !item.keepInSidebar) return false;
      return true;
    });
    const compact = filterCompactRhNavItems(items, options);
    return compact.length ? [compact] : [];
  }
  return NAV_GROUPS.map((group) =>
    group.filter((item) => {
      if (!itemVisible(item, options)) return false;
      if (item.mobileHeader && !item.keepInSidebar) return false;
      return true;
    }),
  ).filter((group) => group.length > 0);
}

/** Ítems de la barra inferior móvil (sin Red/Mensajes en header). */
export function getMobileBottomNavItems(options) {
  if (shouldCompactRhFloorNav(options)) {
    const items = flattenNavGroups().filter(
      (item) => !item.mobileHeader && itemVisible(item, options),
    );
    return filterCompactRhNavItems(items, options);
  }
  const items = flattenNavGroups().filter(
    (item) => !item.mobileHeader && itemVisible(item, options),
  );
  if (options.isAdmin) items.push(ADMIN_NAV_ITEM);
  return items;
}

/** Header: Red (personal) o Chat equipo (sala) + Mensajes solo en personal. */
export function getMobileHeaderNavItems(options) {
  return flattenNavGroups().filter(
    (item) => item.mobileHeader && itemVisible(item, options),
  );
}
