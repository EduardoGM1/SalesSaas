import { Router } from "express";
import { apiError, json, parseLimitOffset } from "../lib/http.js";
import { getUsdExchangeRate } from "../lib/exchange-rates.js";
import adminRouter from "./admin.js";
import { requireAuth, parseJsonBody, runService } from "./route-utils.js";
import * as sessionService from "../services/session-service.js";
import * as profileService from "../services/profile-service.js";
import * as syncService from "../services/sync-service.js";
import * as prospectsService from "../services/prospects-service.js";
import * as salesService from "../services/sales-service.js";
import * as calendarService from "../services/calendar-service.js";
import * as goalsService from "../services/goals-service.js";
import * as activitiesService from "../services/activities-service.js";
import * as toolsService from "../services/tools-service.js";
import * as geoService from "../services/geo-service.js";
import * as remindersService from "../services/reminders-service.js";
import * as networkService from "../services/network-service.js";
import * as messagesService from "../services/messages-service.js";
import * as sharingService from "../services/sharing-service.js";
import * as pushService from "../services/push-notifications-service.js";
import { ServiceError } from "../lib/service-error.js";

const router = Router();

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
      network: {
        search: { GET: "/api/v1/network/users/search?q=" },
        connections: { GET: "/api/v1/network/connections", POST: "/api/v1/network/connections", PATCH: "/api/v1/network/connections/:id", DELETE: "/api/v1/network/connections/:id" },
      },
      messages: {
        conversations: { GET: "/api/v1/messages/conversations" },
        thread: { GET: "/api/v1/messages?with=" },
        send: { POST: "/api/v1/messages" },
        read: { PATCH: "/api/v1/messages/read?with=" },
        unread: { GET: "/api/v1/messages/unread-count" },
      },
      notifications: {
        config: { GET: "/api/v1/notifications/config" },
        status: { GET: "/api/v1/notifications/status" },
        device: { POST: "/api/v1/notifications/device" },
      },
      shares: {
        received: { GET: "/api/v1/shares/received" },
        prospect: { GET: "/api/v1/prospects/:id/shares", POST: "/api/v1/prospects/:id/shares" },
        update: { PATCH: "/api/v1/shares/:id" },
        delete: { DELETE: "/api/v1/shares/:id" },
      },
    },
  });
});

router.get("/auth/session", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  try {
    const payload = await sessionService.getSession(a.supabase, a.userId);
    json(res, payload);
  } catch (err) {
    if (err instanceof ServiceError) return apiError(res, err.message, err.status);
    throw err;
  }
});

router.get("/auth/realtime-session", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => sessionService.getRealtimeSession(a.supabase), { wrap: "data" });
});

router.get("/geo/countries", (_req, res) => {
  json(res, { data: geoService.getCountries() });
});

router.get("/geo/countries/:country/cities", (req, res) => {
  runService(res, () => geoService.getCities(req.params.country), { wrap: "data" });
});

router.get("/reminders", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;
  await runService(res, () => remindersService.getReminders(a.supabase, a.userId, { from, to }), { wrap: "sync" });
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
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => profileService.getProfile(a.supabase, a.userId), { wrap: "data" });
});

router.patch("/profile", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => profileService.updateProfile(a.supabase, a.userId, body), { wrap: "data" });
});

router.post("/profile/presence/offline", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => profileService.markPresenceOffline(a.supabase, a.userId), { wrap: "data" });
});

router.get("/sync", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => syncService.pullUserDatabase(a.supabase, a.userId), { wrap: "sync" });
});

router.put("/sync", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const incoming = body?.data ?? body;
  await runService(res, () => syncService.reconcileUserDatabase(a.supabase, a.userId, incoming), { wrap: "sync" });
});

router.get("/prospects", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const paging = parseLimitOffset(req.query);
  await runService(res, () => prospectsService.listProspects(a.supabase, a.userId, { ...paging, status: req.query.status }));
});

router.post("/prospects", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => prospectsService.createProspect(a.supabase, a.userId, body), { wrap: "data", successStatus: 201 });
});

router.get("/prospects/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => prospectsService.getProspect(a.supabase, a.userId, req.params.id), { wrap: "data" });
});

router.patch("/prospects/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => prospectsService.updateProspect(a.supabase, a.userId, req.params.id, body), { wrap: "data" });
});

