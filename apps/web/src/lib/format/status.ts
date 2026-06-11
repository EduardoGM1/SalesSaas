import { statusLabelKey, t } from "@/lib/i18n.js";

export function statusLabel(s: string | undefined, lang: "es" | "en" = "es"): string {
  const key = statusLabelKey(s || "");
  if (key) return t(key, lang);
  return s || t("status.empty", lang);
}

export function statusClass(s: string | undefined): string {
  return String(s || "").replace(/[^a-z0-9-]/g, "-");
}
