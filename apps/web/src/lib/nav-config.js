import {
  BarChart3,
  Calendar,
  MessageSquareText,
  Receipt,
  Shield,
  Target,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";

/** Grupos de navegación principal (sidebar escritorio + barra inferior móvil). */
export const NAV_GROUPS = [
  [
    { href: "/", label: "Agenda", icon: Calendar },
    { href: "/metas", label: "Metas", icon: Target },
    { href: "/clients", label: "Clientes", icon: Users },
    { href: "/goals", label: "Dashboard", icon: BarChart3, menuHidden: true },
    { href: "/tools", label: "Herramientas", icon: Wrench },
    { href: "/sales", label: "Ventas", icon: Receipt, feature: "sales:history" },
  ],
  [
    {
      href: "/network",
      label: "Red",
      icon: UserPlus,
      cloudOnly: true,
      mobileHeader: true,
    },
    {
      href: "/messages",
      label: "Mensajes",
      icon: MessageSquareText,
      cloudOnly: true,
      mobileHeader: true,
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

export function isNavItemActive(pathname, href) {
  if (href === "/") return pathname === "/";
  if (href === "/network") {
    return pathname.startsWith("/network") || pathname.startsWith("/red");
  }
  return pathname.startsWith(href);
}

export function itemVisible(item, { cloudEnabled, isAdmin, canFeature }) {
  if (item.menuHidden) return false;
  if (item.adminOnly && !isAdmin) return false;
  if (item.cloudOnly && !cloudEnabled) return false;
  if (item.feature && !canFeature(item.feature)) return false;
  return true;
}

export function getSidebarNavGroups(options) {
  return NAV_GROUPS.map((group) =>
    group.filter((item) => itemVisible(item, options) && !item.mobileHeader),
  ).filter((group) => group.length > 0);
}

/** Ítems de la barra inferior móvil (sin Red/Mensajes). */
export function getMobileBottomNavItems(options) {
  const items = flattenNavGroups().filter(
    (item) => !item.mobileHeader && itemVisible(item, options),
  );
  if (options.isAdmin) items.push(ADMIN_NAV_ITEM);
  return items;
}

/** Ítems del header móvil (Red + Mensajes). */
export function getMobileHeaderNavItems(options) {
  return flattenNavGroups().filter(
    (item) => item.mobileHeader && itemVisible(item, options),
  );
}