router.delete("/prospects/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => prospectsService.deleteProspect(a.supabase, a.userId, req.params.id), { wrap: "ok" });
});

router.get("/sales", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const paging = parseLimitOffset(req.query);
  await runService(res, () => salesService.listSales(a.supabase, a.userId, {
    ...paging,
    prospect_id: req.query.prospect_id,
    from: req.query.from,
    to: req.query.to,
  }));
});

router.post("/sales", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => salesService.createSale(a.supabase, a.userId, body), { wrap: "data", successStatus: 201 });
});

router.get("/sales/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => salesService.getSale(a.supabase, a.userId, req.params.id), { wrap: "data" });
});

router.patch("/sales/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => salesService.updateSale(a.supabase, a.userId, req.params.id, body), { wrap: "data" });
});

router.delete("/sales/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => salesService.deleteSale(a.supabase, a.userId, req.params.id), { wrap: "ok" });
});

router.get("/calendar-entries", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const paging = parseLimitOffset(req.query);
  await runService(res, () => calendarService.listCalendarEntries(a.supabase, a.userId, {
    ...paging,
    from: req.query.from,
    to: req.query.to,
    prospect_id: req.query.prospect_id,
  }));
});

router.post("/calendar-entries", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => calendarService.createCalendarEntry(a.supabase, a.userId, body), { wrap: "data", successStatus: 201 });
});

router.get("/calendar-entries/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => calendarService.getCalendarEntry(a.supabase, a.userId, req.params.id), { wrap: "data" });
});

router.patch("/calendar-entries/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => calendarService.updateCalendarEntry(a.supabase, a.userId, req.params.id, body), { wrap: "data" });
});

router.delete("/calendar-entries/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => calendarService.deleteCalendarEntry(a.supabase, a.userId, req.params.id), { wrap: "ok" });
});

router.get("/goals", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => goalsService.listGoals(a.supabase, a.userId, req.query.year), { wrap: "data" });
});

router.put("/goals", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => goalsService.upsertGoal(a.supabase, a.userId, body), { wrap: "data" });
});

router.delete("/goals", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  await runService(res, () => goalsService.deleteGoal(a.supabase, a.userId, year, month), { wrap: "ok" });
});

router.get("/activities", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const paging = parseLimitOffset(req.query);
  await runService(res, () => activitiesService.listActivities(a.supabase, a.userId, {
    ...paging,
    prospect_id: req.query.prospect_id,
  }));
});

router.post("/activities", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => activitiesService.createActivity(a.supabase, a.userId, body), { wrap: "data", successStatus: 201 });
});

router.get("/activities/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => activitiesService.getActivity(a.supabase, a.userId, req.params.id), { wrap: "data" });
});

router.patch("/activities/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => activitiesService.updateActivity(a.supabase, a.userId, req.params.id, body), { wrap: "data" });
});

router.delete("/activities/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => activitiesService.deleteActivity(a.supabase, a.userId, req.params.id), { wrap: "ok" });
});

router.get("/tool-calculations", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => toolsService.getToolCalculation(
    a.supabase,
    a.userId,
    req.query.tool,
    req.query.prospect_id,
  ), { wrap: "data" });
});

router.put("/tool-calculations", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => toolsService.upsertToolCalculation(a.supabase, a.userId, body), { wrap: "data" });
});

router.delete("/tool-calculations", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => toolsService.deleteToolCalculation(
    a.supabase,
    a.userId,
    req.query.tool,
    req.query.prospect_id,
  ), { wrap: "ok" });
});

router.get("/network/users/search", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => networkService.searchUsers(a.supabase, a.userId, req.query.q, Number(req.query.limit) || 20), { wrap: "data" });
});

router.get("/network/connections", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => networkService.listConnections(a.supabase, a.userId, { status: req.query.status }), { wrap: "data" });
});

router.get("/network/contacts/:contactId", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => networkService.getConnectionWithContact(a.supabase, a.userId, req.params.contactId), { wrap: "data" });
});

router.get("/network/contacts/:contactId/shares", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => sharingService.listSharesWithContact(a.supabase, a.userId, req.params.contactId), { wrap: "data" });
});

router.post("/network/connections", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => networkService.sendConnectionRequest(a.supabase, a.userId, body.addressee_id), { wrap: "data", successStatus: 201 });
});

router.patch("/network/connections/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => networkService.updateConnectionStatus(a.supabase, a.userId, req.params.id, body.status), { wrap: "data" });
});

