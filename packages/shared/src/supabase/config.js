function readEnv() {
  const nodeEnv = typeof process !== "undefined" ? process.env : {};
  const metaEnv =
    typeof import.meta !== "undefined"
      ? (import.meta).env ?? {}
      : {};
  return { nodeEnv, metaEnv };
}

export const SUPABASE_URL = (() => {
  const { nodeEnv, metaEnv } = readEnv();
  return (
    metaEnv.VITE_SUPABASE_URL ??
    metaEnv.NEXT_PUBLIC_SUPABASE_URL ??
    nodeEnv.SUPABASE_URL ??
    nodeEnv.NEXT_PUBLIC_SUPABASE_URL ??
    ""
  );
})();

export const SUPABASE_ANON_KEY = (() => {
  const { nodeEnv, metaEnv } = readEnv();
  return (
    metaEnv.VITE_SUPABASE_ANON_KEY ??
    metaEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    nodeEnv.SUPABASE_ANON_KEY ??
    nodeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  );
})();

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
