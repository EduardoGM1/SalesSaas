/** Path relativo seguro para redirect post-login (evita open redirects). */
export function safeNextPath(value, fallback = "/") {
  if (!value || typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
