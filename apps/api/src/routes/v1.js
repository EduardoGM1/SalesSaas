import { Router } from "express";
import { authenticateApi } from "../middleware/auth.js";
import { apiError, json, parseBody, parseLimitOffset } from "../lib/http.js";
import { pullAll, reconcile } from "@salesapp/shared/data/sync.js";
import { isUuid, normalizeIds } from "@salesapp/shared/data/mappers.js";
import {
  bodyToProspectInsert,
  bodyToProspectPatch,
  bodyToSaleInsert,
  bodyToCalInsert,
  bodyToGoalUpsert,
  bodyToActivityInsert,
  bodyToToolUpsert,
} from "@salesapp/shared/api/validators.js";
import adminRouter from "./admin.js";
import { getUsdExchangeRate } from "../lib/exchange-rates.js";
import { listCountries, listCities } from "../lib/geo-catalog.js";
import { collectReminders } from "../lib/reminders.js";

const router = Router();

async function auth(req, res) {
  const a = await authenticateApi(req, res);
  if (!a.ok) {
    apiError(res, a.message, a.status);
    return null;
  }
  return a;
}

router.get("/", (_req, res) => {
  json(res, {
    version: "v1",
    auth: "Authorization: Bearer <supabase_access_token> o cookies de sesión web",
    endpoints: {
      session: { GET: "/api/v1/auth/session" },
      profile: { GET: "/api/v1/profile", PATCH: "/api/v1/profile" },
      exchangeRates: { GET: "/api/v1/exchange-rates?to=MXN" },
      geo: { GET: "/api/v1/geo/countries", GET_CITIES: "/api/v1/geo/countries/:country/cities" },
      reminders: { GET: "/api/v1/reminders?from=&to=" },
      sync: { GET: "/api/v1/sync", PUT: "/api/v1/sync" },
      prospects: { GET: "/api/v1/prospects", POST: "/api/v1/prospects", GET_ONE: "/api/v1/prospects/:id", PATCH: "/api/v1/prospects/:id", DELETE: "/api/v1/prospects/:id" },
      sales: { GET: "/api/v1/sales", POST: "/api/v1/sales", GET_ONE: "/api/v1/sales/:id", PATCH: "/api/v1/sales/:id", DELETE: "/api/v1/sales/:id" },
      calendarEntries: { GET: "/api/v1/calendar-entries", POST: "/api/v1/calendar-entries", GET_ONE: "/api/v1/calendar-entries/:id", PATCH: "/api/v1/calendar-entries/:id", DELETE: "/api/v1/calendar-entries/:id" },
      goals: { GET: "/api/v1/goals", PUT: "/api/v1/goals", DELETE: "/api/v1/goals?year=&month=" },
      activities: { GET: "/api/v1/activities", POST: "/api/v1/activities", GET_ONE: "/api/v1/activities/:id", PATCH: "/api/v1/activities/:id", DELETE: "/api/v1/activities/:id" },
      toolCalculations: { GET: "/api/v1/tool-calculations", PUT: "/api/v1/tool-calculations", DELETE: "/api/v1/tool-calculations?tool=&prospect_id=" },
    },
  });
});

router.get("/auth/session", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const { data: { user } } = await a.supabase.auth.getUser();
  const { data: profile } = await a.supabase
    .from("profiles")
    .select("id, email, full_name, role, phone, avatar_url, settings, is_super_admin, admin_permissions")
    .eq("id", a.userId)
    .single();
  json(res, { user: user ? { id: user.id, email: user.email } : null, profile: profile ?? null });
});

router.get("/geo/countries", (_req, res) => {
  json(res, { data: listCountries() });
});

router.get("/geo/countries/:country/cities", (req, res) => {
  const data = listCities(req.params.country);
  if (!data) return apiError(res, "País no encontrado.", 404);
  json(res, { data });
});

router.get("/reminders", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  try {
    const db = await pullAll(a.supabase, a.userId);
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    json(res, { data: collectReminders(db, { from, to }), syncedAt: new Date().toISOString() });
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al obtener recordatorios.", 500);
  }
});

router.get("/exchange-rates", async (req, res) => {
  const to = String(req.query.to ?? req.query.currency ?? "").toUpperCase();
  if (!to) return apiError(res, "Parámetro to requerido (USD, MXN, CAD, EUR).");
  try {
    const data = await getUsdExchangeRate(to);
    json(res, { data });
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al obtener tipo de cambio.", 502);
  }
});

router.get("/profile", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const { data, error } = await a.supabase.from("profiles").select("id, email, full_name, role, phone, avatar_url, settings, created_at, updated_at").eq("id", a.userId).single();
  if (error) return apiError(res, error.message, 500);
  json(res, { data });
});

