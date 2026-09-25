import { useEffect, useMemo, useRef, useState } from "react";
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
  getRhOpcHomeHref,
  getSidebarNavGroups,
} from "@/lib/nav-config.js";
import { warmAdminSession } from "@/hooks/use-admin-session.js";

export function useAppNav() {
  const mounted = useMounted();
  const settings = useDbStore((s) => s.db.settings, shallow);
  const cloudEnabled = mounted && isSupabaseConfigured();
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isGerenteSala, setIsGerenteSala] = useState(false);
  const [workspaceTipo, setWorkspaceTipo] = useState(null);
  const [roleSlug, setRoleSlug] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [sessionFlags, setSessionFlags] = useState({});
  const [bottomNavReady, setBottomNavReady] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(() => getUnreadMessagesCount());
  const adminCheckSeq = useRef(0);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setBottomNavReady(true);
      return undefined;
    }
    const stop = watchSession((session) => {
      const profile = session?.profile;
      const req = ++adminCheckSeq.current;
      if (!profile) {
        setIsAdmin(false);
        setAvatarUrl(null);
        setUserProfile(null);
        setIsGerenteSala(false);
        setWorkspaceTipo(null);
        setRoleSlug(null);
        setEmpresaId(null);
        setSessionFlags({});
        setBottomNavReady(false);
        return;
      }
      setUserProfile(profile);
      setAvatarUrl(profile.avatar_url ?? null);
      const platformAdmin = hasAnyAdminAccess({
        id: profile.id,
        role: profile.role ?? "user",
        is_super_admin: profile.is_super_admin === true,
        admin_permissions: Array.isArray(profile.admin_permissions) ? profile.admin_permissions : [],
      });
      // No marcar admin (ni pintar el menú) hasta que /admin/me responda.
      // Si ya había un resultado, se conserva hasta esta respuesta: un poll
      // no debe bajar isAdmin a false y mostrar el recorte de 3 iconos.
      fetch("/api/v1/admin/me", { credentials: "include" })
        .then(async (response) => (response.ok ? response.json() : null))
        .then((adminSession) => {
          if (req !== adminCheckSeq.current) return;
          if (adminSession?.userId === profile.id) {
            warmAdminSession(adminSession);
            setIsAdmin(true);
          } else {
            setIsAdmin(platformAdmin);
          }
        })
        .catch(() => {
          if (req !== adminCheckSeq.current) return;
          setIsAdmin(platformAdmin);
        })
        .finally(() => {
          if (req !== adminCheckSeq.current) return;
          setBottomNavReady(true);
        });
      const ws = session?.workspace_activo;
      const tipo = ws?.tipo || "personal";
      setWorkspaceTipo(tipo);
      setIsGerenteSala(tipo === "sala_de_venta" && ws?.rol_en_workspace === "gerente");
      setRoleSlug(ws?.role_slug || null);
      setEmpresaId(ws?.empresa_id || null);
      const rawFlags = session?.flags ?? session?.profile?.flags;
      setSessionFlags(rawFlags && typeof rawFlags === "object" ? rawFlags : {});
    });
    return () => {
      adminCheckSeq.current += 1;
      stop();
    };
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
    isGerenteSala,
    workspaceTipo,
    roleSlug,
    empresaId,
    flags: sessionFlags,
    canFeature: (feature) => hasUserFeature(userProfile, feature),
  }), [cloudEnabled, isAdmin, isGerenteSala, workspaceTipo, roleSlug, empresaId, sessionFlags, userProfile]);

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

  const homeHref = useMemo(() => getRhOpcHomeHref(navOptions), [navOptions]);

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
    userProfile,
    unreadMessages,
    workspaceTipo,
    homeHref,
    sidebarGroups,
    mobileBottomItems,
    mobileHeaderItems,
    bottomNavReady,
  };
}
