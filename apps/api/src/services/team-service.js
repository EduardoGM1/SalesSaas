import { ServiceError } from "../lib/service-error.js";
import { profileDisplayName } from "../lib/profile-display-name.js";
import {
  hasDiscoveryProgress,
  inDateRange,
  isProspectFinalized,
  isQuantifiableTourProspect,
  isSaleCountable,
  monthBounds,
  pctDelta,
  pctOf,
  shiftMonth,
  surveyHasAnalysisData,
  todayIso,
} from "../lib/team-metrics.js";

/**
 * Dashboard ejecutivo del Gerente — un solo payload.
 *
 * Definiciones:
 * - Ventas/Volumen: sales contables (no cancelada ni pendiente).
 * - Tours: prospects con tour_date en el periodo y tour_cuantificable !== false.
 * - Discovery: tool survey con disc_json y ≥1 respuesta.
 * - Worksheet: filas tool=worksheet.
 * - Analysis-ready: survey con surveyHasAnalysisData.
 * - Metas: suma goals del equipo (DB month 0–11).
 * - Alertas: solo umbrales reales; lista vacía si no aplican.
 */

function emptySeller(id, profile, selfId) {
  return {
    user_id: id,
    name: profileDisplayName(profile) || id.slice(0, 8),
    email: profile?.email || null,
    vol: 0,
    ventas: 0,
    tours: 0,
    prospects: 0,
    goal_vol: 0,
    goal_pct: null,
    is_self: id === selfId,
  };
}

function aggregateSales(sales, start, end) {
  let vol = 0;
  let ventas = 0;
  const byUser = new Map();
  for (const s of sales ?? []) {
    if (!isSaleCountable(s)) continue;
    if (!inDateRange(s.sale_date, start, end)) continue;
    vol += Number(s.vol) || 0;
    ventas += 1;
    const u = byUser.get(s.user_id) || { vol: 0, ventas: 0 };
    u.vol += Number(s.vol) || 0;
    u.ventas += 1;
    byUser.set(s.user_id, u);
  }
  return { vol, ventas, byUser };
}

function countTours(prospects, start, end) {
  let tours = 0;
  const byUser = new Map();
  for (const p of prospects ?? []) {
    if (!isQuantifiableTourProspect(p)) continue;
    if (!inDateRange(p.tour_date, start, end)) continue;
    tours += 1;
    byUser.set(p.user_id, (byUser.get(p.user_id) || 0) + 1);
  }
  return { tours, byUser };
}

function countProspectsCreated(prospects, start, end) {
  let created = 0;
  let finalized = 0;
  const byUser = new Map();
  for (const p of prospects ?? []) {
    const createdAt = p.created_at ? String(p.created_at).slice(0, 10) : null;
    if (!createdAt || !inDateRange(createdAt, start, end)) continue;
    created += 1;
    if (isProspectFinalized(p)) finalized += 1;
    byUser.set(p.user_id, (byUser.get(p.user_id) || 0) + 1);
  }
  return { created, finalized, byUser };
}

function analyzeTools(tools) {
  let survey = 0;
  let surveyLinked = 0;
  let discovery = 0;
  let worksheet = 0;
  let vacaciones = 0;
  let analysisReady = 0;
  const byTool = { survey: 0, vacaciones: 0, worksheet: 0 };

  for (const row of tools ?? []) {
    const tool = row.tool;
    if (tool === "survey" || tool === "vacaciones" || tool === "worksheet") {
      byTool[tool] = (byTool[tool] || 0) + 1;
    }
    if (tool === "survey") {
      survey += 1;
      if (row.prospect_id) surveyLinked += 1;
      if (hasDiscoveryProgress(row.data)) discovery += 1;
      if (surveyHasAnalysisData(row.data)) analysisReady += 1;
    } else if (tool === "worksheet") {
      worksheet += 1;
    } else if (tool === "vacaciones") {
      vacaciones += 1;
    }
  }

  const toolTotal = byTool.survey + byTool.vacaciones + byTool.worksheet;
  const toolsList = ["survey", "vacaciones", "worksheet"].map((tool) => ({
    tool,
    saves: byTool[tool] || 0,
    pct: pctOf(byTool[tool] || 0, toolTotal),
  }));

  return {
    survey,
    surveyLinked,
    discovery,
    worksheet,
    vacaciones,
    analysisReady,
    toolsList,
    toolTotal,
  };
}

function buildFunnel({ tours, discovery, worksheet, analysisReady, ventas }) {
  const stages = [
    { stage: "tours", count: tours },
    { stage: "discovery", count: discovery },
    { stage: "worksheet", count: worksheet },
    { stage: "analysis", count: analysisReady },
    { stage: "ventas", count: ventas },
  ];
  return stages.map((s, i) => {
    const prev = i === 0 ? s.count : stages[i - 1].count;
    const pctFromPrev = i === 0 ? 100 : pctOf(s.count, prev);
    const dropOff = i === 0 ? 0 : Math.max(0, prev - s.count);
    return { ...s, pctFromPrev, dropOff };
  });
}