router.patch("/profile", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const body = parseBody(req.body);
  if (!body) return apiError(res, "Cuerpo JSON inválido.");
  const patch = {};
  if (body.full_name !== undefined || body.fullName !== undefined) patch.full_name = body.full_name ?? body.fullName;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.avatar_url !== undefined || body.avatarUrl !== undefined) patch.avatar_url = body.avatar_url ?? body.avatarUrl;
  if (body.settings !== undefined && typeof body.settings === "object" && !Array.isArray(body.settings)) patch.settings = body.settings;
  if (!Object.keys(patch).length) return apiError(res, "Sin campos para actualizar.");
  const { data, error } = await a.supabase.from("profiles").update(patch).eq("id", a.userId).select("id, email, full_name, role, phone, avatar_url, settings, created_at, updated_at").single();
  if (error) return apiError(res, error.message, 400);
  json(res, { data });
});

router.get("/sync", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  try {
    const db = await pullAll(a.supabase, a.userId);
    json(res, { data: db, syncedAt: new Date().toISOString() });
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al sincronizar.", 500);
  }
});

router.put("/sync", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const body = parseBody(req.body);
  const incoming = body?.data ?? body;
  if (!incoming || typeof incoming !== "object") return apiError(res, "Cuerpo debe incluir { data: AppDatabase }.");
  try {
    const { db } = normalizeIds(incoming);
    await reconcile(a.supabase, db, a.userId);
    const fresh = await pullAll(a.supabase, a.userId);
    json(res, { data: fresh, syncedAt: new Date().toISOString() });
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al sincronizar.", 500);
  }
});

router.get("/prospects", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const { limit, offset } = parseLimitOffset(req.query);
  let q = a.supabase.from("prospects").select("*", { count: "exact" }).eq("user_id", a.userId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (req.query.status) q = q.eq("status", req.query.status);
  const { data, error, count } = await q;
  if (error) return apiError(res, error.message, 500);
  json(res, { data: data ?? [], total: count ?? 0, limit, offset });
});

router.post("/prospects", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const body = parseBody(req.body);
  if (!body) return apiError(res, "Cuerpo JSON inválido.");
  const row = bodyToProspectInsert(body, a.userId);
  const { data, error } = await a.supabase.from("prospects").insert(row).select().single();
  if (error) return apiError(res, error.message, 400);
  json(res, { data }, 201);
});

router.get("/prospects/:id", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  if (!isUuid(req.params.id)) return apiError(res, "ID inválido.");
  const { data, error } = await a.supabase.from("prospects").select("*").eq("id", req.params.id).eq("user_id", a.userId).maybeSingle();
  if (error) return apiError(res, error.message, 500);
  if (!data) return apiError(res, "Expediente no encontrado.", 404);
  json(res, { data });
});

router.patch("/prospects/:id", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  if (!isUuid(req.params.id)) return apiError(res, "ID inválido.");
  const body = parseBody(req.body);
  if (!body) return apiError(res, "Cuerpo JSON inválido.");
  const patch = bodyToProspectPatch(body);
  if (!Object.keys(patch).length) return apiError(res, "Sin campos para actualizar.");
  const { data, error } = await a.supabase.from("prospects").update(patch).eq("id", req.params.id).eq("user_id", a.userId).select().maybeSingle();
  if (error) return apiError(res, error.message, 400);
  if (!data) return apiError(res, "Expediente no encontrado.", 404);
  json(res, { data });
});

router.delete("/prospects/:id", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  if (!isUuid(req.params.id)) return apiError(res, "ID inválido.");
  const { error, count } = await a.supabase.from("prospects").delete({ count: "exact" }).eq("id", req.params.id).eq("user_id", a.userId);
  if (error) return apiError(res, error.message, 400);
  if (!count) return apiError(res, "Expediente no encontrado.", 404);
  json(res, { ok: true });
});

router.get("/sales", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const { limit, offset } = parseLimitOffset(req.query);
  let q = a.supabase.from("sales").select("*, prospects(name, name1, prospect_code)", { count: "exact" }).eq("user_id", a.userId).order("sale_date", { ascending: false }).range(offset, offset + limit - 1);
  if (req.query.prospect_id && isUuid(req.query.prospect_id)) q = q.eq("prospect_id", req.query.prospect_id);
  if (req.query.from) q = q.gte("sale_date", req.query.from);
  if (req.query.to) q = q.lte("sale_date", req.query.to);
  const { data, error, count } = await q;
  if (error) return apiError(res, error.message, 500);
  json(res, { data: data ?? [], total: count ?? 0, limit, offset });
});

