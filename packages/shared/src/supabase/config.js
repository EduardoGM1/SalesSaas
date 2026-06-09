function readEnv() {
  const nodeEnv = typeof process !== "undefined" ? process.env : {};
  const metaEnv =
    typeof import.meta !== "undefined"
      ? (import.meta).env ?? {}
      : {};
  return { nodeEnv, metaEnv };
}

function pickSupabaseUrl() {
  const { nodeEnv, metaEnv } = readEnv();
  return (
    nodeEnv.SUPABASE_URL ??
    nodeEnv.NEXT_PUBLIC_SUPABASE_URL ??
    nodeEnv.VITE_SUPABASE_URL ??
    metaEnv.VITE_SUPABASE_URL ??
    metaEnv.NEXT_PUBLIC_SUPABASE_URL ??
    ""
  ).trim();
}

function pickSupabaseAnonKey() {
  const { nodeEnv, metaEnv } = readEnv();
  return (
    nodeEnv.SUPABASE_ANON_KEY ??
    nodeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    nodeEnv.VITE_SUPABASE_ANON_KEY ??
    metaEnv.VITE_SUPABASE_ANON_KEY ??
    metaEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  ).trim();
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
