import { isSupabaseConfigured } from "@/lib/supabase/config";
import { translate } from "@/lib/i18n.js";
import { useDbStore } from "@/stores/db-store";
import { toast } from "@/lib/toast";

export function buildSettingsPayload(settings, fullName) {
  return {
    ...settings,
    userName: fullName || settings.userName || "Usuario",
    userInitials: settings.userInitials || (fullName || "Usuario").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
    exchangeRate: settings.currency === "USD" ? 1 : Number(settings.exchangeRate || 1),
    exchangeMode: settings.exchangeMode || "auto",
  };
}

export async function saveProfileRemote({ fullName, phone, avatarUrl, settings }) {
  const db = useDbStore.getState().db;
  const nextSettings = buildSettingsPayload(settings, fullName);
  useDbStore.getState().replaceDb({ ...db, settings: nextSettings });

  if (!isSupabaseConfigured()) {
    toast.success(translate("toast.settings.savedLocal"));
    return { ok: true, localOnly: true, settings: nextSettings };
  }

  // Asegura que el nombre visible en red/mensajes no quede vacío en profiles.full_name.
  const resolvedName = String(fullName || nextSettings.userName || "").trim();
  const res = await fetch("/api/v1/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      fullName: resolvedName && resolvedName.toLowerCase() !== "usuario" ? resolvedName : fullName,
      phone,
      avatarUrl: avatarUrl || null,
      settings: nextSettings,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "No se pudo guardar el perfil.");
  toast.success(translate("toast.settings.saved"));
  return { ok: true, settings: nextSettings };
}

/** Persiste un parche de settings sin tocar fullName/phone/avatar. */
export async function saveSettingsPatchRemote(settingsPatch) {
  const db = useDbStore.getState().db;
  const nextSettings = buildSettingsPayload(
    { ...(db.settings || {}), ...(settingsPatch || {}) },
    db.settings?.userName,
  );
  useDbStore.getState().replaceDb({ ...db, settings: nextSettings });

  if (!isSupabaseConfigured()) {
    toast.success(translate("toast.settings.savedLocal"));
    return { ok: true, localOnly: true, settings: nextSettings };
  }

  const res = await fetch("/api/v1/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ settings: nextSettings }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "No se pudo guardar la configuración.");
  toast.success(translate("toast.settings.saved"));
  return { ok: true, settings: nextSettings };
}
