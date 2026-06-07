import type { NextRequest } from "next/server";
import { authenticateApi } from "@/lib/api/auth";
import { apiError, json, parseBody } from "@/lib/api/http";

/** GET /api/v1/profile — Perfil del usuario autenticado. */
export async function GET(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { data, error } = await auth.supabase
    .from("profiles")
    .select("id, email, full_name, role, phone, avatar_url, settings, created_at, updated_at")
    .eq("id", auth.userId)
    .single();

  if (error) return apiError(error.message, 500);
  return json({ data });
}

/** PATCH /api/v1/profile — Actualiza nombre, teléfono, avatar, settings. */
export async function PATCH(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const body = parseBody<Record<string, unknown>>(await request.json().catch(() => null));
  if (!body) return apiError("Cuerpo JSON inválido.");

  const patch: Record<string, unknown> = {};
  if (body.full_name !== undefined || body.fullName !== undefined) {
    patch.full_name = body.full_name ?? body.fullName;
  }
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.avatar_url !== undefined || body.avatarUrl !== undefined) {
    patch.avatar_url = body.avatar_url ?? body.avatarUrl;
  }
  if (body.settings !== undefined && typeof body.settings === "object" && !Array.isArray(body.settings)) {
    patch.settings = body.settings;
  }
  if (!Object.keys(patch).length) return apiError("Sin campos para actualizar.");

  const { data, error } = await auth.supabase
    .from("profiles")
    .update(patch)
    .eq("id", auth.userId)
    .select("id, email, full_name, role, phone, avatar_url, settings, created_at, updated_at")
    .single();

  if (error) return apiError(error.message, 400);
  return json({ data });
}
