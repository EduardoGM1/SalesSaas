"use client";

import dynamic from "next/dynamic";

export const SidebarClient = dynamic(
  () => import("@/components/layout/sidebar").then((mod) => ({ default: mod.Sidebar })),
  { ssr: false },
);
