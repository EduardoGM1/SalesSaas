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

/** Grupos de navegación principal (sidebar escritorio + barra inferior móvil). */
export const NAV_GROUPS = [
  [
    { href: "/", label: "Agenda", icon: Calendar },
    { href: "/metas", label: "Metas", icon: Target },
    { href: "/clients", label: "Clientes", icon: Users },
    // Solo sidebar: gestión de sala (invitar / ver expedientes). No va al header.
    {
      href: "/team",
      label: "Equipo",
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
  if (item.menuHidden) return false;
  if (item.adminOnly && !isAdmin) return false;
  if (item.cloudOnly && !cloudEnabled) return false;
  if (item.gerenteOnly && !isGerenteSala) return false;
  if (item.personalOnly && workspaceTipo !== "personal") return false;
  if (item.salaOnly && workspaceTipo !== "sala_de_venta") return false;
  if (item.feature && !canFeature(item.feature)) return false;
  return true;
}

export function getSidebarNavGroups(options) {
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
