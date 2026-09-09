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

const MAX_REDIRECTS = 3;

/**
 * `fetch` que sigue redirecciones manualmente revalidando cada `Location`
 * con `assertPublicHttpUrl` (un host público puede redirigir a la red interna).
 * @param {string} rawUrl
 * @param {RequestInit} [init]
 */
export async function fetchPublicUrl(rawUrl, init = {}) {
  let current = assertPublicHttpUrl(rawUrl).href;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(res.status)) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    if (hop === MAX_REDIRECTS) throw new Error("Demasiadas redirecciones.");
    current = assertPublicHttpUrl(new URL(location, current).href).href;
  }
  throw new Error("Demasiadas redirecciones.");
}
