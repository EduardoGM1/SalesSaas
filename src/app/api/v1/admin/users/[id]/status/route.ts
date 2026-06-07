import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authenticateApi } from "@/lib/api/auth";
import { requireApiAdmin } from "@/lib/api/admin-auth";
import { apiError, json, parseBody } from "@/lib/api/http";

/** PATCH /api/v1/admin/users/:id/status — Activa o desactiva una cuenta (solo admin). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const baseAuth = await authenticateApi(request);
  if (!baseAuth.ok) return apiError(baseAuth.message, baseAuth.status);

  const { id: userId } = await params;
  const body = parseBody<Record<string, unknown>>(await request.json().catch(() => null));
  if (!body) return apiError("Cuerpo JSON inválido.");

  const isActive = body.is_active;
  if (!userId || typeof isActive !== "boolean") return apiError("Datos inválidos.");

  const perm = isActive ? "users:activate" : "users:deactivate";
  const auth = await requireApiAdmin(baseAuth, perm);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { error } = await auth.supabase.rpc("admin_set_user_active", {
    p_target_id: userId,
    p_active: isActive,
  });

  if (error) return apiError(error.message, 400);

  const { data } = await auth.supabase
    .from("profiles")
    .select("id, is_active")
    .eq("id", userId)
    .single();

  revalidatePath("/admin/users");
  return json({ data });
}
