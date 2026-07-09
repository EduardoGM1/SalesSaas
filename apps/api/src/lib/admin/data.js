const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function prospectName(p) {
  if (!p) return "Libre";
  return p.name || p.name1 || p.prospect_code || "—";
}

function asProspect(v) {
  if (!v) return null;
  const o = Array.isArray(v) ? v[0] : v;
  if (!o || typeof o !== "object") return null;
  return {
    name: o.name ?? null,
    name1: o.name1 ?? null,
    prospect_code: o.prospect_code ?? null,
  };
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

function mapSaleRow(s, sellers) {
  const embedded = asProspect(s.prospects);
  const prospect = embedded ?? (s.prospect_name
    ? { name: s.prospect_name, name1: s.prospect_name, prospect_code: null }
    : null);
  return {
    id: s.id,
    user_id: s.user_id,
    sale_date: s.sale_date,
    vol: num(s.vol),
    tours: num(s.tours),
    contract: s.contract ?? null,
    status: s.status ?? null,
    prospect,
    seller: sellers.get(s.user_id)?.name ?? "—",
  };
}

function buildMonthlyTrend(sales, months = 6) {
  const now = new Date();
  const buckets = new Map();
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

export async function getSales(sb, filters = {}) {
  const sellers = await loadSellers(sb);
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

export async function getSellerOptions(sb) {
  const map = await loadSellers(sb);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getOverview(sb) {
  const sellers = await loadSellers(sb);
  const monthPrefix = new Date().toISOString().slice(0, 7);

  const [usersRes, prospectsRes, salesLiteRes, recentRes] = await Promise.all([
    sb.from("profiles").select("*", { count: "exact", head: true }),
    sb.from("prospects").select("*", { count: "exact", head: true }),
    sb.from("sales").select("user_id, sale_date, vol"),
    sb
      .from("sales")
      .select("id, user_id, sale_date, vol, tours, contract, status, prospect_name, prospects(name, name1, prospect_code)")
      .order("sale_date", { ascending: false })
      .limit(8),
  ]);

  const salesRaw = salesLiteRes.data ?? [];
  let totalVolume = 0;
  let monthVolume = 0;
  let monthSalesCount = 0;
  const perSeller = new Map();

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

  const [profilesRes, prospectsRes, salesRes] = await Promise.all([
    profilesQuery,
    sb.from("prospects").select("user_id"),
    sb.from("sales").select("user_id, vol"),
  ]);

  const prospectsByUser = new Map();
  for (const p of prospectsRes.data ?? []) prospectsByUser.set(p.user_id, (prospectsByUser.get(p.user_id) ?? 0) + 1);

  const salesByUser = new Map();
  for (const s of salesRes.data ?? []) {
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
    user_permissions: p.user_permissions ?? [],
    prospects: prospectsByUser.get(p.id) ?? 0,
    sales: salesByUser.get(p.id)?.count ?? 0,
    volume: salesByUser.get(p.id)?.vol ?? 0,
  }));
}

export async function getWorksheets(sb, filters = {}) {
  const sellers = await loadSellers(sb);
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

export async function getWorksheetDetail(sb, id) {
  const sellers = await loadSellers(sb);
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
    data: data.data ?? {},
  };
}

export async function getCalendarEntries(sb, filters = {}) {
  const sellers = await loadSellers(sb);
  let q = sb
    .from("calendar_entries")
    .select(
      "id, entry_date, type, note, vol, tours, contract, user_id, kind, processing, process_date, completed, client_name, status, source, prospects(name, name1, prospect_code)"
    )
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
    kind: e.kind ?? null,
    note: e.note,
    vol: e.vol != null ? num(e.vol) : null,
    tours: e.tours != null ? num(e.tours) : null,
    contract: e.contract ?? null,
    processing: e.processing ?? null,
    process_date: e.process_date ?? null,
    completed: !!e.completed,
    client_name: e.client_name ?? null,
    status: e.status ?? null,
    source: e.source ?? null,
    seller: sellers.get(e.user_id)?.name ?? "—",
    prospect: asProspect(e.prospects),
  }));
}

export async function getProspects(sb, filters = {}) {
  const sellers = await loadSellers(sb);
  let q = sb
    .from("prospects")
    .select(
      "id, user_id, prospect_code, name, name1, name2, city, country, status, tour_date, tipo_tour, tour_cuantificable, completed, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (filters.userId) q = q.eq("user_id", filters.userId);
  if (filters.from) q = q.gte("tour_date", filters.from);
  if (filters.to) q = q.lte("tour_date", filters.to);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.tipoTour) q = q.eq("tipo_tour", filters.tipoTour);
  if (filters.q) {
    const term = filters.q.replace(/[%_]/g, "");
    if (term) {
      q = q.or(
        `name.ilike.%${term}%,name1.ilike.%${term}%,prospect_code.ilike.%${term}%,city.ilike.%${term}%`
      );
    }
  }
  const { data } = await q;
  return (data ?? []).map((p) => ({
    id: p.id,
    user_id: p.user_id,
    prospect_code: p.prospect_code,
    name: p.name ?? null,
    name1: p.name1 ?? null,
    name2: p.name2 ?? null,
    city: p.city ?? null,
    country: p.country ?? null,
    status: p.status ?? null,
    tour_date: p.tour_date ?? null,
    tipo_tour: p.tipo_tour ?? null,
    tour_cuantificable: p.tour_cuantificable ?? null,
    completed: !!p.completed,
    created_at: p.created_at ?? null,
    seller: sellers.get(p.user_id)?.name ?? "—",
  }));
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

export async function getActivities(sb, filters = {}) {
  const sellers = await loadSellers(sb);
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
