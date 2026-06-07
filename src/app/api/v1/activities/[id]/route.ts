import type { NextRequest } from "next/server";
import { authenticateApi } from "@/lib/api/auth";
import { apiError, json, parseBody } from "@/lib/api/http";
import { isUuid } from "@/lib/data/mappers";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/activities/:id */
export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { id } = await params;
  if (!isUuid(id)) return apiError("ID inválido.");

  const { data, error } = await auth.supabase
    .from("activities")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Actividad no encontrada.", 404);
  return json({ data });
}

/** PATCH /api/v1/activities/:id */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { id } = await params;
  if (!isUuid(id)) return apiError("ID inválido.");

  const body = parseBody<Record<string, unknown>>(await request.json().catch(() => null));
  if (!body) return apiError("Cuerpo JSON inválido.");

  const allowed = ["type", "title", "note", "source", "vol", "tours", "contract"] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.activity_date !== undefined || body.date !== undefined) {
    const d = String(body.activity_date ?? body.date).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) patch.activity_date = d;
  }
  if (!Object.keys(patch).length) return apiError("Sin campos para actualizar.");

  const { data, error } = await auth.supabase
    .from("activities")
    .update(patch)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select()
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Actividad no encontrada.", 404);
  return json({ data });
}

/** DELETE /api/v1/activities/:id */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { id } = await params;
  if (!isUuid(id)) return apiError("ID inválido.");

  const { error, count } = await auth.supabase
    .from("activities")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", auth.userId);

  if (error) return apiError(error.message, 400);
  if (!count) return apiError("Actividad no encontrada.", 404);
  return json({ ok: true });
}
