import { json } from "@/lib/api/http";

/** GET /api/v1 — Descubrimiento de la API REST. */
export async function GET() {
  return json({
    version: "v1",
    auth: "Authorization: Bearer <supabase_access_token> o cookies de sesión web",
    endpoints: {
      session: { GET: "/api/v1/auth/session" },
      profile: { GET: "/api/v1/profile", PATCH: "/api/v1/profile" },
      sync: { GET: "/api/v1/sync", PUT: "/api/v1/sync" },
      prospects: {
        GET: "/api/v1/prospects",
        POST: "/api/v1/prospects",
        GET_ONE: "/api/v1/prospects/:id",
        PATCH: "/api/v1/prospects/:id",
        DELETE: "/api/v1/prospects/:id",
      },
      sales: {
        GET: "/api/v1/sales",
        POST: "/api/v1/sales",
        GET_ONE: "/api/v1/sales/:id",
        PATCH: "/api/v1/sales/:id",
        DELETE: "/api/v1/sales/:id",
      },
      calendarEntries: {
        GET: "/api/v1/calendar-entries",
        POST: "/api/v1/calendar-entries",
        GET_ONE: "/api/v1/calendar-entries/:id",
        PATCH: "/api/v1/calendar-entries/:id",
        DELETE: "/api/v1/calendar-entries/:id",
      },
      goals: { GET: "/api/v1/goals", PUT: "/api/v1/goals", DELETE: "/api/v1/goals?year=&month=" },
      activities: {
        GET: "/api/v1/activities",
        POST: "/api/v1/activities",
        GET_ONE: "/api/v1/activities/:id",
        PATCH: "/api/v1/activities/:id",
        DELETE: "/api/v1/activities/:id",
      },
      toolCalculations: {
        GET: "/api/v1/tool-calculations",
        PUT: "/api/v1/tool-calculations",
        DELETE: "/api/v1/tool-calculations?tool=&prospect_id=",
      },
    },
  });
}
