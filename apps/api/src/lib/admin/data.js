const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function monthLabel(monthKey) {
  const [y, m] = String(monthKey || "").split("-");
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return monthKey || "—";
  return `${MONTHS_ES[mi]} ${y}`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function loadSellers(sb) {
  const { data } = await sb.from("profiles").select("id, full_name, email, role");
  const map = new Map();
  for (const p of data ?? []) {
    map.set(p.id, {
      id: p.id,
      name: p.full_name || p.email || `Usuario ${String(p.id).slice(0, 8)}`,
      email: p.email ?? null,
      role: p.role ?? "vendedor",
    });
  }
  return map;
}

export async function getSellerOptions(sb) {
  const map = await loadSellers(sb);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Overview agregado vía RPC — sin PII de clientes. */
export async function getOverview(sb) {
  const { data, error } = await sb.rpc("admin_platform_overview");
  if (error) throw new Error(error.message || "No se pudo cargar el resumen.");
  const raw = data && typeof data === "object" ? data : {};
  const trend = Array.isArray(raw.trend)
    ? raw.trend.map((t) => ({
        month: t.month,
        label: monthLabel(t.month),
        sales: num(t.sales),
        volume: num(t.volume),
      }))
    : [];
  return {
    usersCount: num(raw.usersCount),
    prospectsCount: num(raw.prospectsCount),
    salesCount: num(raw.salesCount),
    totalVolume: num(raw.totalVolume),
    monthSalesCount: num(raw.monthSalesCount),
    monthVolume: num(raw.monthVolume),
    topSellers: Array.isArray(raw.topSellers)
      ? raw.topSellers.map((s) => ({
          name: s.name || "—",
          sales: num(s.sales),
          volume: num(s.volume),
        }))
      : [],
    trend,
  };
}

export async function getUsers(sb, filters = {}) {
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

  const [profilesRes, statsRes] = await Promise.all([
    profilesQuery,
    sb.rpc("admin_user_stats"),
  ]);

  if (statsRes.error) throw new Error(statsRes.error.message || "No se pudieron cargar estadísticas.");

  const statsByUser = new Map();
  for (const row of statsRes.data ?? []) {
    statsByUser.set(row.user_id, {
      prospects: num(row.prospects),
      sales: num(row.sales),
      volume: num(row.volume),
    });
  }

  return (profilesRes.data ?? []).map((p) => {
    const stats = statsByUser.get(p.id) ?? { prospects: 0, sales: 0, volume: 0 };
    return {
      id: p.id,
      name: p.full_name || p.email || `Usuario ${String(p.id).slice(0, 8)}`,
      email: p.email ?? null,
      role: p.role ?? "vendedor",
      created_at: p.created_at ?? null,
      is_active: p.is_active ?? true,
      is_super_admin: p.is_super_admin ?? false,
      admin_permissions: p.admin_permissions ?? [],
      user_permissions: p.user_permissions ?? [],
      prospects: stats.prospects,
      sales: stats.sales,
      volume: stats.volume,
    };
  });
}

/** Uso de tools agregado — sin data jsonb ni nombres de clientes. */
export async function getToolsUsage(sb, filters = {}) {
  const pFrom = filters.from ? `${filters.from}T00:00:00.000Z` : null;
  const pTo = filters.to ? `${filters.to}T23:59:59.999Z` : null;
  const pUserId = filters.userId || null;

  const { data, error } = await sb.rpc("admin_tools_usage", {
    p_from: pFrom,
    p_to: pTo,
    p_user_id: pUserId,
  });
  if (error) throw new Error(error.message || "No se pudo cargar el uso de herramientas.");

  const raw = data && typeof data === "object" ? data : {};
  const byTool = Array.isArray(raw.byTool)
    ? raw.byTool.map((t) => ({
        tool: t.tool,
        saves: num(t.saves),
        uniqueUsers: num(t.uniqueUsers),
        libre: num(t.libre),
        linked: num(t.linked),
      }))
    : [];

  const totalSaves = num(raw.totalSaves) || byTool.reduce((a, t) => a + t.saves, 0);

  return {
    totalSaves,
    byTool,
    topUsers: Array.isArray(raw.topUsers)
      ? raw.topUsers.map((u) => ({
          user_id: u.user_id,
          name: u.name || "—",
          total: num(u.total),
          survey: num(u.survey),
          vacaciones: num(u.vacaciones),
          worksheet: num(u.worksheet),
        }))
      : [],
    trend: Array.isArray(raw.trend)
      ? raw.trend.map((t) => ({
          month: t.month,
          label: monthLabel(t.month),
          survey: num(t.survey),
          vacaciones: num(t.vacaciones),
          worksheet: num(t.worksheet),
        }))
      : [],
  };
}

export async function getGoals(sb, filters = {}) {
  const sellers = await loadSellers(sb);
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
