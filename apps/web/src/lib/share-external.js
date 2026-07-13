import { clientDisplayName } from "@/lib/clients";
import { buildShareTemplates } from "@/lib/share-message-templates.js";

export function buildExternalShareUrl(origin, inviteToken) {
  const base = String(origin || "").replace(/\/$/, "");
  return `${base}/share/${encodeURIComponent(inviteToken)}`;
}

/**
 * Mensaje externo bilingüe (plantilla de producto).
 */
export function buildExternalShareMessage({
  client,
  origin,
  lang = "es",
  inviteToken,
  sharerName,
}) {
  const url = buildExternalShareUrl(origin, inviteToken);
  const { subject, body } = buildShareTemplates({
    lang: lang === "en" ? "en" : "es",
    sharerName: sharerName || "Saletse",
    clientName: clientDisplayName(client) || client?.name,
    url,
  });
  return { subject, text: body, url };
}

export function canUseWebShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * Abre share sheet nativo si existe; si no, WhatsApp Web (wa.me).
 */
export async function shareExternally({ text, title }) {
  if (canUseWebShare()) {
    try {
      await navigator.share({ title: title || "Saletse", text });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
    }
  }
  const href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const win = window.open(href, "_blank", "noopener,noreferrer");
  if (!win) {
    window.location.href = href;
  }
  return "whatsapp";
}