function buildAlerts({
  goalVol,
  monthVol,
  tours,
  discovery,
  worksheet,
  survey,
  convTourSale,
  prevConvTourSale,
  toursLast3Days,
  hadPriorTours,
}) {
  const alerts = [];
  if (goalVol > 0) {
    const pct = pctOf(monthVol, goalVol);
    if (pct < 70) {
      alerts.push({
        severity: "warning",
        code: "goal_vol_behind",
        message: "Cumplimiento de volumen por debajo del 70% de la meta.",
        value: pct,
      });
    }
  }
  if (hadPriorTours && toursLast3Days === 0) {
    alerts.push({
      severity: "warning",
      code: "tours_stalled",
      message: "Sin tours cuantificables en los últimos 3 días.",
      value: 0,
    });
  }
  if (survey > 0 && discovery === 0) {
    alerts.push({
      severity: "info",
      code: "discovery_incomplete",
      message: "Hay Surveys sin progreso en Discovery.",
      value: survey,
    });
  }
  if (tours > 0 && worksheet === 0) {
    alerts.push({
      severity: "info",
      code: "worksheet_missing",
      message: "Hay tours en el periodo pero ningún Worksheet guardado.",
      value: tours,
    });
  }
  if (prevConvTourSale > 0 && convTourSale < prevConvTourSale - 15) {
    alerts.push({
      severity: "critical",
      code: "conversion_drop",
      message: "Caída relevante de conversión Tour → Venta vs mes anterior.",
      value: convTourSale - prevConvTourSale,
    });
  }
  return alerts;
}

