import type { NextRequest } from "next/server";
import { authenticateApi } from "@/lib/api/auth";
import { apiError, json } from "@/lib/api/http";

/** GET /api/v1/auth/session — Valida token y devuelve usuario + perfil. */
export async function GET(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const {
    data: { user },
  } = await auth.supabase.auth.getUser();

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("id, email, full_name, role, phone, avatar_url")
    .eq("id", auth.userId)
    .single();

  return json({
    user: user ? { id: user.id, email: user.email } : null,
    profile: profile ?? null,
  });
}
