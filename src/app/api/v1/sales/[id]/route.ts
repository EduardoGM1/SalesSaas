import type { NextRequest } from "next/server";
import { authenticateApi } from "@/lib/api/auth";
import { apiError, json, parseBody } from "@/lib/api/http";
import { sanitizeStatus, toDateOrNull } from "@/lib/api/validators";
import { isUuid } from "@/lib/data/mappers";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/sales/:id */
export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { id } = await params;
  if (!isUuid(id)) return apiError("ID inválido.");

  const { data, error } = await auth.supabase
    .from("sales")
    .select("*, prospects(name, name1, prospect_code)")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Venta no encontrada.", 404);
  return json({ data });
}

/** PATCH /api/v1/sales/:id */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { id } = await params;
  if (!isUuid(id)) return apiError("ID inválido.");

  const body = parseBody<Record<string, unknown>>(await request.json().catch(() => null));
  if (!body) return apiError("Cuerpo JSON inválido.");

  const patch: Record<string, unknown> = {};
  if (body.vol !== undefined) patch.vol = Number(body.vol) || 0;
  if (body.tours !== undefined) patch.tours = Math.max(1, Math.trunc(Number(body.tours) || 1));
  if (body.contract !== undefined) patch.contract = body.contract;
  if (body.note !== undefined) patch.note = body.note;
  if (body.status !== undefined) patch.status = sanitizeStatus(body.status);
  if (body.processing !== undefined) patch.processing = body.processing;
  if (body.add_processing_followup !== undefined || body.addProcessingFollowup !== undefined) {
    patch.add_processing_followup = Boolean(body.add_processing_followup ?? body.addProcessingFollowup);
  }
  if (body.sale_date !== undefined || body.date !== undefined) {
    patch.sale_date = toDateOrNull(body.sale_date ?? body.date);
  }
  if (body.process_date !== undefined || body.processDate !== undefined) {
    patch.process_date = toDateOrNull(body.process_date ?? body.processDate);
  }
  if (!Object.keys(patch).length) return apiError("Sin campos para actualizar.");

  const { data, error } = await auth.supabase
    .from("sales")
    .update(patch)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select()
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Venta no encontrada.", 404);
  return json({ data });
}

/** DELETE /api/v1/sales/:id */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { id } = await params;
  if (!isUuid(id)) return apiError("ID inválido.");

  const { error, count } = await auth.supabase
    .from("sales")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", auth.userId);

  if (error) return apiError(error.message, 400);
  if (!count) return apiError("Venta no encontrada.", 404);
  return json({ ok: true });
}