router.delete("/network/connections/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => networkService.removeConnection(a.supabase, a.userId, req.params.id), { wrap: "ok" });
});

router.get("/messages/conversations", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => messagesService.listConversations(a.supabase, a.userId), { wrap: "data" });
});

router.get("/messages/unread-count", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => messagesService.countUnread(a.supabase, a.userId), { wrap: "data" });
});

router.get("/messages", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const withUser = req.query.with;
  if (!withUser) return apiError(res, "Parámetro with requerido.");
  await runService(res, () => messagesService.listMessagesWithUser(a.supabase, a.userId, withUser), { wrap: "data" });
});

router.post("/messages", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => messagesService.sendMessage(a.supabase, a.userId, body), { wrap: "data", successStatus: 201 });
});

router.patch("/messages/read", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const withUser = req.query.with;
  if (!withUser) return apiError(res, "Parámetro with requerido.");
  await runService(res, () => messagesService.markThreadRead(a.supabase, a.userId, withUser), { wrap: "ok" });
});

router.get("/notifications/config", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const appId = pushService.getOneSignalAppId();
  if (!appId) return apiError(res, "OneSignal no configurado en el servidor.", 503);
  json(res, {
    data: {
      appId,
      safariWebId: pushService.getSafariWebId(),
      provider: "onesignal",
      configured: pushService.isPushConfigured(),
      serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
      serviceWorkerScope: "/onesignal/",
    },
  });
});

router.get("/notifications/status", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => pushService.getPushStatus(), { wrap: "data" });
});

router.post("/notifications/device", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const subscriptionId = body.subscription_id ?? body.subscriptionId;
  await runService(
    res,
    () => pushService.registerPushDevice(a.supabase, a.userId, subscriptionId),
    { wrap: "data" },
  );
});

router.get("/shares/received", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => sharingService.listSharedWithMe(a.supabase, a.userId), { wrap: "data" });
});

router.get("/prospects/:id/shares", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => sharingService.listSharesForProspect(a.supabase, a.userId, req.params.id), { wrap: "data" });
});

router.post("/prospects/:id/shares", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => sharingService.createShare(a.supabase, a.userId, req.params.id, body), { wrap: "data", successStatus: 201 });
});

router.post("/prospects/:id/share-invites", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res) || {};
  await runService(res, () => sharingService.createShareInvite(a.supabase, a.userId, req.params.id, body), { wrap: "data", successStatus: 201 });
});

router.post("/share-invites/:token/redeem", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => sharingService.redeemShareInvite(a.supabase, a.userId, req.params.token), { wrap: "data" });
});

router.get("/shares/workspace", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => sharingService.listWorkspacePinned(a.supabase, a.userId), { wrap: "data" });
});

router.post("/shares/:id/add-to-workspace", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => sharingService.addShareToWorkspace(a.supabase, a.userId, req.params.id), { wrap: "data" });
});

router.post("/shares/:id/permission-requests", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res) || {};
  await runService(res, () => sharingService.requestPermissionUpgrade(a.supabase, a.userId, req.params.id, body), { wrap: "data", successStatus: 201 });
});

router.post("/share-permission-requests/:id/decide", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => sharingService.decidePermissionRequest(a.supabase, a.userId, req.params.id, body), { wrap: "data" });
});

router.patch("/shares/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => sharingService.updateSharePermission(a.supabase, a.userId, req.params.id, body.permission), { wrap: "data" });
});

router.delete("/shares/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => sharingService.deleteShare(a.supabase, a.userId, req.params.id), { wrap: "ok" });
});

router.get("/shared-prospects/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => sharingService.getSharedProspect(a.supabase, a.userId, req.params.id), { wrap: "data" });
});

router.get("/shared-prospects/:id/tools/:tool", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  await runService(res, () => sharingService.getSharedTool(a.supabase, a.userId, req.params.id, req.params.tool), { wrap: "data" });
});

router.put("/shared-prospects/:id/tools/:tool", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => sharingService.saveSharedTool(a.supabase, a.userId, req.params.id, req.params.tool, body?.data ?? body), { wrap: "data" });
});

router.patch("/shared-prospects/:id", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => sharingService.updateSharedProspect(a.supabase, a.userId, req.params.id, body), { wrap: "data" });
});

router.use("/admin", adminRouter);

export default router;
