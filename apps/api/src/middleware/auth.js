import { isSupabaseConfigured } from "@salesapp/shared/supabase/config.js";
import {
  createBearerSupabaseClient,
  createCookieSupabaseClient,
} from "../lib/supabase-server.js";

export async function authenticateApi(req, res) {
  if (!isSupabaseConfigured()) {
    return { ok: false, status: 503, message: "Supabase no configurado." };
  }

  const authHeader = req.headers.authorization;
  let supabase;

  try {
    if (authHeader?.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.slice(7).trim();
      if (!token) return { ok: false, status: 401, message: "Token Bearer inválido." };
      supabase = createBearerSupabaseClient(token);
    } else {
      supabase = createCookieSupabaseClient(req, res);
    }
  } catch (err) {
    console.error("[authenticateApi]", err);
    return { ok: false, status: 503, message: "Supabase no configurado." };
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, status: 401, message: "No autenticado." };
  }

  return { ok: true, supabase, userId: user.id };
}
