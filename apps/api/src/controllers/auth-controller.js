/**
 * Controladores /auth (cookies de sesión). Pueden escribir res (Set-Cookie).
 * El rate limit permanece en la ruta, no aquí.
 *
 * Reglas:
 * - Nunca devolver mensajes crudos de GoTrue/red en producción (ver traducirError).
 * - Todo `next`/redirect de usuario pasa por safeNextPath (solo rutas relativas).
 * - Los tipos de OTP se validan contra una lista blanca.
 */
import { isSupabaseConfigured } from "@salesapp/shared/supabase/config.js";
import { apiError, json } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import { resolveWebOrigin } from "../lib/origins.js";
import {
  cookieSecure,
  createCookieSupabaseClient,
  createRecoveryEmailClient,
} from "../lib/supabase-server.js";
import { notifySessionRevoked } from "../services/push-notifications-service.js";

const MIN_PASSWORD_LENGTH = 8;
const OTP_TYPES = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);
const GENERIC_AUTH_ERROR = "No se pudo completar la autenticación.";

/**
 * Traduce mensajes de GoTrue conocidos. Los desconocidos NO se devuelven al
 * cliente en producción: podrían contener detalles internos (hosts, SQL, etc.).
 */
function traducirError(msg, fallback = GENERIC_AUTH_ERROR) {
  const m = String(msg).toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Debes confirmar tu correo antes de iniciar sesión.";
  if (m.includes("user already registered")) return "Ya existe una cuenta con ese correo.";
  // Cuota de correos Auth a nivel de proyecto (signup+recover+email change), no por usuario.
  if (m.includes("rate limit") || m.includes("over_email_send_rate_limit")) {
    return "Se alcanzó el límite de correos de autenticación. Espera unos minutos e inténtalo de nuevo.";
  }
  if (m.includes("flow state") || m.includes("code verifier")) {
    return "No se pudo validar el enlace en este navegador. Solicita uno nuevo y ábrelo en el mismo dispositivo.";
  }
  if (m.includes("same as old password")) return "La nueva contraseña debe ser distinta a la anterior.";
  if (m.includes("password") && (m.includes("weak") || m.includes("at least"))) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (m.includes("otp") && m.includes("expired")) return "El enlace expiró. Solicita uno nuevo.";
  if (m.includes("fetch") || m.includes("timeout") || m.includes("abort")) {
    return "No se pudo contactar al servicio de autenticación. Intenta de nuevo.";
  }
  if (process.env.NODE_ENV === "production") return fallback;
  return msg;
}

/** 503 homogéneo para excepciones de red/infra en /auth (log estructurado, sin filtrar detalles). */
function fallar(res, scope, err, fallback = GENERIC_AUTH_ERROR) {
  logger.error(err, { scope });
  const message = err instanceof Error ? traducirError(err.message, fallback) : fallback;
  return apiError(res, message, 503);
}

/** Solo rutas relativas del SPA (evita open redirect a otros orígenes o `//host`). */
function safeNextPath(raw, fallback = "/") {
  const value = String(raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

function validarPassword(password, confirm) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (confirm !== undefined && password !== confirm) return "Las contraseñas no coinciden.";
  return null;
}

export async function iniciarSesion(req, res) {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const email = String(req.body?.email ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!email || !password) return apiError(res, "Escribe tu correo y contraseña.");
  try {
    const sb = createCookieSupabaseClient(req, res);
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return apiError(res, traducirError(error.message, "Correo o contraseña incorrectos."), 401);
    if (data.user) {
      const { data: profile } = await sb.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle();
      if (profile?.is_active === false) {
        await sb.auth.signOut();
        return apiError(res, "Tu cuenta fue desactivada. Contacta al administrador.", 403);
      }
      try {
        await sb.rpc("platform_session_start", { p_user_id: data.user.id });
      } catch (sessionErr) {
        logger.warn("auth.login.session_start_failed", { error: sessionErr });
      }
    }
    json(res, { ok: true });
  } catch (err) {
    return fallar(res, "auth.login", err);
  }
}

export async function registrar(req, res) {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const fullName = String(req.body?.fullName ?? "").trim().slice(0, 120);
  const email = String(req.body?.email ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!email || !password) return apiError(res, "Escribe tu correo y contraseña.");
  const invalid = validarPassword(password);
  if (invalid) return apiError(res, invalid);
  try {
    const sb = createCookieSupabaseClient(req, res);
    const redirectOrigin = resolveWebOrigin(req, req.body?.redirectOrigin);
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${redirectOrigin}/auth/callback?next=/`,
      },
    });
    if (error) return apiError(res, traducirError(error.message, "No se pudo crear la cuenta."), 400);
    if (data.session) return json(res, { ok: true, redirect: "/" });
    json(res, { message: "Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesión." });
  } catch (err) {
    return fallar(res, "auth.register", err, "No se pudo crear la cuenta.");
  }
}

export async function cerrarSesion(req, res) {
  if (!isSupabaseConfigured()) return json(res, { ok: true });
  try {
    const sb = createCookieSupabaseClient(req, res);
    const { data: { user } } = await sb.auth.getUser();
    if (user?.id) {
      try {
        await sb.rpc("platform_session_end", { p_user_id: user.id });
      } catch (sessionErr) {
        logger.warn("auth.signout.session_end_failed", { error: sessionErr });
      }
      const { error: revokeErr } = await sb
        .from("profiles")
        .update({ auth_revoked_at: new Date().toISOString() })
        .eq("id", user.id);
      if (revokeErr) logger.warn("auth.signout.revoke_failed", { error: revokeErr.message });
      notifySessionRevoked(user.id).catch((err) => {
        logger.warn("auth.signout.push_failed", { error: err });
      });
    }
    await sb.auth.signOut({ scope: "global" });
    json(res, { ok: true });
  } catch (err) {
    logger.error(err, { scope: "auth.signout" });
    json(res, { ok: true });
  }
}

export async function olvidarContrasena(req, res) {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const email = String(req.body?.email ?? "").trim();
  if (!email) return apiError(res, "Escribe tu correo.");
  try {
    const sb = createRecoveryEmailClient();
    const redirectOrigin = resolveWebOrigin(req, req.body?.redirectOrigin);
    res.append(
      "Set-Cookie",
      `saletse_auth_intent=recovery; Path=/; Max-Age=3600; SameSite=Lax${cookieSecure() ? "; Secure" : ""}`,
    );
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${redirectOrigin}/reset-password`,
    });
    if (error) return apiError(res, traducirError(error.message, "No se pudo enviar el correo."), 400);
    json(res, { message: "Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña." });
  } catch (err) {
    return fallar(res, "auth.forgot_password", err, "No se pudo enviar el correo.");
  }
}

