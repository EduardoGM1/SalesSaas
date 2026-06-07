import type { NextRequest } from "next/server";
import { authenticateApi } from "@/lib/api/auth";
import { apiError, json, parseBody } from "@/lib/api/http";
import { sanitizeEntryType } from "@/lib/api/validators";
import { isUuid } from "@/lib/data/mappers";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/calendar-entries/:id */
export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { id } = await params;
  if (!isUuid(id)) return apiError("ID inválido.");

  const { data, error } = await auth.supabase
    .from("calendar_entries")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Entrada no encontrada.", 404);
  return json({ data });
}

/** PATCH /api/v1/calendar-entries/:id */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { id } = await params;
  if (!isUuid(id)) return apiError("ID inválido.");

  const body = parseBody<Record<string, unknown>>(await request.json().catch(() => null));
  if (!body) return apiError("Cuerpo JSON inválido.");

  const patch: Record<string, unknown> = {};
  if (body.note !== undefined) patch.note = body.note;
  if (body.contract !== undefined) patch.contract = body.contract;
  if (body.source !== undefined) patch.source = body.source;
  if (body.vol !== undefined) patch.vol = body.vol != null ? Number(body.vol) : null;
  if (body.tours !== undefined) patch.tours = body.tours != null ? Math.trunc(Number(body.tours)) : null;
  if (body.type !== undefined || body.t !== undefined) {
    patch.type = sanitizeEntryType(body.type ?? body.t);
  }
  if (body.entry_date !== undefined || body.date !== undefined) {
    const d = String(body.entry_date ?? body.date).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) patch.entry_date = d;
  }
  if (body.prospect_id !== undefined || body.prospectId !== undefined) {
    const pid = body.prospect_id ?? body.prospectId;
    patch.prospect_id = pid && isUuid(pid) ? pid : null;
  }
  if (!Object.keys(patch).length) return apiError("Sin campos para actualizar.");

  const { data, error } = await auth.supabase
    .from("calendar_entries")
    .update(patch)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select()
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Entrada no encontrada.", 404);
  return json({ data });
}

/** DELETE /api/v1/calendar-entries/:id */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { id } = await params;
  if (!isUuid(id)) return apiError("ID inválido.");

  const { error, count } = await auth.supabase
    .from("calendar_entries")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", auth.userId);

  if (error) return apiError(error.message, 400);
  if (!count) return apiError("Entrada no encontrada.", 404);
  return json({ ok: true });
}
