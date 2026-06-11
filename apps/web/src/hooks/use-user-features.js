import { useEffect, useState } from "react";
import { hasUserFeature } from "@/lib/auth/user-features";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { watchSession } from "@/lib/session-api.js";

export function useUserFeatures() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setProfile(null);
      return;
    }
    return watchSession((session) => setProfile(session?.profile ?? null));
  }, []);

  const can = (key) => hasUserFeature(profile, key);

  return {
    profile,
    canViewSaleModal: can("sales:view_modal"),
    canViewSaleDetail: can("sales:view_detail"),
    canAccessSalesHistory: can("sales:history"),
  };
}