export async function restablecerContrasena(req, res) {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const password = String(req.body?.password ?? "");
  const confirm = String(req.body?.confirm ?? "");
  const invalid = validarPassword(password, confirm);
  if (invalid) return apiError(res, invalid);
  try {
    const sb = createCookieSupabaseClient(req, res);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return apiError(res, "Sesión expirada. Solicita un nuevo enlace de recuperación.", 401);
    const { error } = await sb.auth.updateUser({ password });
    if (error) return apiError(res, traducirError(error.message, "No se pudo actualizar la contraseña."), 400);
    json(res, { ok: true, redirect: "/settings" });
  } catch (err) {
    return fallar(res, "auth.reset_password", err, "No se pudo actualizar la contraseña.");
  }
}

export async function intercambiarCodigo(req, res) {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const code = String(req.body?.code ?? "").trim();
  if (!code || code.length > 512) return apiError(res, "Enlace inválido o expirado.", 400);
  try {
    const sb = createCookieSupabaseClient(req, res);
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) return apiError(res, traducirError(error.message, "Enlace inválido o expirado."), 400);
    json(res, { ok: true });
  } catch (err) {
    return fallar(res, "auth.exchange_code", err);
  }
}

export async function verificarToken(req, res) {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const token_hash = String(req.body?.token_hash ?? "").trim();
  const type = String(req.body?.type ?? "").trim();
  if (!token_hash || token_hash.length > 512 || !OTP_TYPES.has(type)) {
    return apiError(res, "Enlace inválido o expirado.", 400);
  }
  try {
    const sb = createCookieSupabaseClient(req, res);
    const { error } = await sb.auth.verifyOtp({ token_hash, type });
    if (error) return apiError(res, traducirError(error.message, "Enlace inválido o expirado."), 400);
    json(res, { ok: true });
  } catch (err) {
    return fallar(res, "auth.verify_token", err);
  }
}

/** Copia una sesión ya emitida por GoTrue (flujo implícito en el hash) a cookies. */
export async function fijarSesion(req, res) {
  if (!isSupabaseConfigured()) return apiError(res, "Supabase no configurado.", 503);
  const access_token = String(req.body?.access_token ?? "").trim();
  const refresh_token = String(req.body?.refresh_token ?? "").trim();
  if (!access_token || !refresh_token || access_token.length > 4096 || refresh_token.length > 512) {
    return apiError(res, "Sesión inválida.", 400);
  }
  try {
    const sb = createCookieSupabaseClient(req, res);
    const { error } = await sb.auth.setSession({ access_token, refresh_token });
    if (error) return apiError(res, traducirError(error.message, "Sesión inválida."), 400);
    json(res, { ok: true });
  } catch (err) {
    return fallar(res, "auth.set_session", err);
  }
}

/** Redirige el callback de GoTrue al SPA del origen permitido, conservando solo parámetros conocidos. */
export async function redirigirCallback(req, res) {
  const origin = resolveWebOrigin(req, req.query.redirect_origin);
  const next = safeNextPath(req.query.next);
  const qs = new URLSearchParams();
  if (next !== "/") qs.set("next", next);
  for (const key of ["code", "token_hash", "type", "error", "error_description"]) {
    if (typeof req.query[key] === "string" && req.query[key]) qs.set(key, req.query[key]);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return res.redirect(`${origin}/auth/callback${suffix}`);
}
