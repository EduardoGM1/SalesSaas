"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getCachedRealtimeToken, primeRealtimeAuth } from "./realtime-auth";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

/** Cliente Supabase singleton para el navegador (una sola conexión Realtime). */
export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        params: { eventsPerSecond: 25 },
        accessToken: async () => {
          const cached = getCachedRealtimeToken();
          if (cached) return cached;
          if (!browserClient) return undefined;
          const { data: { session } } = await browserClient.auth.getSession();
          return session?.access_token;
        },
      },
    });
  }
  return browserClient;
}

export { primeRealtimeAuth };
