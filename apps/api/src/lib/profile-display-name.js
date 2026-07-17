/**
 * Nombre visible de un perfil.
 * Orden: full_name → settings.userName (si no es el placeholder) → email local → "Usuario".
 */
export function profileDisplayName(profile, fallback = "Usuario") {
  const fromColumn = String(profile?.full_name ?? "").trim();
  if (fromColumn) return fromColumn;

  const fromSettings = String(profile?.settings?.userName ?? "").trim();
  if (fromSettings && fromSettings.toLowerCase() !== "usuario") return fromSettings;

  const email = String(profile?.email ?? "").trim();
  const fromEmail = email.includes("@") ? email.split("@")[0].trim() : "";
  if (fromEmail) return fromEmail;

  return fallback;
}
