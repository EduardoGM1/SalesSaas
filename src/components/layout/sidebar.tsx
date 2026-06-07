"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Calendar, Target, Users, Wrench, Home, Settings, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/", label: "Agenda", icon: Calendar },
  { href: "/goals", label: "Dashboard", icon: BarChart3 },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/clients", label: "Clientes", icon: Users },
  { href: "/tools", label: "Herramientas", icon: Wrench },
];

const NAV_FOOTER = [
  { href: "/settings", label: "Ajustes", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const closeSidebar = useAppStore((s) => s.closeSidebar);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    const sb = createClient();
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await sb.from("profiles").select("role").eq("id", data.user.id).single();
      if (active && profile?.role === "admin") setIsAdmin(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const footer = [
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
    ...NAV_FOOTER,
  ];

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-navy/50 backdrop-blur-sm lg:hidden",
          sidebarOpen ? "block" : "hidden"
        )}
        onClick={closeSidebar}
      />
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-16 flex-col items-center bg-navy py-0 shadow-lg transition-transform lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <Link href="/" className="mb-2 flex h-[58px] w-full items-center justify-center border-b border-white/10" onClick={closeSidebar}>
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 shadow-md">
            <Home className="h-[18px] w-[18px] text-white" />
          </div>
        </Link>
        <nav className="flex w-full flex-1 flex-col items-center gap-1 px-2 py-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                onClick={closeSidebar}
                className={cn(
                  "group relative flex h-11 w-11 items-center justify-center rounded-[10px] border border-transparent text-white/45 transition-colors hover:bg-white/10 hover:text-white/85",
                  active && "border-blue-400/40 bg-blue-500/20 text-blue-300"
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[300] -translate-y-1/2 whitespace-nowrap rounded-md border border-white/10 bg-navy2 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
        <nav className="flex w-full flex-col items-center gap-1 border-t border-white/10 px-2 py-2">
          {footer.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                onClick={closeSidebar}
                className={cn(
                  "group relative flex h-11 w-11 items-center justify-center rounded-[10px] border border-transparent text-white/45 transition-colors hover:bg-white/10 hover:text-white/85",
                  active && "border-blue-400/40 bg-blue-500/20 text-blue-300"
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[300] -translate-y-1/2 whitespace-nowrap rounded-md border border-white/10 bg-navy2 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
