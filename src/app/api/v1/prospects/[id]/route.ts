import type { NextRequest } from "next/server";
import { authenticateApi } from "@/lib/api/auth";
import { apiError, json, parseBody } from "@/lib/api/http";
import { bodyToProspectPatch } from "@/lib/api/validators";
import { isUuid } from "@/lib/data/mappers";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/prospects/:id */
export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { id } = await params;
  if (!isUuid(id)) return apiError("ID inválido.");

  const { data, error } = await auth.supabase
    .from("prospects")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Expediente no encontrado.", 404);
  return json({ data });
}

/** PATCH /api/v1/prospects/:id */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { id } = await params;
  if (!isUuid(id)) return apiError("ID inválido.");

  const body = parseBody<Record<string, unknown>>(await request.json().catch(() => null));
  if (!body) return apiError("Cuerpo JSON inválido.");

  const patch = bodyToProspectPatch(body);
  if (!Object.keys(patch).length) return apiError("Sin campos para actualizar.");

  const { data, error } = await auth.supabase
    .from("prospects")
    .update(patch)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select()
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Expediente no encontrado.", 404);
  return json({ data });
}

/** DELETE /api/v1/prospects/:id */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { id } = await params;
  if (!isUuid(id)) return apiError("ID inválido.");

  const { error, count } = await auth.supabase
    .from("prospects")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", auth.userId);

  if (error) return apiError(error.message, 400);
  if (!count) return apiError("Expediente no encontrado.", 404);
  return json({ ok: true });
}
