import type { NextRequest } from "next/server";
import { authenticateApi } from "@/lib/api/auth";
import { apiError, json, parseBody } from "@/lib/api/http";
import { bodyToGoalUpsert } from "@/lib/api/validators";

/** GET /api/v1/goals — Metas del usuario (?year=2026 opcional). */
export async function GET(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const year = request.nextUrl.searchParams.get("year");
  let q = auth.supabase.from("goals").select("*").eq("user_id", auth.userId).order("year").order("month");
  if (year) q = q.eq("year", Number(year));

  const { data, error } = await q;
  if (error) return apiError(error.message, 500);
  return json({ data: data ?? [] });
}

/** PUT /api/v1/goals — Upsert meta mensual (year, month requeridos). */
export async function PUT(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const body = parseBody<Record<string, unknown>>(await request.json().catch(() => null));
  if (!body) return apiError("Cuerpo JSON inválido.");

  const row = bodyToGoalUpsert(body, auth.userId);
  if (!row) return apiError("year y month (0-11) son requeridos.");

  const { data, error } = await auth.supabase
    .from("goals")
    .upsert(row, { onConflict: "user_id,year,month" })
    .select()
    .single();

  if (error) return apiError(error.message, 400);
  return json({ data });
}

/** DELETE /api/v1/goals?year=2026&month=5 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const sp = request.nextUrl.searchParams;
  const year = Math.trunc(Number(sp.get("year")));
  const month = Math.trunc(Number(sp.get("month")));
  if (!year || month < 0 || month > 11) return apiError("Query year y month (0-11) requeridos.");

  const { error, count } = await auth.supabase
    .from("goals")
    .delete({ count: "exact" })
    .eq("user_id", auth.userId)
    .eq("year", year)
    .eq("month", month);

  if (error) return apiError(error.message, 400);
  if (!count) return apiError("Meta no encontrada.", 404);
  return json({ ok: true });
}
