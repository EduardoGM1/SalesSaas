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

/** Overview agregado — uso/crecimiento de plataforma (sin desempeño comercial individual). */
export async function getOverview(sb) {
  const { data, error } = await sb.rpc("admin_platform_overview");
  if (error) throw new Error(error.message || "No se pudo cargar el resumen.");
  const raw = data && typeof data === "object" ? data : {};

  const mapMonth = (rows, extraKeys = []) =>
    (Array.isArray(rows) ? rows : []).map((t) => {
      const row = {
        month: t.month,
        label: monthLabel(t.month),
      };
      for (const k of extraKeys) row[k] = num(t[k]);
      return row;
    });

  const usersMonth = num(raw.usersCreatedMonth);
  const usersPrev = num(raw.usersCreatedPrevMonth);
  const growthUsersMoM = usersPrev <= 0
    ? (usersMonth > 0 ? 100 : 0)
    : Math.round(((usersMonth - usersPrev) / usersPrev) * 1000) / 10;

  const usersActiveAcct = num(raw.usersActiveAccounts ?? raw.usersActive ?? raw.usersCount);

  return {
    usersCount: num(raw.usersCount),
    usersActiveAccounts: usersActiveAcct,
    usersInactiveAccounts: num(raw.usersInactiveAccounts),
    usersCreatedToday: num(raw.usersCreatedToday),
    usersCreatedWeek: num(raw.usersCreatedWeek),
    usersCreatedMonth: usersMonth,
    usersCreatedPrevMonth: usersPrev,
    growthUsersMoM,
    usersActiveToday: num(raw.usersActiveToday),
    usersActiveWeek: num(raw.usersActiveWeek),
    usersActiveMonth: num(raw.usersActiveMonth),
    pctActiveAccounts: num(raw.pctActiveAccounts),
    pctActiveWeek: num(raw.pctActiveWeek),
    sessionsCompleted30d: num(raw.sessionsCompleted30d),
    avgSessionMinutes: num(raw.avgSessionMinutes),
    totalSessionHours30d: num(raw.totalSessionHours30d),
    avgSessionsPerUser30d: num(raw.avgSessionsPerUser30d),
    prospectsCount: num(raw.prospectsCount),
    prospectsMonth: num(raw.prospectsMonth),
    toolSavesTotal: num(raw.toolSavesTotal),
    surveyTotal: num(raw.surveyTotal),
    surveyLinked: num(raw.surveyLinked),
    membershipsActive: num(raw.membershipsActive),
    usersTrend: mapMonth(raw.usersTrend, ["users"]),
    toolsByTool: Array.isArray(raw.toolsByTool)
      ? raw.toolsByTool.map((r) => ({
          tool: r.tool,
          saves: num(r.saves),
          libre: num(r.libre),
          linked: num(r.linked),
        }))
      : [],
    toolsTrend: mapMonth(raw.toolsTrend, ["survey", "vacaciones", "worksheet"]),
    generatedAt: raw.generatedAt ? String(raw.generatedAt) : null,
  };
}

/**
 * @param {object} sb
 * @param {object} [filters]
 * @param {{ includeMetrics?: boolean }} [options] includeMetrics=false omite RPC y campos sensibles
 */
export async function getUsers(sb, filters = {}, options = {}) {
  const includeMetrics = options.includeMetrics === true;
  const { loadMembershipsByUserIds } = await import("../../services/membership-service.js");

  let profilesQuery = sb
    .from("profiles")
    .select("id, full_name, email, role, role_id, created_at, is_active, is_super_admin, admin_permissions, user_permissions, last_seen_at")
    .order("created_at", { ascending: true });

  if (filters.role) profilesQuery = profilesQuery.eq("role", filters.role);
  if (filters.state === "active") profilesQuery = profilesQuery.eq("is_active", true);
  if (filters.state === "inactive") profilesQuery = profilesQuery.eq("is_active", false);
  if (filters.q) {
    const q = filters.q.replace(/[%_]/g, "");
    if (q) profilesQuery = profilesQuery.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  let profilesRes;
  let statsRes = { data: [], error: null };
  if (includeMetrics) {
    [profilesRes, statsRes] = await Promise.all([
      profilesQuery,
      sb.rpc("admin_user_stats"),
    ]);
  } else {
    profilesRes = await profilesQuery;
  }

  if (profilesRes.error) {
    // Fallback si role_id aún no existe
    let legacyQuery = sb
      .from("profiles")
      .select("id, full_name, email, role, created_at, is_active, is_super_admin, admin_permissions, user_permissions")
      .order("created_at", { ascending: true });
    if (filters.role) legacyQuery = legacyQuery.eq("role", filters.role);
    if (filters.state === "active") legacyQuery = legacyQuery.eq("is_active", true);
    if (filters.state === "inactive") legacyQuery = legacyQuery.eq("is_active", false);
    if (filters.q) {
      const q = filters.q.replace(/[%_]/g, "");
      if (q) legacyQuery = legacyQuery.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
    }
    profilesRes = await legacyQuery;
  }

  if (includeMetrics && statsRes.error) {
    throw new Error(statsRes.error.message || "No se pudieron cargar estadísticas.");
  }
  if (profilesRes.error) throw new Error(profilesRes.error.message || "No se pudieron cargar usuarios.");

  const statsByUser = new Map();
  if (includeMetrics) {
    for (const row of statsRes.data ?? []) {
      statsByUser.set(row.user_id, {
        prospects: num(row.prospects),
        sales: num(row.sales),
        volume: num(row.volume),
      });
    }
  }

  const profiles = profilesRes.data ?? [];
  let memberships = new Map();
  try {
    memberships = await loadMembershipsByUserIds(sb, profiles.map((p) => p.id));
  } catch {
    memberships = new Map();
  }

  const roleIds = [...new Set(profiles.map((p) => p.role_id).filter(Boolean))];
  const roleNameById = new Map();
  if (roleIds.length) {
    const { data: roleRows, error: rolesErr } = await sb.from("roles").select("id, nombre, slug").in("id", roleIds);
    if (!rolesErr) {
      for (const r of roleRows ?? []) roleNameById.set(r.id, r);
    }
  }

  return profiles.map((p) => {
    const mem = memberships.get(p.id) || { plan: "basico", status: "activa" };
    const roleMeta = p.role_id ? roleNameById.get(p.role_id) : null;
    const row = {
      id: p.id,
      name: p.full_name || p.email || `Usuario ${String(p.id).slice(0, 8)}`,
      email: p.email ?? null,
      role: p.role ?? "vendedor",
      role_id: p.role_id ?? null,
      role_nombre: roleMeta?.nombre ?? null,
      role_slug: roleMeta?.slug ?? null,
      created_at: p.created_at ?? null,
      last_seen_at: p.last_seen_at ?? null,
      is_active: p.is_active ?? true,
      is_super_admin: p.is_super_admin ?? false,
      admin_permissions: p.admin_permissions ?? [],
      user_permissions: p.user_permissions ?? [],
      plan: mem.plan,
      membership_status: mem.status,
      membership_fecha_inicio: mem.fecha_inicio ?? null,
      membership_fecha_proximo_cobro: mem.fecha_proximo_cobro ?? null,
    };
    if (includeMetrics) {
      const stats = statsByUser.get(p.id) ?? { prospects: 0, sales: 0, volume: 0 };
      row.prospects = stats.prospects;
      row.sales = stats.sales;
      row.volume = stats.volume;
    }
    return row;
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

  // Sin ranking de vendedores individuales: solo agregados (byTool + tendencia).
  return {
    totalSaves,
    byTool,
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
