/**
 * Persistencia de prefs / suscripciones OneSignal en profiles.settings
 * y cooldowns en notification_cooldowns. Sin lógica de negocio de envío.
 */
import { ServiceError } from "../../../lib/service-error.js";
import { logger } from "../../../lib/logger.js";

export async function cargarSettingsPerfil(serviceSb, userId) {
  const { data } = await serviceSb
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .maybeSingle();
  return data?.settings ?? {};
}

export async function guardarSubscriptionIds(supabase, userId, { settings, nextIds }) {
  const { error } = await supabase
    .from("profiles")
    .update({ settings: { ...settings, onesignal_subscription_ids: nextIds } })
    .eq("id", userId);
  if (error) throw new ServiceError(error.message, 400);
}

export async function leerSettingsPerfilOError(supabase, userId) {
  const { data: current, error: readErr } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .maybeSingle();
  if (readErr) throw new ServiceError(readErr.message, 500);
  return current?.settings ?? {};
}

/**
 * @returns {Promise<boolean>} false si aún en ventana de cooldown
 */
export async function reclamarCooldownNotificacion(serviceSb, key, windowMs) {
  const { data } = await serviceSb
    .from("notification_cooldowns")
    .select("last_sent_at")
    .eq("key", key)
    .maybeSingle();
  if (data?.last_sent_at) {
    const elapsed = Date.now() - new Date(data.last_sent_at).getTime();
    if (elapsed < windowMs) return false;
  }
  const now = new Date().toISOString();
  const { error } = await serviceSb
    .from("notification_cooldowns")
    .upsert({ key, last_sent_at: now }, { onConflict: "key" });
  if (error) {
    logger.warn("[onesignal] cooldown upsert", { message: error.message });
    return true;
  }
  return true;
}
