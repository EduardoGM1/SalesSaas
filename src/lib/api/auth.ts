import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/config";

export type ApiAuth =
  | { ok: true; supabase: SupabaseClient; userId: string }
  | { ok: false; status: number; message: string };

/** Autentica vía Bearer JWT (móvil) o cookies de sesión (web). */
export async function authenticateApi(request: NextRequest): Promise<ApiAuth> {
  if (!isSupabaseConfigured()) {
    return { ok: false, status: 503, message: "Supabase no configurado." };
  }

  const authHeader = request.headers.get("authorization");
  let supabase: SupabaseClient;

  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (!token) return { ok: false, status: 401, message: "Token Bearer inválido." };
    supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  } else {
    const cookieStore = await cookies();
    supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    });
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, status: 401, message: "No autenticado." };
  }

  return { ok: true, supabase, userId: user.id };
}
