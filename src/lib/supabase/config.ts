export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Indica si Supabase está configurado vía variables de entorno.
 * Mientras sea false, la app sigue funcionando con almacenamiento local
 * (sin autenticación ni sincronización en la nube).
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
