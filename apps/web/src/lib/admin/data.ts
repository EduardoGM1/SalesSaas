import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AdminFilters } from "./filters";
import type { MonthlyTrendPoint, SellerInfo, UserAdminFilters, UserStat } from "./types";

export type { MonthlyTrendPoint, SellerInfo, UserStat };

interface ProspectEmbed {
  name: string | null;
  name1: string | null;
  prospect_code: string | null;
}

export interface SaleItem {
  id: string;
  user_id: string;
  sale_date: string;
  vol: number;
  tours: number;
  contract: string | null;
  status: string | null;
  prospect: ProspectEmbed | null;
  seller: string;
}

export interface WorksheetItem {
  id: string;
  tool: string;
  updated_at: string | null;
  prospect: ProspectEmbed | null;
  seller: string;
  user_id: string;
  fields: number;
}

export interface WorksheetDetail extends WorksheetItem {
  data: Record<string, unknown>;
}

export interface CalendarItem {
  id: string;
  entry_date: string;
  type: string;
  note: string | null;
  vol: number | null;
  seller: string;
  prospect: ProspectEmbed | null;
}

export interface GoalItem {
  user_id: string;
  seller: string;
  year: number;
  month: number;
  vol: number;
  tours: number;
  ventas: number;
  dias: number;
  descansos: number;
}

export interface ActivityItem {
  id: string;
  type: string;
  title: string | null;
  note: string | null;
  activity_date: string | null;
  seller: string;
  prospect: ProspectEmbed | null;
  created_at: string | null;
}

export interface AdminOverview {
  usersCount: number;
  prospectsCount: number;
  salesCount: number;
  totalVolume: number;
  monthSalesCount: number;
  monthVolume: number;
  topSellers: { name: string; sales: number; volume: number }[];
  recentSales: SaleItem[];
  trend: MonthlyTrendPoint[];
}

function prospectName(p: ProspectEmbed | null): string {
  if (!p) return "Libre";
  return p.name || p.name1 || p.prospect_code || "—";
}

function asProspect(v: unknown): ProspectEmbed | null {
  if (!v) return null;
  const o = Array.isArray(v) ? v[0] : v;
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  return {
    name: (r.name as string) ?? null,
    name1: (r.name1 as string) ?? null,
    prospect_code: (r.prospect_code as string) ?? null,
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const loadSellers = cache(async (): Promise<Map<string, SellerInfo>> => {
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("id, full_name, email, role");
  const map = new Map<string, SellerInfo>();
  for (const p of data ?? []) {
    map.set(p.id, {
      id: p.id,
      name: p.full_name || p.email || `Usuario ${String(p.id).slice(0, 8)}`,
      email: p.email ?? null,
      role: p.role ?? "vendedor",
    });
  }
  return map;
});

export async function getSales(filters: AdminFilters = {}): Promise<SaleItem[]> {
  const sb = await createClient();
  const sellers = await loadSellers();
  let q = sb
    .from("sales")
    .select("id, user_id, sale_date, vol, tours, contract, status, prospect_name, prospects(name, name1, prospect_code)")
    .order("sale_date", { ascending: false });
  if (filters.userId) q = q.eq("user_id", filters.userId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.from) q = q.gte("sale_date", filters.from);
  if (filters.to) q = q.lte("sale_date", filters.to);
  const { data } = await q;
  return (data ?? []).map((s) => mapSaleRow(s, sellers));
}

function buildMonthlyTrend(sales: { sale_date: string; vol: unknown }[], months = 6): MonthlyTrendPoint[] {
  const now = new Date();
  const buckets = new Map<string, { sales: number; volume: number; label: string }>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, { sales: 0, volume: 0, label: `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}` });
  }
  for (const s of sales) {
    const key = String(s.sale_date ?? "").slice(0, 7);
    const b = buckets.get(key);
    if (b) {
      b.sales += 1;
      b.volume += num(s.vol);
    }
  }
  return [...buckets.entries()].map(([month, v]) => ({ month, ...v }));
}

function mapSaleRow(s: Record<string, unknown>, sellers: Map<string, SellerInfo>): SaleItem {
  const embedded = asProspect(s.prospects);
  const prospect = embedded ?? ((s.prospect_name as string)
    ? { name: s.prospect_name as string, name1: s.prospect_name as string, prospect_code: null }
    : null);
  return {
    id: s.id as string,
    user_id: s.user_id as string,
    sale_date: s.sale_date as string,
    vol: num(s.vol),
    tours: num(s.tours),
    contract: (s.contract as string) ?? null,
    status: (s.status as string) ?? null,
    prospect,
    seller: sellers.get(s.user_id as string)?.name ?? "—",
  };
}

