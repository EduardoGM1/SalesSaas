/**
 * Perfil del usuario autenticado. Merge profundo de settings.workspaces para no pisar otras salas.
 */
import { ServiceError } from "../lib/service-error.js";
import * as perfilRepo from "../repositories/profile-repository.js";

export async function obtenerPerfil(supabase, userId) {
  return perfilRepo.obtenerPerfilPorId(supabase, userId);
}

export function armarParchePerfil(body) {
  const patch = {};
  if (body.full_name !== undefined || body.fullName !== undefined) patch.full_name = body.full_name ?? body.fullName;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.avatar_url !== undefined || body.avatarUrl !== undefined) patch.avatar_url = body.avatar_url ?? body.avatarUrl;
  if (body.settings !== undefined && typeof body.settings === "object" && !Array.isArray(body.settings)) {
    patch.settings = body.settings;
  }
  if (!Object.keys(patch).length) throw new ServiceError("Sin campos para actualizar.");
  return patch;
}

export async function actualizarPerfil(supabase, userId, body) {
  const patch = armarParchePerfil(body);
  const current = await perfilRepo.obtenerNombreYSettings(supabase, userId);

  if (patch.settings) {
    const currentSettings = current?.settings ?? {};
    const nextSettings = { ...currentSettings, ...patch.settings };
    if (
      patch.settings.workspaces
      && typeof patch.settings.workspaces === "object"
      && currentSettings.workspaces
      && typeof currentSettings.workspaces === "object"
    ) {
      nextSettings.workspaces = {
        ...currentSettings.workspaces,
        ...patch.settings.workspaces,
      };
    }
    patch.settings = nextSettings;
  }

  // Evita cuentas con settings.userName real pero full_name vacío → se ven como "Usuario".
  const settingsName = String(patch.settings?.userName ?? current?.settings?.userName ?? "").trim();
  const nextFullName = patch.full_name !== undefined ? String(patch.full_name ?? "").trim() : null;
  const currentFullName = String(current?.full_name ?? "").trim();
  if (!currentFullName && !nextFullName && settingsName && settingsName.toLowerCase() !== "usuario") {
    patch.full_name = settingsName;
  }

  return perfilRepo.actualizarPerfilPorId(supabase, userId, patch);
}

export async function marcarPresenciaOffline(supabase, userId) {
  const now = new Date().toISOString();
  try {
    await supabase.rpc("platform_session_end", { p_user_id: userId });
  } catch {
    // fallback: solo last_seen si la migración aún no está aplicada
  }
  return perfilRepo.actualizarPresenciaOffline(supabase, userId, now);
}

export const getProfile = obtenerPerfil;
export const buildProfilePatch = armarParchePerfil;
export const updateProfile = actualizarPerfil;
export const markPresenceOffline = marcarPresenciaOffline;
