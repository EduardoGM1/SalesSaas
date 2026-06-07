import type { NextRequest } from "next/server";
import { authenticateApi } from "@/lib/api/auth";
import { apiError, json, parseBody, parseLimitOffset } from "@/lib/api/http";
import { bodyToCalInsert, sanitizeEntryType } from "@/lib/api/validators";
import { isUuid } from "@/lib/data/mappers";

/** GET /api/v1/calendar-entries */
export async function GET(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const sp = request.nextUrl.searchParams;
  const { limit, offset } = parseLimitOffset(sp);
  const prospectId = sp.get("prospect_id");
  const type = sp.get("type");
  const from = sp.get("from");
  const to = sp.get("to");

  let q = auth.supabase
    .from("calendar_entries")
    .select("*", { count: "exact" })
    .eq("user_id", auth.userId)
    .order("entry_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (prospectId && isUuid(prospectId)) q = q.eq("prospect_id", prospectId);
  if (type && sanitizeEntryType(type)) q = q.eq("type", type);
  if (from) q = q.gte("entry_date", from);
  if (to) q = q.lte("entry_date", to);

  const { data, error, count } = await q;
  if (error) return apiError(error.message, 500);
  return json({ data: data ?? [], total: count ?? 0, limit, offset });
}

/** POST /api/v1/calendar-entries */
export async function POST(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const body = parseBody<Record<string, unknown>>(await request.json().catch(() => null));
  if (!body) return apiError("Cuerpo JSON inválido.");

  const row = bodyToCalInsert(body, auth.userId);
  if (!row) return apiError("type/t y entry_date/date son requeridos.");

  const { data, error } = await auth.supabase.from("calendar_entries").insert(row).select().single();
  if (error) return apiError(error.message, 400);
  return json({ data }, 201);
}
