import { useEffect, useMemo, useState } from "react";
import { useMounted } from "@/hooks/use-mounted";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { hasAnyAdminAccess } from "@/lib/auth/permissions";
import { hasUserFeature } from "@/lib/auth/user-features";
import { watchSession } from "@/lib/session-api.js";
import {
  getUnreadMessagesCount,
  refreshUnreadMessagesCount,
  subscribeUnreadMessages,
} from "@/lib/messages-unread.js";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";
import {
  getMobileBottomNavItems,
  getMobileHeaderNavItems,
  getSidebarNavGroups,
} from "@/lib/nav-config.js";

export function useAppNav() {
  const mounted = useMounted();
  const settings = useDbStore((s) => s.db.settings, shallow);
  const cloudEnabled = mounted && isSupabaseConfigured();
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState(() => getUnreadMessagesCount());

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    return watchSession((session) => {
      const profile = session?.profile;
      if (!profile) {
        setIsAdmin(false);
        setAvatarUrl(null);
        setUserProfile(null);
        return;
      }
      setUserProfile(profile);
      setAvatarUrl(profile.avatar_url ?? null);
      setIsAdmin(hasAnyAdminAccess({
        id: profile.id,
        role: profile.role ?? "user",
        is_super_admin: profile.is_super_admin === true,
        admin_permissions: Array.isArray(profile.admin_permissions) ? profile.admin_permissions : [],
      }));
    });
  }, []);

  useEffect(() => {
    if (!cloudEnabled) {
      setUnreadMessages(0);
      return undefined;
    }

    const unsub = subscribeUnreadMessages(setUnreadMessages);
    const load = () => {
      refreshUnreadMessagesCount().catch(() => {});
    };
    load();
    const onChanged = () => load();
    const onFocus = () => load();
    window.addEventListener("messages:unread-changed", onChanged);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = window.setInterval(load, 20000);
    return () => {
      unsub();
      window.clearInterval(timer);
      window.removeEventListener("messages:unread-changed", onChanged);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [cloudEnabled]);

  const navOptions = useMemo(() => ({
    cloudEnabled,
    isAdmin,
    canFeature: (feature) => hasUserFeature(userProfile, feature),
  }), [cloudEnabled, isAdmin, userProfile]);

  const sidebarGroups = useMemo(
    () => getSidebarNavGroups(navOptions),
    [navOptions],
  );

  const mobileBottomItems = useMemo(
    () => getMobileBottomNavItems(navOptions),
    [navOptions],
  );

  const mobileHeaderItems = useMemo(
    () => getMobileHeaderNavItems(navOptions),
    [navOptions],
  );

  const avatarLabel = mounted
    ? (settings?.userInitials
      || settings?.userName?.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")
      || "M").toUpperCase()
    : "M";

  return {
    mounted,
    cloudEnabled,
    isAdmin,
    avatarUrl,
    avatarLabel,
    unreadMessages,
    sidebarGroups,
    mobileBottomItems,
    mobileHeaderItems,
  };
}
