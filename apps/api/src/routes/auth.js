import { Router } from "express";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@salesapp/shared/supabase/config.js";
import { apiError, json } from "../lib/http.js";

const router = Router();
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

function parseCookieHeader(header = "") {
  return header.split(";").map((part) => {
    const [name, ...rest] = part.trim().split("=");
    return { name, value: rest.join("=") };
  }).filter((c) => c.name);
}

function supabaseFromReq(req, res) {
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

function traducirError(msg) {
  const m = String(msg).toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Debes confirmar tu correo antes de iniciar sesión.";
  if (m.includes("user already registered")) return "Ya existe una cuenta con ese correo.";
  if (m.includes("rate limit")) return "Demasiados intentos. Espera un momento.";
  if (m.includes("same as old password")) return "La nueva contraseña debe ser distinta a la anterior.";
  return msg;
}

router.post("/login", async (req, res) => {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const email = String(req.body?.email ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!email || !password) return apiError(res, "Escribe tu correo y contraseña.");
  const sb = supabaseFromReq(req, res);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return apiError(res, traducirError(error.message), 401);
  if (data.user) {
    const { data: profile } = await sb.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle();
    if (profile?.is_active === false) {
      await sb.auth.signOut();
      return apiError(res, "Tu cuenta fue desactivada. Contacta al administrador.", 403);
    }
  }
  json(res, { ok: true });
});

router.post("/register", async (req, res) => {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const fullName = String(req.body?.fullName ?? "").trim();
  const email = String(req.body?.email ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!email || !password) return apiError(res, "Escribe tu correo y contraseña.");
  if (password.length < 6) return apiError(res, "La contraseña debe tener al menos 6 caracteres.");
  const sb = supabaseFromReq(req, res);
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${WEB_ORIGIN}/auth/callback?next=/`,
    },
  });
  if (error) return apiError(res, traducirError(error.message), 400);
  if (data.session) return json(res, { ok: true, redirect: "/" });
  json(res, { message: "Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesión." });
});

router.post("/signout", async (req, res) => {
  if (!isSupabaseConfigured()) return json(res, { ok: true });
  const sb = supabaseFromReq(req, res);
  await sb.auth.signOut();
  json(res, { ok: true });
});

router.post("/forgot-password", async (req, res) => {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const email = String(req.body?.email ?? "").trim();
  if (!email) return apiError(res, "Escribe tu correo.");
  const sb = supabaseFromReq(req, res);
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${WEB_ORIGIN}/auth/callback?next=/reset-password`,
  });
  if (error) return apiError(res, traducirError(error.message), 400);
  json(res, { message: "Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña." });
});

router.post("/reset-password", async (req, res) => {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const password = String(req.body?.password ?? "");
  const confirm = String(req.body?.confirm ?? "");
  if (password.length < 6) return apiError(res, "La contraseña debe tener al menos 6 caracteres.");
  if (password !== confirm) return apiError(res, "Las contraseñas no coinciden.");
  const sb = supabaseFromReq(req, res);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return apiError(res, "Sesión expirada. Solicita un nuevo enlace de recuperación.", 401);
  const { error } = await sb.auth.updateUser({ password });
  if (error) return apiError(res, traducirError(error.message), 400);
  json(res, { ok: true, redirect: "/settings" });
});

router.get("/callback", async (req, res) => {
  if (!isSupabaseConfigured()) return res.redirect(`${WEB_ORIGIN}/login?error=auth`);
  const code = req.query.code;
  const next = req.query.next ?? "/";
  if (code) {
    const sb = supabaseFromReq(req, res);
    const { error } = await sb.auth.exchangeCodeForSession(String(code));
    if (!error) return res.redirect(`${WEB_ORIGIN}${next}`);
  }
  res.redirect(`${WEB_ORIGIN}/login?error=auth`);
});

export default router;
