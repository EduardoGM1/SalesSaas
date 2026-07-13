import { clientDisplayName } from "@/lib/clients";
import { shortDate } from "@/lib/format/dates";
import { statusLabel } from "@/lib/format/status";

function dash(value) {
  const s = String(value ?? "").trim();
  return s || "—";
}

function locationLine(client) {
  return [client?.city, client?.country].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
}

function tourLine(client) {
  if (!client?.tipo_tour) return "";
  const quant = client.tour_cuantificable !== false ? "1" : "0";
  return `${client.tipo_tour} - ${quant}`;
}

function dateLine(client, lang) {
  const raw = client?.tourDate || client?.createdYmd || "";
  if (!raw) return "";
  try {
    return shortDate(raw, lang === "en" ? "en" : "es");
  } catch {
    return raw;
  }
}

export function buildExternalShareUrl(origin, prospectId, inviteToken) {
  const base = String(origin || "").replace(/\/$/, "");
  if (inviteToken) return `${base}/e/i/${encodeURIComponent(inviteToken)}`;
  return `${base}/e/${encodeURIComponent(prospectId)}`;
}

/**
 * Mensaje externo (WhatsApp / Web Share) con subset seguro de campos.
 * No incluye teléfono, email, notas, montos ni herramientas.
 */
export function buildExternalShareMessage({ client, origin, t, lang = "es", inviteToken, permissionLabel }) {
  const name = clientDisplayName(client) || client?.name || "—";
  const url = buildExternalShareUrl(origin, client?.id, inviteToken);
  const lines = [
    t("network.shareExternal.intro"),
    "",
    `👤 ${t("network.shareExternal.name")}: ${dash(name)}`,
    `🆔 ${t("network.shareExternal.code")}: ${dash(client?.prospectCode)}`,
    `🗺️ ${t("network.shareExternal.tour")}: ${dash(tourLine(client))}`,
    `📅 ${t("network.shareExternal.date")}: ${dash(dateLine(client, lang))}`,
    `📍 ${t("network.shareExternal.location")}: ${dash(locationLine(client))}`,
    `📌 ${t("network.shareExternal.status")}: ${dash(statusLabel(client?.status, lang === "en" ? "en" : "es"))}`,
  ];
  if (permissionLabel) {
    lines.push(`🔓 ${t("network.shareExternal.access")}: ${permissionLabel}`);
  }
  lines.push("", t("network.shareExternal.linkLabel"), url);
  return lines.join("\n");
}

export function canUseWebShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * Abre share sheet nativo si existe; si no, WhatsApp Web (wa.me).
 * @returns {"shared"|"whatsapp"|"cancelled"|"error"}
 */
export async function shareExternally({ text, title }) {
  if (canUseWebShare()) {
    try {
      await navigator.share({ title: title || "Saletse", text });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
      // Si el share nativo falla, caer a WhatsApp.
    }
  }
  const href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const win = window.open(href, "_blank", "noopener,noreferrer");
  if (!win) {
    window.location.href = href;
  }
  return "whatsapp";
}
