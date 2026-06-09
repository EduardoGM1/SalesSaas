export interface AdminFilters {
  from?: string;
  to?: string;
  userId?: string;
  status?: string;
}

export function parseAdminFilters(
  sp: Record<string, string | string[] | undefined>
): AdminFilters {
  const pick = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  return {
    from: pick("from"),
    to: pick("to"),
    userId: pick("user"),
    status: pick("status"),
  };
}

import type { UserAdminFilters } from "./types";

export function parseUserAdminFilters(
  sp: Record<string, string | string[] | undefined>
): UserAdminFilters {
  const pick = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const state = pick("state");
  return {
    q: pick("q"),
    role: pick("role"),
    state: state === "active" || state === "inactive" ? state : undefined,
  };
}

export function userFiltersToSearchParams(f: UserAdminFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.role) p.set("role", f.role);
  if (f.state) p.set("state", f.state);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Ruta /admin/users con filtros y parámetros opcionales (confirmación, errores). */
export function userAdminUrl(
  f: UserAdminFilters,
  extra?: Record<string, string | undefined>
): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.role) p.set("role", f.role);
  if (f.state) p.set("state", f.state);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
    }
  }
  const s = p.toString();
  return `/admin/users${s ? `?${s}` : ""}`;
}

export function filtersToSearchParams(f: AdminFilters): string {
  const p = new URLSearchParams();
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.userId) p.set("user", f.userId);
  if (f.status) p.set("status", f.status);
  const s = p.toString();
  return s ? `?${s}` : "";
}