function buildActivity({ activities, sales, tools, profiles, limit = 40 }) {
  const events = [];

  for (const a of activities ?? []) {
    const name = profileDisplayName(profiles.get(a.user_id)) || "Usuario";
    events.push({
      at: a.activity_date || a.created_at,
      user_id: a.user_id,
      user_name: name,
      type: a.type || "activity",
      text: a.title || a.note || `Actividad (${a.type || "nota"})`,
      href: a.prospect_id ? `/clients/${a.prospect_id}` : null,
    });
  }

  if (events.length < 8) {
    for (const s of sales ?? []) {
      if (!isSaleCountable(s)) continue;
      const name = profileDisplayName(profiles.get(s.user_id)) || "Usuario";
      events.push({
        at: s.sale_date,
        user_id: s.user_id,
        user_name: name,
        type: "venta",
        text: `Registró una venta${s.vol != null ? ` (${Number(s.vol).toLocaleString("en-US")})` : ""}`,
        href: s.prospect_id ? `/clients/${s.prospect_id}` : null,
      });
    }
    for (const row of tools ?? []) {
      const name = profileDisplayName(profiles.get(row.user_id)) || "Usuario";
      const toolLabel =
        row.tool === "survey"
          ? (hasDiscoveryProgress(row.data) ? "Discovery/Survey" : "Survey")
          : row.tool === "worksheet"
            ? "Worksheet"
            : row.tool === "vacaciones"
              ? "Vacaciones"
              : row.tool;
      events.push({
        at: row.updated_at,
        user_id: row.user_id,
        user_name: name,
        type: "tool",
        text: `Actualizó ${toolLabel}`,
        href: row.prospect_id ? `/clients/${row.prospect_id}` : null,
      });
    }
  }

  events.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  const seen = new Set();
  const out = [];
  for (const e of events) {
    const key = `${e.user_id}|${e.type}|${e.at}|${e.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

function weekBuckets(year, month1to12, prospects) {
  const { start, end } = monthBounds(year, month1to12);
  const weeks = [{ week: 1, tours: 0 }, { week: 2, tours: 0 }, { week: 3, tours: 0 }, { week: 4, tours: 0 }, { week: 5, tours: 0 }];
  for (const p of prospects ?? []) {
    if (!isQuantifiableTourProspect(p)) continue;
    if (!inDateRange(p.tour_date, start, end)) continue;
    const day = Number(String(p.tour_date).slice(8, 10)) || 1;
    const w = Math.min(5, Math.ceil(day / 7));
    weeks[w - 1].tours += 1;
  }
  return weeks;
}

export async function getTeamDashboardMetrics(supabase, userId, { year, month } = {}) {
  const now = new Date();
  const y = Number(year) || now.getFullYear();
  const m = Number(month) || now.getMonth() + 1;
  if (m < 1 || m > 12) throw new ServiceError("Mes inválido.");

  const { data: memberIds, error } = await supabase.rpc("team_member_ids", { p_gerente_id: userId });
  if (error) throw new ServiceError(error.message, 400);
  const ids = Array.isArray(memberIds) ? memberIds : [];
  const allIds = [...new Set([userId, ...ids])];

  const { start, end, daysInMonth } = monthBounds(y, m);
  const prev = shiftMonth(y, m, -1);
  const prevBounds = monthBounds(prev.year, prev.month);
  const trendFrom = shiftMonth(y, m, -5);
  const trendStartDate = monthBounds(trendFrom.year, trendFrom.month).start;
  const today = todayIso();

  const threeDaysAgo = new Date();
  threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
  const threeDaysIso = threeDaysAgo.toISOString().slice(0, 10);

  const dbMonth = m - 1; // goals: 0–11

  const [
    salesRes,
    prospectsRes,
    goalsRes,
    toolsRes,
    activitiesRes,
    profilesRes,
  ] = await Promise.all([
    supabase
      .from("sales")
      .select("id, user_id, prospect_id, vol, tours, sale_date, status, processing")
      .in("user_id", allIds)
      .gte("sale_date", trendStartDate)
      .lte("sale_date", end),
    supabase
      .from("prospects")
      .select("id, user_id, name, name1, prospect_code, tour_date, status, completed, tour_cuantificable, tipo_tour, created_at")
      .in("user_id", allIds)
      .order("created_at", { ascending: false })
      .limit(800),
    supabase
      .from("goals")
      .select("user_id, year, month, vol, tours, ventas")
      .in("user_id", allIds)
      .eq("year", y)
      .eq("month", dbMonth),
    supabase
      .from("tool_calculations")
      .select("id, user_id, prospect_id, tool, data, updated_at")
      .in("user_id", allIds),
    supabase
      .from("activities")
      .select("id, user_id, prospect_id, type, title, note, activity_date, created_at")
      .in("user_id", allIds)
      .order("activity_date", { ascending: false })
      .limit(40),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", allIds),
  ]);

  if (salesRes.error) throw new ServiceError(salesRes.error.message, 500);
  if (prospectsRes.error) throw new ServiceError(prospectsRes.error.message, 500);
  if (goalsRes.error) throw new ServiceError(goalsRes.error.message, 500);
  if (toolsRes.error) throw new ServiceError(toolsRes.error.message, 500);
  // activities puede fallar por RLS; no tumbar el dashboard
  const activities = activitiesRes.error ? [] : (activitiesRes.data ?? []);
  if (profilesRes.error) throw new ServiceError(profilesRes.error.message, 500);

  const sales = salesRes.data ?? [];
  const prospects = prospectsRes.data ?? [];
  const tools = toolsRes.data ?? [];
  const profiles = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));

  const monthSales = aggregateSales(sales, start, end);
  const prevSales = aggregateSales(sales, prevBounds.start, prevBounds.end);
  const daySales = aggregateSales(sales, today, today);

  const monthTours = countTours(prospects, start, end);
  const prevTours = countTours(prospects, prevBounds.start, prevBounds.end);
  const dayTours = countTours(prospects, today, today);
  const toursLast3 = countTours(prospects, threeDaysIso, today);
  const hadPriorTours = countTours(prospects, trendStartDate, threeDaysIso).tours > 0;

  const monthProspects = countProspectsCreated(prospects, start, end);
  const toolStats = analyzeTools(tools);

  const goalByUser = new Map();
  let goalVol = 0;
  let goalTours = 0;
  let goalVentas = 0;
  for (const g of goalsRes.data ?? []) {
    goalByUser.set(g.user_id, g);
    goalVol += Number(g.vol) || 0;
    goalTours += Number(g.tours) || 0;
    goalVentas += Number(g.ventas) || 0;
  }

  const perSeller = new Map();
  for (const id of allIds) {
    perSeller.set(id, emptySeller(id, profiles.get(id), userId));
  }
  for (const [uid, s] of monthSales.byUser) {
    const row = perSeller.get(uid);
    if (!row) continue;
    row.vol = s.vol;
    row.ventas = s.ventas;
  }
  for (const [uid, t] of monthTours.byUser) {
    const row = perSeller.get(uid);
    if (row) row.tours = t;
  }
  for (const [uid, c] of monthProspects.byUser) {
    const row = perSeller.get(uid);
    if (row) row.prospects = c;
  }
  for (const [uid, g] of goalByUser) {
    const row = perSeller.get(uid);
    if (!row) continue;
    row.goal_vol = Number(g.vol) || 0;
    row.goal_pct = row.goal_vol > 0 ? pctOf(row.vol, row.goal_vol) : null;
  }

  const sellers = [...perSeller.values()].sort((a, b) => b.vol - a.vol || b.ventas - a.ventas);
  const ranking = sellers.map((s, i) => ({
    rank: i + 1,
    user_id: s.user_id,
    name: s.name,
    ventas: s.ventas,
    vol: s.vol,
    tours: s.tours,
    goalPct: s.goal_pct,
    is_self: s.is_self,
  }));

  const convTourSale = pctOf(monthSales.ventas, monthTours.tours);
  const prevConvTourSale = pctOf(prevSales.ventas, prevTours.tours);
  const convDiscoverySale = pctOf(monthSales.ventas, toolStats.discovery);

  const dayOfMonth = Math.min(Number(today.slice(8, 10)) || 1, daysInMonth);
  const remainingDays = Math.max(0, daysInMonth - dayOfMonth);
  const dailyPace = dayOfMonth > 0 ? monthSales.vol / dayOfMonth : 0;
  const projectedVol = Math.round(monthSales.vol + dailyPace * remainingDays);

  const goalPctVol = goalVol > 0 ? pctOf(monthSales.vol, goalVol) : null;
  const goalPctTours = goalTours > 0 ? pctOf(monthTours.tours, goalTours) : null;
  const goalPctVentas = goalVentas > 0 ? pctOf(monthSales.ventas, goalVentas) : null;

  // Tendencia 6 meses
  const salesTrend = [];
  for (let i = 5; i >= 0; i -= 1) {
    const pt = shiftMonth(y, m, -i);
    const b = monthBounds(pt.year, pt.month);
    const agg = aggregateSales(sales, b.start, b.end);
    salesTrend.push({
      month: `${pt.year}-${String(pt.month).padStart(2, "0")}`,
      label: `${pt.year}-${String(pt.month).padStart(2, "0")}`,
      sales: agg.ventas,
      volume: agg.vol,
    });
  }

  const funnel = buildFunnel({
    tours: monthTours.tours,
    discovery: toolStats.discovery,
    worksheet: toolStats.worksheet,
    analysisReady: toolStats.analysisReady,
    ventas: monthSales.ventas,
  });

  const alerts = buildAlerts({
    goalVol,
    monthVol: monthSales.vol,
    tours: monthTours.tours,
    discovery: toolStats.discovery,
    worksheet: toolStats.worksheet,
    survey: toolStats.survey,
    convTourSale,
    prevConvTourSale,
    toursLast3Days: toursLast3.tours,
    hadPriorTours,
  });

  const activity = buildActivity({
    activities,
    sales: sales.filter((s) => inDateRange(s.sale_date, start, end)),
    tools,
    profiles,
  });

  const totals = {
    vol: monthSales.vol,
    ventas: monthSales.ventas,
    tours: monthTours.tours,
    prospects: monthProspects.created,
  };

  return {
    year: y,
    month: m,
    member_count: ids.length,
    totals,
    sellers,
    recent_prospects: prospects.slice(0, 40).map((p) => ({
      id: p.id,
      user_id: p.user_id,
      owner_name: profileDisplayName(profiles.get(p.user_id)),
      name: p.name || p.name1,
      prospect_code: p.prospect_code,
      tour_date: p.tour_date,
      status: p.status,
    })),
    kpis: {
      day: {
        tours: dayTours.tours,
        ventas: daySales.ventas,
        vol: daySales.vol,
      },
      month: {
        tours: monthTours.tours,
        ventas: monthSales.ventas,
        vol: monthSales.vol,
        discovery: toolStats.discovery,
        worksheet: toolStats.worksheet,
        survey: toolStats.survey,
        surveyLinked: toolStats.surveyLinked,
        analysisReady: toolStats.analysisReady,
        prospectsCreated: monthProspects.created,
        prospectsFinalized: monthProspects.finalized,
      },
      prevMonth: {
        tours: prevTours.tours,
        ventas: prevSales.ventas,
        vol: prevSales.vol,
      },
      deltas: {
        vol: pctDelta(monthSales.vol, prevSales.vol),
        ventas: pctDelta(monthSales.ventas, prevSales.ventas),
        tours: pctDelta(monthTours.tours, prevTours.tours),
      },
      conversions: {
        tourToSale: convTourSale,
        discoveryToSale: convDiscoverySale,
        avgSale: monthSales.ventas > 0 ? Math.round(monthSales.vol / monthSales.ventas) : 0,
        efficiency: monthTours.tours > 0 ? Math.round(monthSales.vol / monthTours.tours) : 0,
      },
      goalsProgress: {
        goalVol,
        goalTours,
        goalVentas,
        pctVol: goalPctVol,
        pctTours: goalPctTours,
        pctVentas: goalPctVentas,
        remainingVol: Math.max(0, goalVol - monthSales.vol),
        projectedVol,
        remainingDays,
      },
    },
    series: {
      salesTrend,
      toursByWeek: weekBuckets(y, m, prospects),
    },
    funnel,
    ranking,
    tools: toolStats.toolsList,
    activity,
    alerts,
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
