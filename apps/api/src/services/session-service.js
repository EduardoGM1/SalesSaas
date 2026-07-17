import { ServiceError } from "../lib/service-error.js";
import { getCurrentMembership, listPremiumFeatures } from "./membership-service.js";
import { resolveUserPermissions } from "@salesapp/shared/auth/resolve-permissions.js";
import { VENDEDOR_DEFAULT_PERMISSIONS } from "@salesapp/shared/auth/permission-catalog.js";

export async function getSession(supabase, userId) {
  const { data: { user } } = await supabase.auth.getUser();
  let profile = null;
  {
    const withRoleId = await supabase
      .from("profiles")
      .select("id, email, full_name, role, phone, avatar_url, settings, is_super_admin, admin_permissions, user_permissions, role_id")
      .eq("id", userId)
      .single();
    if (!withRoleId.error) {
      profile = withRoleId.data;
    } else {
      const legacy = await supabase
        .from("profiles")
        .select("id, email, full_name, role, phone, avatar_url, settings, is_super_admin, admin_permissions, user_permissions")
        .eq("id", userId)
        .single();
      profile = legacy.data ?? null;
    }
  }

  let membership = {
    plan: "basico",
    status: "activa",
    fecha_inicio: null,
    fecha_proximo_cobro: null,
  };
  let premiumFeatures = [];
  try {
    membership = await getCurrentMembership(supabase, userId);
    premiumFeatures = await listPremiumFeatures(supabase);
  } catch {
    // Si la migración aún no está aplicada, no tumbar la sesión.
  }

  let permissionKeys = [...VENDEDOR_DEFAULT_PERMISSIONS];
  try {
    let rolePermissionKeys = [];
    if (profile?.role_id) {
      const { data: rp } = await supabase
        .from("rol_permisos")
        .select("permisos(clave)")
        .eq("rol_id", profile.role_id);
      rolePermissionKeys = (rp ?? []).map((r) => r.permisos?.clave).filter(Boolean);
    }
    const { data: ovRows } = await supabase
      .from("usuario_permisos_override")
      .select("otorgado, permisos(clave)")
      .eq("usuario_id", userId);
    const overrides = (ovRows ?? []).map((r) => ({
      clave: r.permisos?.clave,
      otorgado: r.otorgado === true,
    })).filter((o) => o.clave);

    permissionKeys = [...resolveUserPermissions({
      is_super_admin: profile?.is_super_admin === true,
      role: profile?.role,
      role_permission_keys: rolePermissionKeys.length ? rolePermissionKeys : undefined,
      overrides,
      admin_permissions: profile?.admin_permissions ?? [],
      user_permissions: profile?.user_permissions ?? [],
    })];
  } catch {
    // Migración 0041 no aplicada: defaults de vendedor + legacy arrays.
    permissionKeys = [...resolveUserPermissions({
      is_super_admin: profile?.is_super_admin === true,
      role: profile?.role,
      admin_permissions: profile?.admin_permissions ?? [],
      user_permissions: profile?.user_permissions ?? [],
    })];
  }

  const enriched = profile
    ? {
        ...profile,
        plan: membership.plan,
        membership_status: membership.status,
        membership_fecha_inicio: membership.fecha_inicio,
        membership_fecha_proximo_cobro: membership.fecha_proximo_cobro,
        permission_keys: permissionKeys,
      }
    : null;

  return {
    user: user ? { id: user.id, email: user.email } : null,
    profile: enriched,
    membership,
    premiumFeatures,
    permission_keys: permissionKeys,
  };
}

export async function getRealtimeSession(supabase) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw new ServiceError(error.message, 500);
  if (!session?.access_token) throw new ServiceError("Sin sesión activa.", 401);
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  };
}
