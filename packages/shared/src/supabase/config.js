function readEnv() {
  const nodeEnv = typeof process !== "undefined" ? process.env : {};
  const metaEnv =
    typeof import.meta !== "undefined"
      ? (import.meta).env ?? {}
      : {};
  return { nodeEnv, metaEnv };
}

function sanitizeEnvValue(raw, { url = false } = {}) {
  if (!raw) return "";
  let value = String(raw).trim();
  value = value.replace(/^(SUPABASE_URL|NEXT_PUBLIC_SUPABASE_URL|VITE_SUPABASE_URL)\s*=\s*/i, "");
  value = value.replace(/^(SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY|VITE_SUPABASE_ANON_KEY)\s*=\s*/i, "");

  const lines = value.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    if (url) {
      const httpLine = lines.find((line) => /^https?:\/\//i.test(line));
      if (httpLine) value = httpLine;
      else value = lines[lines.length - 1];
    } else {
      const keyLine = lines.find((line) => /^(eyJ|sb_publishable_)/.test(line));
      value = keyLine ?? lines[lines.length - 1];
    }
  }

  value = value.trim();
  if (url) return value.replace(/\/+$/, "");
  return value;
}

function pickSupabaseUrl() {
  const { nodeEnv, metaEnv } = readEnv();
  const raw =
    nodeEnv.SUPABASE_URL ??
    nodeEnv.NEXT_PUBLIC_SUPABASE_URL ??
    nodeEnv.VITE_SUPABASE_URL ??
    metaEnv.VITE_SUPABASE_URL ??
    metaEnv.NEXT_PUBLIC_SUPABASE_URL ??
    "";
  return sanitizeEnvValue(raw, { url: true });
}

function pickSupabaseAnonKey() {
  const { nodeEnv, metaEnv } = readEnv();
  const raw =
    nodeEnv.SUPABASE_ANON_KEY ??
    nodeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    nodeEnv.VITE_SUPABASE_ANON_KEY ??
    metaEnv.VITE_SUPABASE_ANON_KEY ??
    metaEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return sanitizeEnvValue(raw);
}

/** @deprecated Usa getSupabaseUrl() para leer env en tiempo de ejecución (serverless). */
export const SUPABASE_URL = pickSupabaseUrl();

/** @deprecated Usa getSupabaseAnonKey() para leer env en tiempo de ejecución (serverless). */
export const SUPABASE_ANON_KEY = pickSupabaseAnonKey();

export function getSupabaseUrl() {
  return pickSupabaseUrl();
}

export function getSupabaseAnonKey() {
  return pickSupabaseAnonKey();
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}
