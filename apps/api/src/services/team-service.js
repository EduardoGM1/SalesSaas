import { ServiceError } from "../lib/service-error.js";
import { profileDisplayName } from "../lib/profile-display-name.js";

/**
 * Agrega Tours/Ventas/Volumen del gerente + miembros de su grupo para un mes.
 */
export async function getTeamDashboardMetrics(supabase, userId, { year, month } = {}) {
  const now = new Date();
  const y = Number(year) || now.getFullYear();
  const m = Number(month) || now.getMonth() + 1;
  if (m < 1 || m > 12) throw new ServiceError("Mes inválido.");

  const { data: memberIds, error } = await supabase.rpc("team_member_ids", { p_gerente_id: userId });
  if (error) throw new ServiceError(error.message, 400);
  const ids = Array.isArray(memberIds) ? memberIds : [];
  const allIds = [userId, ...ids];

  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(y, m, 0));
  const end = endDate.toISOString().slice(0, 10);

  const { data: sales, error: sErr } = await supabase
    .from("sales")
    .select("user_id, vol, tours, sale_date, status")
    .in("user_id", allIds)
    .gte("sale_date", start)
    .lte("sale_date", end);
  if (sErr) throw new ServiceError(sErr.message, 500);

  const { data: prospects, error: pErr } = await supabase
    .from("prospects")
    .select("id, user_id, name, name1, prospect_code, tour_date, status, created_at")
    .in("user_id", allIds)
    .order("created_at", { ascending: false })
    .limit(200);
  if (pErr) throw new ServiceError(pErr.message, 500);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", allIds);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const perSeller = new Map();
  for (const id of allIds) {
    perSeller.set(id, {
      user_id: id,
      name: profileDisplayName(byId.get(id)) || id.slice(0, 8),
      email: byId.get(id)?.email || null,
      vol: 0,
      ventas: 0,
      tours: 0,
      prospects: 0,
      is_self: id === userId,
    });
  }

  for (const s of sales ?? []) {
    if (String(s.status || "").toLowerCase() === "cancelada") continue;
    const row = perSeller.get(s.user_id);
    if (!row) continue;
    row.vol += Number(s.vol) || 0;
    row.ventas += 1;
    row.tours += Number(s.tours) || 0;
  }
  for (const p of prospects ?? []) {
    const row = perSeller.get(p.user_id);
    if (row) row.prospects += 1;
  }

  const sellers = [...perSeller.values()];
  const totals = sellers.reduce(
    (a, s) => ({
      vol: a.vol + s.vol,
      ventas: a.ventas + s.ventas,
      tours: a.tours + s.tours,
      prospects: a.prospects + s.prospects,
    }),
    { vol: 0, ventas: 0, tours: 0, prospects: 0 },
  );

  return {
    year: y,
    month: m,
    member_count: ids.length,
    totals,
    sellers,
    recent_prospects: (prospects ?? []).slice(0, 40).map((p) => ({
      id: p.id,
      user_id: p.user_id,
      owner_name: profileDisplayName(byId.get(p.user_id)),
      name: p.name || p.name1,
      prospect_code: p.prospect_code,
      tour_date: p.tour_date,
      status: p.status,
    })),
  };
}

export async function listTeamMemberProspects(supabase, managerId, memberId) {
  const { data: team, error } = await supabase.rpc("team_member_ids", { p_gerente_id: managerId });
  if (error) throw new ServiceError(error.message, 400);
  const ids = Array.isArray(team) ? team : [];
  if (memberId !== managerId && !ids.includes(memberId)) {
    throw new ServiceError("Vendedor fuera de tu grupo.", 403);
  }
  const { data, error: pErr } = await supabase
    .from("prospects")
    .select("id, prospect_code, name, name1, name2, tour_date, city, country, status, user_id, created_at")
    .eq("user_id", memberId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (pErr) throw new ServiceError(pErr.message, 500);
  return data ?? [];
}
