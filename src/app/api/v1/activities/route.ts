import type { NextRequest } from "next/server";
import { authenticateApi } from "@/lib/api/auth";
import { apiError, json, parseBody, parseLimitOffset } from "@/lib/api/http";
import { bodyToActivityInsert } from "@/lib/api/validators";
import { isUuid } from "@/lib/data/mappers";

/** GET /api/v1/activities */
export async function GET(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const sp = request.nextUrl.searchParams;
  const { limit, offset } = parseLimitOffset(sp);
  const prospectId = sp.get("prospect_id");

  let q = auth.supabase
    .from("activities")
    .select("*", { count: "exact" })
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (prospectId === "null" || prospectId === "personal") {
    q = q.is("prospect_id", null);
  } else if (prospectId && isUuid(prospectId)) {
    q = q.eq("prospect_id", prospectId);
  }

  const { data, error, count } = await q;
  if (error) return apiError(error.message, 500);
  return json({ data: data ?? [], total: count ?? 0, limit, offset });
}

/** POST /api/v1/activities */
export async function POST(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const body = parseBody<Record<string, unknown>>(await request.json().catch(() => null));
  if (!body) return apiError("Cuerpo JSON inválido.");

  const row = bodyToActivityInsert(body, auth.userId);
  if (!row) return apiError("type es requerido.");

  const { data, error } = await auth.supabase.from("activities").insert(row).select().single();
  if (error) return apiError(error.message, 400);
  return json({ data }, 201);
}