router.post("/sales", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const body = parseBody(req.body);
  if (!body) return apiError(res, "Cuerpo JSON inválido.");
  const row = bodyToSaleInsert(body, a.userId);
  if (!row) return apiError(res, "prospect_id y sale_date/date son requeridos.");
  const { data, error } = await a.supabase.from("sales").insert(row).select().single();
  if (error) return apiError(res, error.message, 400);
  json(res, { data }, 201);
});

router.get("/sales/:id", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  if (!isUuid(req.params.id)) return apiError(res, "ID inválido.");
  const { data, error } = await a.supabase.from("sales").select("*").eq("id", req.params.id).eq("user_id", a.userId).maybeSingle();
  if (error) return apiError(res, error.message, 500);
  if (!data) return apiError(res, "Venta no encontrada.", 404);
  json(res, { data });
});

router.patch("/sales/:id", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  if (!isUuid(req.params.id)) return apiError(res, "ID inválido.");
  const body = parseBody(req.body);
  if (!body) return apiError(res, "Cuerpo JSON inválido.");
  const patch = { ...body };
  delete patch.id;
  delete patch.user_id;
  const { data, error } = await a.supabase.from("sales").update(patch).eq("id", req.params.id).eq("user_id", a.userId).select().maybeSingle();
  if (error) return apiError(res, error.message, 400);
  if (!data) return apiError(res, "Venta no encontrada.", 404);
  json(res, { data });
});

router.delete("/sales/:id", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  if (!isUuid(req.params.id)) return apiError(res, "ID inválido.");
  const { error, count } = await a.supabase.from("sales").delete({ count: "exact" }).eq("id", req.params.id).eq("user_id", a.userId);
  if (error) return apiError(res, error.message, 400);
  if (!count) return apiError(res, "Venta no encontrada.", 404);
  json(res, { ok: true });
});

router.get("/calendar-entries", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const { limit, offset } = parseLimitOffset(req.query);
  let q = a.supabase.from("calendar_entries").select("*", { count: "exact" }).eq("user_id", a.userId).order("entry_date", { ascending: false }).range(offset, offset + limit - 1);
  if (req.query.from) q = q.gte("entry_date", req.query.from);
  if (req.query.to) q = q.lte("entry_date", req.query.to);
  if (req.query.prospect_id && isUuid(req.query.prospect_id)) q = q.eq("prospect_id", req.query.prospect_id);
  const { data, error, count } = await q;
  if (error) return apiError(res, error.message, 500);
  json(res, { data: data ?? [], total: count ?? 0, limit, offset });
});

router.post("/calendar-entries", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const body = parseBody(req.body);
  if (!body) return apiError(res, "Cuerpo JSON inválido.");
  const row = bodyToCalInsert(body, a.userId);
  if (!row) return apiError(res, "type y entry_date/date son requeridos.");
  const { data, error } = await a.supabase.from("calendar_entries").insert(row).select().single();
  if (error) return apiError(res, error.message, 400);
  json(res, { data }, 201);
});

router.get("/calendar-entries/:id", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  if (!isUuid(req.params.id)) return apiError(res, "ID inválido.");
  const { data, error } = await a.supabase.from("calendar_entries").select("*").eq("id", req.params.id).eq("user_id", a.userId).maybeSingle();
  if (error) return apiError(res, error.message, 500);
  if (!data) return apiError(res, "Entrada no encontrada.", 404);
  json(res, { data });
});

router.patch("/calendar-entries/:id", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  if (!isUuid(req.params.id)) return apiError(res, "ID inválido.");
  const body = parseBody(req.body);
  if (!body) return apiError(res, "Cuerpo JSON inválido.");
  const patch = { ...body };
  delete patch.id;
  delete patch.user_id;
  const { data, error } = await a.supabase.from("calendar_entries").update(patch).eq("id", req.params.id).eq("user_id", a.userId).select().maybeSingle();
  if (error) return apiError(res, error.message, 400);
  if (!data) return apiError(res, "Entrada no encontrada.", 404);
  json(res, { data });
});

router.delete("/calendar-entries/:id", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  if (!isUuid(req.params.id)) return apiError(res, "ID inválido.");
  const { error, count } = await a.supabase.from("calendar_entries").delete({ count: "exact" }).eq("id", req.params.id).eq("user_id", a.userId);
  if (error) return apiError(res, error.message, 400);
  if (!count) return apiError(res, "Entrada no encontrada.", 404);
  json(res, { ok: true });
});

router.get("/goals", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  let q = a.supabase.from("goals").select("*").eq("user_id", a.userId);
  if (req.query.year) q = q.eq("year", Number(req.query.year));
  const { data, error } = await q;
  if (error) return apiError(res, error.message, 500);
  json(res, { data: data ?? [] });
});