export async function getSellerOptions(): Promise<SellerInfo[]> {
  const map = await loadSellers();
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getOverview(): Promise<AdminOverview> {
  const sb = await createClient();
  const sellers = await loadSellers();
  const monthPrefix = new Date().toISOString().slice(0, 7);

  const [usersRes, prospectsRes, salesLiteRes, recentRes] = await Promise.all([
    sb.from("profiles").select("*", { count: "exact", head: true }),
    sb.from("prospects").select("*", { count: "exact", head: true }),
    sb.from("sales").select("user_id, sale_date, vol, status"),
    sb
      .from("sales")
      .select("id, user_id, sale_date, vol, tours, contract, status, prospect_name, prospects(name, name1, prospect_code)")
      .order("sale_date", { ascending: false })
      .limit(8),
  ]);

  const salesRaw = (salesLiteRes.data ?? []).filter((s) => String(s.status || "") !== "cancelada");
  let totalVolume = 0;
  let monthVolume = 0;
  let monthSalesCount = 0;
  const perSeller = new Map<string, { name: string; sales: number; volume: number }>();

  for (const s of salesRaw) {
    const vol = num(s.vol);
    totalVolume += vol;
    if (String(s.sale_date ?? "").startsWith(monthPrefix)) {
      monthVolume += vol;
      monthSalesCount += 1;
    }
    const sellerName = sellers.get(s.user_id)?.name ?? "—";
    const agg = perSeller.get(s.user_id) ?? { name: sellerName, sales: 0, volume: 0 };
    agg.sales += 1;
    agg.volume += vol;
    perSeller.set(s.user_id, agg);
  }

  const recentSales = (recentRes.data ?? []).map((s) => mapSaleRow(s, sellers));

  return {
    usersCount: usersRes.count ?? 0,
    prospectsCount: prospectsRes.count ?? 0,
    salesCount: salesRaw.length,
    totalVolume,
    monthSalesCount,
    monthVolume,
    topSellers: [...perSeller.values()].sort((a, b) => b.volume - a.volume).slice(0, 5),
    recentSales,
    trend: buildMonthlyTrend(salesRaw),
  };
}

export async function getUsers(filters: UserAdminFilters = {}): Promise<UserStat[]> {
  const sb = await createClient();
  let profilesQuery = sb
    .from("profiles")
    .select("id, full_name, email, role, created_at, is_active, is_super_admin, admin_permissions, user_permissions")
    .order("created_at", { ascending: true });

  if (filters.role) profilesQuery = profilesQuery.eq("role", filters.role);
  if (filters.state === "active") profilesQuery = profilesQuery.eq("is_active", true);
  if (filters.state === "inactive") profilesQuery = profilesQuery.eq("is_active", false);
  if (filters.q) {
    const q = filters.q.replace(/[%_]/g, "");
    if (q) profilesQuery = profilesQuery.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const [profilesRes, prospectsRes, salesRes] = await Promise.all([
    profilesQuery,
    sb.from("prospects").select("user_id"),
    sb.from("sales").select("user_id, vol, status"),
  ]);

  const prospectsByUser = new Map<string, number>();
  for (const p of prospectsRes.data ?? []) prospectsByUser.set(p.user_id, (prospectsByUser.get(p.user_id) ?? 0) + 1);

  const salesByUser = new Map<string, { count: number; vol: number }>();
  for (const s of salesRes.data ?? []) {
    if (String(s.status || "") === "cancelada") continue;
    const agg = salesByUser.get(s.user_id) ?? { count: 0, vol: 0 };
    agg.count += 1;
    agg.vol += num(s.vol);
    salesByUser.set(s.user_id, agg);
  }

  return (profilesRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name || p.email || `Usuario ${String(p.id).slice(0, 8)}`,
    email: p.email ?? null,
    role: p.role ?? "vendedor",
    created_at: p.created_at ?? null,
    is_active: p.is_active ?? true,
    is_super_admin: p.is_super_admin ?? false,
    admin_permissions: p.admin_permissions ?? [],
    user_permissions: (p as { user_permissions?: string[] }).user_permissions ?? [],
    prospects: prospectsByUser.get(p.id) ?? 0,
    sales: salesByUser.get(p.id)?.count ?? 0,
    volume: salesByUser.get(p.id)?.vol ?? 0,
  }));
}

