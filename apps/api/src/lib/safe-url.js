import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

function isPrivateIp(host) {
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const parts = host.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (ipVersion === 6) {
    const h = host.toLowerCase();
    if (h === "::1") return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true;
    if (h.startsWith("fe80")) return true;
  }
  return false;
}

/** Valida URL http(s) pública para fetch server-side (anti-SSRF). */
export function assertPublicHttpUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("URL inválida.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Solo se permiten URLs http(s).");
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost")) {
    throw new Error("URL no permitida.");
  }
  if (isPrivateIp(host)) {
    throw new Error("URL no permitida.");
  }
  return parsed;
}
