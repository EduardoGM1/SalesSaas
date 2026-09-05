import { Router } from "express";
import { json } from "../lib/http.js";
import adminRouter from "./admin.js";
import sessionRouter from "./session.js";
import customModulesRouter from "./custom-modules.js";
import workspaceRouter from "./workspace.js";
import geoRouter from "./geo.js";
import remindersRouter from "./reminders.js";
import exchangeRatesRouter from "./exchange-rates.js";
import profileRouter from "./profile.js";
import syncRouter from "./sync.js";
import prospectsRouter from "./prospects.js";
import chatRouter from "./chat.js";
import salesRouter from "./sales.js";
import calendarRouter from "./calendar.js";
import goalsRouter from "./goals.js";
import activitiesRouter from "./activities.js";
import toolsRouter from "./tools.js";
import networkRouter from "./network.js";
import messagesRouter from "./messages.js";
import notificationsRouter from "./notifications.js";
import cronRouter from "./cron.js";
import royalHolidayRouter from "./royal-holiday.js";
import supportRouter from "./support.js";
import sharesRouter from "./shares.js";

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
      toolCalculations: { GET: "/api/v1/tool-calculations", GET_ONE: "/api/v1/tool-calculations/:id", PUT: "/api/v1/tool-calculations", DELETE: "/api/v1/tool-calculations?tool=&prospect_id=" },
      surveyQuestionsConfig: { GET: "/api/v1/survey/questions-config", PUT: "/api/v1/survey/questions-config" },
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
        digest: { POST: "/api/v1/notifications/digest-reminders" },
        scheduleReminder: { POST: "/api/v1/notifications/schedule-reminder" },
        flushReminders: { POST: "/api/v1/notifications/flush-reminders" },
      },
      cron: {
        flushReminders: { GET_POST: "/api/v1/cron/flush-reminders" },
        cleanupSupportAttachments: { GET_POST: "/api/v1/cron/cleanup-support-attachments" },
        rhExtraDp: { GET_POST: "/api/v1/cron/rh-extra-dp" },
      },
      royalHoliday: {
        catalogo: { GET: "/api/v1/royal-holiday/:empresaId/catalogo" },
        preview: { POST: "/api/v1/royal-holiday/:empresaId/preview" },
        ventas: { POST: "/api/v1/royal-holiday/:empresaId/ventas" },
        comisionesMovimientos: { GET: "/api/v1/royal-holiday/:empresaId/comisiones-movimientos" },
        diasDescanso: { GET_POST: "/api/v1/royal-holiday/:empresaId/dias-descanso" },
        opsConfig: { GET_PUT: "/api/v1/royal-holiday/:empresaId/ops-config" },
        moneyBoxConfig: { GET_PUT: "/api/v1/royal-holiday/:empresaId/money-box-config" },
        premanifiesto: { GET: "/api/v1/royal-holiday/:empresaId/premanifiesto/dia" },
        linea: { GET_POST: "/api/v1/royal-holiday/:empresaId/linea/asignacion" },
        okr: { GET_POST: "/api/v1/royal-holiday/:empresaId/okr" },
        resumen: { GET: "/api/v1/royal-holiday/:empresaId/resumen" },
        propinas: { GET_POST: "/api/v1/royal-holiday/:empresaId/propinas" },
      },
      support: {
        requests: { POST: "/api/v1/support/requests" },
      },
      admin: {
        supportRequests: {
          GET: "/api/v1/admin/support/requests",
          PATCH: "/api/v1/admin/support/requests/:id",
        },
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

router.use(sessionRouter);
router.use(customModulesRouter);
router.use(workspaceRouter);
router.use(geoRouter);
router.use(remindersRouter);
router.use(exchangeRatesRouter);
router.use(profileRouter);
router.use(syncRouter);
router.use(prospectsRouter);
router.use(chatRouter);
router.use(salesRouter);
router.use(calendarRouter);
router.use(goalsRouter);
router.use(activitiesRouter);
router.use(toolsRouter);
router.use(networkRouter);
router.use(messagesRouter);
router.use(notificationsRouter);
router.use(cronRouter);
router.use(royalHolidayRouter);
router.use(supportRouter);
router.use(sharesRouter);
router.use("/admin", adminRouter);

export default router;
