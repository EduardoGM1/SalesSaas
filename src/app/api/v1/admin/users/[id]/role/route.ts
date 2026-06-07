import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authenticateApi } from "@/lib/api/auth";
import { requireApiAdmin } from "@/lib/api/admin-auth";
import { apiError, json, parseBody } from "@/lib/api/http";

const ROLES = new Set(["vendedor", "admin"]);

/** PATCH /api/v1/admin/users/:id/role — Cambia el rol de un usuario (solo admin). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAdmin(await authenticateApi(request), "users:role");
  if (!auth.ok) return apiError(auth.message, auth.status);

  const { id: userId } = await params;
  const body = parseBody<Record<string, unknown>>(await request.json().catch(() => null));
  if (!body) return apiError("Cuerpo JSON inválido.");

  const role = typeof body.role === "string" ? body.role : "";
  if (!userId || !ROLES.has(role)) return apiError("Datos inválidos.");

  const { error } = await auth.supabase.rpc("admin_update_user_role", {
    p_target_id: userId,
    p_role: role,
  });

  if (error) return apiError(error.message, 400);

  const { data } = await auth.supabase.from("profiles").select("id, role").eq("id", userId).single();

  revalidatePath("/admin/users");
  return json({ data });
}
