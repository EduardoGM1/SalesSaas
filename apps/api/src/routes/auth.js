import { Router } from "express";
import { isSupabaseConfigured } from "@salesapp/shared/supabase/config.js";
import { apiError, json } from "../lib/http.js";
import { primaryWebOrigin } from "../lib/origins.js";
import { createCookieSupabaseClient } from "../lib/supabase-server.js";

const router = Router();

function traducirError(msg) {
  const m = String(msg).toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Debes confirmar tu correo antes de iniciar sesión.";
  if (m.includes("user already registered")) return "Ya existe una cuenta con ese correo.";
  if (m.includes("rate limit")) return "Demasiados intentos. Espera un momento.";
  if (m.includes("same as old password")) return "La nueva contraseña debe ser distinta a la anterior.";
  if (m.includes("fetch") || m.includes("timeout") || m.includes("abort")) {
    return "No se pudo contactar al servicio de autenticación. Intenta de nuevo.";
  }
  return msg;
}

router.post("/login", async (req, res) => {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const email = String(req.body?.email ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!email || !password) return apiError(res, "Escribe tu correo y contraseña.");
  try {
    const sb = createCookieSupabaseClient(req, res);
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
  } catch (err) {
    console.error("[auth/login]", err);
    return apiError(res, traducirError(err instanceof Error ? err.message : "Error de autenticación."), 503);
  }
});

router.post("/register", async (req, res) => {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const fullName = String(req.body?.fullName ?? "").trim();
  const email = String(req.body?.email ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!email || !password) return apiError(res, "Escribe tu correo y contraseña.");
  if (password.length < 6) return apiError(res, "La contraseña debe tener al menos 6 caracteres.");
  try {
    const sb = createCookieSupabaseClient(req, res);
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${primaryWebOrigin()}/auth/callback?next=/`,
      },
    });
    if (error) return apiError(res, traducirError(error.message), 400);
    if (data.session) return json(res, { ok: true, redirect: "/" });
    json(res, { message: "Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesión." });
  } catch (err) {
    console.error("[auth/register]", err);
    return apiError(res, traducirError(err instanceof Error ? err.message : "Error de registro."), 503);
  }
});

router.post("/signout", async (req, res) => {
  if (!isSupabaseConfigured()) return json(res, { ok: true });
  try {
    const sb = createCookieSupabaseClient(req, res);
    await sb.auth.signOut();
    json(res, { ok: true });
  } catch (err) {
    console.error("[auth/signout]", err);
    json(res, { ok: true });
  }
});

router.post("/forgot-password", async (req, res) => {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const email = String(req.body?.email ?? "").trim();
  if (!email) return apiError(res, "Escribe tu correo.");
  try {
    const sb = createCookieSupabaseClient(req, res);
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${primaryWebOrigin()}/auth/callback?next=/reset-password`,
    });
    if (error) return apiError(res, traducirError(error.message), 400);
    json(res, { message: "Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña." });
  } catch (err) {
    console.error("[auth/forgot-password]", err);
    return apiError(res, traducirError(err instanceof Error ? err.message : "Error al enviar correo."), 503);
  }
});

router.post("/reset-password", async (req, res) => {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const password = String(req.body?.password ?? "");
  const confirm = String(req.body?.confirm ?? "");
  if (password.length < 6) return apiError(res, "La contraseña debe tener al menos 6 caracteres.");
  if (password !== confirm) return apiError(res, "Las contraseñas no coinciden.");
  try {
    const sb = createCookieSupabaseClient(req, res);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return apiError(res, "Sesión expirada. Solicita un nuevo enlace de recuperación.", 401);
    const { error } = await sb.auth.updateUser({ password });
    if (error) return apiError(res, traducirError(error.message), 400);
    json(res, { ok: true, redirect: "/settings" });
  } catch (err) {
    console.error("[auth/reset-password]", err);
    return apiError(res, traducirError(err instanceof Error ? err.message : "Error al actualizar contraseña."), 503);
  }
});

router.get("/callback", async (req, res) => {
  const origin = primaryWebOrigin();
  if (!isSupabaseConfigured()) return res.redirect(`${origin}/login?error=auth`);
  const code = req.query.code;
  const next = req.query.next ?? "/";
  if (code) {
    try {
      const sb = createCookieSupabaseClient(req, res);
      const { error } = await sb.auth.exchangeCodeForSession(String(code));
      if (!error) return res.redirect(`${origin}${next}`);
    } catch (err) {
      console.error("[auth/callback]", err);
    }
  }
  res.redirect(`${origin}/login?error=auth`);
});

export default router;
