import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@salesapp/shared/supabase/config.js";

function parseCookieHeader(header = "") {
  return header.split(";").map((part) => {
    const [name, ...rest] = part.trim().split("=");
    return { name, value: rest.join("=") };
  }).filter((c) => c.name);
}

function createCookieClient(req, res) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => parseCookieHeader(req.headers.cookie),
      setAll: (cookiesToSet) => {
        for (const { name, value, ...options } of cookiesToSet) {
          const parts = [`${name}=${value}`];
          if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
          if (options.path) parts.push(`Path=${options.path}`);
          if (options.httpOnly) parts.push("HttpOnly");
          if (options.secure) parts.push("Secure");
          if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
          res.append("Set-Cookie", parts.join("; "));
        }
      },
    },
  });
}

export async function authenticateApi(req, res) {
  if (!isSupabaseConfigured()) {
    return { ok: false, status: 503, message: "Supabase no configurado." };
  }

  const authHeader = req.headers.authorization;
  let supabase;

  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (!token) return { ok: false, status: 401, message: "Token Bearer inválido." };
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  } else {
    supabase = createCookieClient(req, res);
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, status: 401, message: "No autenticado." };
  }

  return { ok: true, supabase, userId: user.id };
}
