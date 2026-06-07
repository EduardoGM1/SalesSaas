import type { NextRequest } from "next/server";
import { authenticateApi } from "@/lib/api/auth";
import { apiError, json, parseBody, parseLimitOffset } from "@/lib/api/http";
import { bodyToSaleInsert } from "@/lib/api/validators";
import { isUuid } from "@/lib/data/mappers";

/** GET /api/v1/sales */
export async function GET(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const sp = request.nextUrl.searchParams;
  const { limit, offset } = parseLimitOffset(sp);
  const prospectId = sp.get("prospect_id");
  const from = sp.get("from");
  const to = sp.get("to");

  let q = auth.supabase
    .from("sales")
    .select("*, prospects(name, name1, prospect_code)", { count: "exact" })
    .eq("user_id", auth.userId)
    .order("sale_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (prospectId && isUuid(prospectId)) q = q.eq("prospect_id", prospectId);
  if (from) q = q.gte("sale_date", from);
  if (to) q = q.lte("sale_date", to);

  const { data, error, count } = await q;
  if (error) return apiError(error.message, 500);
  return json({ data: data ?? [], total: count ?? 0, limit, offset });
}

/** POST /api/v1/sales */
export async function POST(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const body = parseBody<Record<string, unknown>>(await request.json().catch(() => null));
  if (!body) return apiError("Cuerpo JSON inválido.");

  const row = bodyToSaleInsert(body, auth.userId);
  if (!row) return apiError("prospect_id y sale_date/date son requeridos.");

  const { data, error } = await auth.supabase.from("sales").insert(row).select().single();
  if (error) return apiError(error.message, 400);
  return json({ data }, 201);
}