router.put("/goals", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const body = parseBody(req.body);
  if (!body) return apiError(res, "Cuerpo JSON inválido.");
  const row = bodyToGoalUpsert(body, a.userId);
  if (!row) return apiError(res, "year y month son requeridos.");
  const { data, error } = await a.supabase.from("goals").upsert(row, { onConflict: "user_id,year,month" }).select().single();
  if (error) return apiError(res, error.message, 400);
  json(res, { data });
});

router.delete("/goals", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!year || month < 0 || month > 11) return apiError(res, "year y month requeridos.");
  const { error } = await a.supabase.from("goals").delete().eq("user_id", a.userId).eq("year", year).eq("month", month);
  if (error) return apiError(res, error.message, 400);
  json(res, { ok: true });
});

router.get("/activities", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const { limit, offset } = parseLimitOffset(req.query);
  let q = a.supabase.from("activities").select("*", { count: "exact" }).eq("user_id", a.userId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (req.query.prospect_id && isUuid(req.query.prospect_id)) q = q.eq("prospect_id", req.query.prospect_id);
  const { data, error, count } = await q;
  if (error) return apiError(res, error.message, 500);
  json(res, { data: data ?? [], total: count ?? 0, limit, offset });
});

router.post("/activities", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const body = parseBody(req.body);
  if (!body) return apiError(res, "Cuerpo JSON inválido.");
  const row = bodyToActivityInsert(body, a.userId);
  if (!row) return apiError(res, "type es requerido.");
  const { data, error } = await a.supabase.from("activities").insert(row).select().single();
  if (error) return apiError(res, error.message, 400);
  json(res, { data }, 201);
});

router.get("/activities/:id", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  if (!isUuid(req.params.id)) return apiError(res, "ID inválido.");
  const { data, error } = await a.supabase.from("activities").select("*").eq("id", req.params.id).eq("user_id", a.userId).maybeSingle();
  if (error) return apiError(res, error.message, 500);
  if (!data) return apiError(res, "Actividad no encontrada.", 404);
  json(res, { data });
});

router.patch("/activities/:id", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  if (!isUuid(req.params.id)) return apiError(res, "ID inválido.");
  const body = parseBody(req.body);
  if (!body) return apiError(res, "Cuerpo JSON inválido.");
  const patch = { ...body };
  delete patch.id;
  delete patch.user_id;
  const { data, error } = await a.supabase.from("activities").update(patch).eq("id", req.params.id).eq("user_id", a.userId).select().maybeSingle();
  if (error) return apiError(res, error.message, 400);
  if (!data) return apiError(res, "Actividad no encontrada.", 404);
  json(res, { data });
});

router.delete("/activities/:id", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  if (!isUuid(req.params.id)) return apiError(res, "ID inválido.");
  const { error, count } = await a.supabase.from("activities").delete({ count: "exact" }).eq("id", req.params.id).eq("user_id", a.userId);
  if (error) return apiError(res, error.message, 400);
  if (!count) return apiError(res, "Actividad no encontrada.", 404);
  json(res, { ok: true });
});

router.get("/tool-calculations", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const tool = req.query.tool;
  const prospectId = req.query.prospect_id;
  if (!tool) return apiError(res, "tool requerido.");
  let q = a.supabase.from("tool_calculations").select("*").eq("user_id", a.userId).eq("tool", tool);
  if (prospectId === "libre" || prospectId === null || prospectId === undefined) {
    q = q.is("prospect_id", null);
  } else if (isUuid(prospectId)) {
    q = q.eq("prospect_id", prospectId);
  } else {
    return apiError(res, "prospect_id inválido.");
  }
  const { data, error } = await q.maybeSingle();
  if (error) return apiError(res, error.message, 500);
  json(res, { data: data ?? null });
});

router.put("/tool-calculations", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const body = parseBody(req.body);
  if (!body) return apiError(res, "Cuerpo JSON inválido.");
  const row = bodyToToolUpsert(body, a.userId);
  if (!row) return apiError(res, "tool y data son requeridos.");
  const { data, error } = await a.supabase.from("tool_calculations").upsert(row, { onConflict: "user_id,prospect_id,tool" }).select().single();
  if (error) return apiError(res, error.message, 400);
  json(res, { data });
});

router.delete("/tool-calculations", async (req, res) => {
  const a = await auth(req, res);
  if (!a) return;
  const tool = req.query.tool;
  const prospectId = req.query.prospect_id;
  if (!tool) return apiError(res, "tool requerido.");
  let q = a.supabase.from("tool_calculations").delete().eq("user_id", a.userId).eq("tool", tool);
  if (prospectId === "libre") q = q.is("prospect_id", null);
  else if (isUuid(prospectId)) q = q.eq("prospect_id", prospectId);
  else return apiError(res, "prospect_id inválido.");
  const { error } = await q;
  if (error) return apiError(res, error.message, 400);
  json(res, { ok: true });
});

router.use("/admin", adminRouter);

export default router;
