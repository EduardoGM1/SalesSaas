import type { NextRequest } from "next/server";
import { authenticateApi } from "@/lib/api/auth";
import { apiError, json, parseBody, parseLimitOffset } from "@/lib/api/http";
import { bodyToProspectInsert } from "@/lib/api/validators";

/** GET /api/v1/prospects — Lista expedientes del usuario. */
export async function GET(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { limit, offset } = parseLimitOffset(request.nextUrl.searchParams);
  const status = request.nextUrl.searchParams.get("status");

  let q = auth.supabase
    .from("prospects")
    .select("*", { count: "exact" })
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) q = q.eq("status", status);

  const { data, error, count } = await q;
  if (error) return apiError(error.message, 500);
  return json({ data: data ?? [], total: count ?? 0, limit, offset });
}

/** POST /api/v1/prospects — Crea un expediente. */
export async function POST(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const body = parseBody<Record<string, unknown>>(await request.json().catch(() => null));
  if (!body) return apiError("Cuerpo JSON inválido.");

  const row = bodyToProspectInsert(body, auth.userId);
  const { data, error } = await auth.supabase.from("prospects").insert(row).select().single();
  if (error) return apiError(error.message, 400);
  return json({ data }, 201);
}
