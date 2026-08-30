import { getSupabaseUrl } from "./config.js";

function readNodeEnv(key) {
  return typeof process !== "undefined" ? process.env[key] : undefined;
}

function sanitizeUrl(raw) {
  if (!raw) return "";
  let value = String(raw).trim();
  value = value.replace(/^SUPABASE_PUBLIC_URL\s*=\s*/i, "");
  const lines = value.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    const httpLine = lines.find((line) => /^https?:\/\//i.test(line));
    value = httpLine ?? lines[lines.length - 1];
  }
  return value.trim().replace(/\/+$/, "");
}

/** Host público que el navegador puede resolver (≠ loopback Kong en VPS). */
export function getSupabasePublicUrl() {
  const raw =
    readNodeEnv("SUPABASE_PUBLIC_URL") ??
    readNodeEnv("VITE_SUPABASE_URL") ??
    readNodeEnv("NEXT_PUBLIC_SUPABASE_URL") ??
    "";
  const url = sanitizeUrl(raw);
  return url || getSupabaseUrl();
}

/** URL pública de objeto en bucket Storage (persistida en DB / mostrada en UI). */
export function buildPublicStorageUrl(bucket, objectPath) {
  const base = getSupabasePublicUrl();
  const path = String(objectPath || "").replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

function isRewritableStoragePath(pathname) {
  return /\/storage\/v1\/object\//i.test(String(pathname || ""));
}

/** Reescribe loopback/Kong al host público; idempotente si ya es público. */
export function rewriteSupabasePublicUrl(url) {
  if (url == null || url === "") return url;
  const trimmed = String(url).trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (!isRewritableStoragePath(parsed.pathname)) return trimmed;
    const publicOrigin = new URL(getSupabasePublicUrl()).origin;
    if (parsed.origin === publicOrigin) return trimmed;
    return `${publicOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmed;
  }
}

export function rewriteBrandingLogoFields(record) {
  if (!record || typeof record !== "object") return record;
  const next = { ...record };
  if ("logo_url" in next) next.logo_url = rewriteSupabasePublicUrl(next.logo_url);
  if ("logo_icono_url" in next) next.logo_icono_url = rewriteSupabasePublicUrl(next.logo_icono_url);
  if (next.empresas && typeof next.empresas === "object" && !Array.isArray(next.empresas)) {
    next.empresas = rewriteBrandingLogoFields(next.empresas);
  }
  return next;
}

export function rewriteBrandingLogoList(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => rewriteBrandingLogoFields(row));
}