export async function getWorksheets(filters: AdminFilters = {}): Promise<WorksheetItem[]> {
  const sb = await createClient();
  const sellers = await loadSellers();
  let q = sb
    .from("tool_calculations")
    .select("id, user_id, tool, data, updated_at, prospects(name, name1, prospect_code)")
    .eq("tool", "worksheet")
    .order("updated_at", { ascending: false });
  if (filters.userId) q = q.eq("user_id", filters.userId);
  if (filters.from) q = q.gte("updated_at", filters.from);
  if (filters.to) q = q.lte("updated_at", `${filters.to}T23:59:59.999Z`);
  const { data } = await q;

  return (data ?? []).map((w) => ({
    id: w.id,
    user_id: w.user_id,
    tool: w.tool,
    updated_at: w.updated_at ?? null,
    prospect: asProspect(w.prospects),
    seller: sellers.get(w.user_id)?.name ?? "—",
    fields: w.data && typeof w.data === "object" ? Object.keys(w.data).length : 0,
  }));
}

export async function getWorksheetDetail(id: string): Promise<WorksheetDetail | null> {
  const sb = await createClient();
  const sellers = await loadSellers();
  const { data } = await sb
    .from("tool_calculations")
    .select("id, user_id, tool, data, updated_at, prospects(name, name1, prospect_code)")
    .eq("id", id)
    .eq("tool", "worksheet")
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    user_id: data.user_id,
    tool: data.tool,
    updated_at: data.updated_at ?? null,
    prospect: asProspect(data.prospects),
    seller: sellers.get(data.user_id)?.name ?? "—",
    fields: data.data && typeof data.data === "object" ? Object.keys(data.data).length : 0,
    data: (data.data as Record<string, unknown>) ?? {},
  };
}

export async function getCalendarEntries(filters: AdminFilters = {}): Promise<CalendarItem[]> {
  const sb = await createClient();
  const sellers = await loadSellers();
  let q = sb
    .from("calendar_entries")
    .select("id, entry_date, type, note, vol, user_id, prospects(name, name1, prospect_code)")
    .order("entry_date", { ascending: false })
    .limit(500);
  if (filters.userId) q = q.eq("user_id", filters.userId);
  if (filters.from) q = q.gte("entry_date", filters.from);
  if (filters.to) q = q.lte("entry_date", filters.to);
  const { data } = await q;
  return (data ?? []).map((e) => ({
    id: e.id,
    entry_date: e.entry_date,
    type: e.type,
    note: e.note,
    vol: e.vol != null ? num(e.vol) : null,
    seller: sellers.get(e.user_id)?.name ?? "—",
    prospect: asProspect(e.prospects),
  }));
}

export async function getGoals(filters: AdminFilters = {}): Promise<GoalItem[]> {
  const sb = await createClient();
  const sellers = await loadSellers();
  let q = sb.from("goals").select("*").order("year", { ascending: false }).order("month", { ascending: false });
  if (filters.userId) q = q.eq("user_id", filters.userId);
  const { data } = await q;
  return (data ?? []).map((g) => ({
    user_id: g.user_id,
    seller: sellers.get(g.user_id)?.name ?? "—",
    year: g.year,
    month: g.month,
    vol: num(g.vol),
    tours: num(g.tours),
    ventas: num(g.ventas),
    dias: num(g.dias),
    descansos: num(g.descansos),
  }));
}

export async function getActivities(filters: AdminFilters = {}): Promise<ActivityItem[]> {
  const sb = await createClient();
  const sellers = await loadSellers();
  let q = sb
    .from("activities")
    .select("id, type, title, note, activity_date, created_at, user_id, prospects(name, name1, prospect_code)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (filters.userId) q = q.eq("user_id", filters.userId);
  if (filters.from) q = q.gte("activity_date", filters.from);
  if (filters.to) q = q.lte("activity_date", filters.to);
  const { data } = await q;
  return (data ?? []).map((a) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    note: a.note,
    activity_date: a.activity_date,
    created_at: a.created_at,
    seller: sellers.get(a.user_id)?.name ?? "—",
    prospect: asProspect(a.prospects),
  }));
}

export { prospectName };
