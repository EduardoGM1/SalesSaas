"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  message?: string;
}

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function login(_prev: AuthState | null, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Escribe tu correo y contraseña." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: traducirError(error.message) };

  if (data.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile?.is_active === false) {
      await supabase.auth.signOut();
      return { error: "Tu cuenta fue desactivada. Contacta al administrador." };
    }
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(_prev: AuthState | null, formData: FormData): Promise<AuthState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Escribe tu correo y contraseña." };
  if (password.length < 6) return { error: "La contraseña debe tener al menos 6 caracteres." };

  const origin = await getOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/callback?next=/`,
    },
  });
  if (error) return { error: traducirError(error.message) };

  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/");
  }
  return { message: "Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesión." };
}

export async function requestPasswordReset(_prev: AuthState | null, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Escribe tu correo." };

  const origin = await getOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (error) return { error: traducirError(error.message) };

  return { message: "Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña." };
}

export async function updatePassword(_prev: AuthState | null, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 6) return { error: "La contraseña debe tener al menos 6 caracteres." };
  if (password !== confirm) return { error: "Las contraseñas no coinciden." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada. Solicita un nuevo enlace de recuperación." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: traducirError(error.message) };

  revalidatePath("/", "layout");
  redirect("/settings");
}

export async function updateProfile(_prev: AuthState | null, formData: FormData): Promise<AuthState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName || null, phone: phone || null })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { message: "Perfil actualizado." };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

function traducirError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Debes confirmar tu correo antes de iniciar sesión.";
  if (m.includes("user already registered")) return "Ya existe una cuenta con ese correo.";
  if (m.includes("rate limit")) return "Demasiados intentos. Espera un momento.";
  if (m.includes("same as old password")) return "La nueva contraseña debe ser distinta a la anterior.";
  return msg;
}
