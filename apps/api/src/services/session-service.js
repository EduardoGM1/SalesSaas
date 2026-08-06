import { ServiceError } from "../lib/service-error.js";
import { getCurrentMembership, listPremiumFeatures } from "./membership-service.js";
import { resolveUserPermissions } from "@salesapp/shared/auth/resolve-permissions.js";
import { VENDEDOR_DEFAULT_PERMISSIONS } from "@salesapp/shared/auth/permission-catalog.js";
import { resolveSessionFlags } from "./flags-service.js";
import * as workspaceService from "./workspace-service.js";

async function loadRolePermissionKeys(supabase, roleId) {
  if (!roleId) return [];
  const { data: rp } = await supabase
    .from("rol_permisos")
    .select("permisos(clave)")
    .eq("rol_id", roleId);
  return (rp ?? []).map((r) => r.permisos?.clave).filter(Boolean);
}

/**
 * Fuente única de permisos de sesión:
 * - Sala: workspace_miembros.role_id + overrides de sala (vía RPC o fallback)
 * - Personal / plataforma: profiles.role_id + overrides globales aditivos
 * Superadmin/Soporte (plataforma) siguen usando el perfil global.
 */
async function resolveSessionPermissionKeys(supabase, userId, profile, workspaceActivo) {
  if (profile?.is_super_admin === true && profile?.role === "admin") {
    return [...resolveUserPermissions({
      is_super_admin: true,
      role: "admin",
    })];
  }

  const isSala = workspaceActivo?.tipo === "sala_de_venta" && workspaceActivo?.id;
  if (isSala) {
    const { data: rpcKeys, error: rpcErr } = await supabase.rpc("effective_workspace_permissions", {
      p_usuario_id: userId,
      p_workspace_id: workspaceActivo.id,
    });
    if (!rpcErr && Array.isArray(rpcKeys)) {
      return rpcKeys;
    }

    const { data: membership } = await supabase
      .from("workspace_miembros")
      .select("role_id, rol_en_workspace")
      .eq("workspace_id", workspaceActivo.id)
      .eq("usuario_id", userId)
      .maybeSingle();

    let rolePermissionKeys = await loadRolePermissionKeys(supabase, membership?.role_id);
    if (!rolePermissionKeys.length && profile?.role_id) {
      rolePermissionKeys = await loadRolePermissionKeys(supabase, profile.role_id);
    }

    const { data: ovRows } = await supabase
      .from("workspace_usuario_permisos_override")
      .select("otorgado, permisos(clave)")
      .eq("workspace_id", workspaceActivo.id)
      .eq("usuario_id", userId);

    const overrides = (ovRows ?? [])
      .map((r) => ({ clave: r.permisos?.clave, otorgado: r.otorgado === true }))
      .filter((o) => o.clave);

    const resolved = resolveUserPermissions({
      is_super_admin: false,
      role: profile?.role,
      role_permission_keys: rolePermissionKeys.length ? rolePermissionKeys : undefined,
      overrides,
      admin_permissions: profile?.admin_permissions ?? [],
      user_permissions: profile?.user_permissions ?? [],
    });

    if (membership?.rol_en_workspace === "gerente") {
      for (const k of [
        "expedientes:ver_equipo",
        "ventas:ver_equipo",
        "dashboard:ver_equipo",
        "metas:ver_equipo",
      ]) {
        resolved.add(k);
      }
    }
    return [...resolved];
  }

  // Workspace personal o sin sala: rol de plataforma en profiles.
  let rolePermissionKeys = await loadRolePermissionKeys(supabase, profile?.role_id);
  const { data: ovRows } = await supabase
    .from("usuario_permisos_override")
    .select("otorgado, permisos(clave)")
    .eq("usuario_id", userId);
  const overrides = (ovRows ?? [])
    .map((r) => ({ clave: r.permisos?.clave, otorgado: r.otorgado === true }))
    .filter((o) => o.clave);

  return [...resolveUserPermissions({
    is_super_admin: profile?.is_super_admin === true,
    role: profile?.role,
    role_permission_keys: rolePermissionKeys.length ? rolePermissionKeys : undefined,
    overrides,
    admin_permissions: profile?.admin_permissions ?? [],
    user_permissions: profile?.user_permissions ?? [],
  })];
}

export async function getSession(supabase, userId) {
  const { data: { user } } = await supabase.auth.getUser();
  let profile = null;
  {
    const withRoleId = await supabase
      .from("profiles")
      .select("id, email, full_name, role, phone, avatar_url, settings, is_super_admin, admin_permissions, user_permissions, role_id, workspace_activo_id")
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

  let workspaces = [];
  let workspaceActivoId = null;
  let workspaceActivo = null;
  try {
    workspaces = await workspaceService.listUserWorkspaces(supabase, userId);
    workspaceActivoId = await workspaceService.resolveActiveWorkspaceId(
      supabase,
      userId,
      profile?.workspace_activo_id,
    );
    workspaceActivo = workspaces.find((w) => w.id === workspaceActivoId) || null;
    if (workspaceActivoId && profile?.workspace_activo_id !== workspaceActivoId) {
      await workspaceService.setActiveWorkspace(supabase, userId, workspaceActivoId);
    }
  } catch {
    workspaces = [];
    workspaceActivoId = null;
    workspaceActivo = null;
  }

  let permissionKeys = [...VENDEDOR_DEFAULT_PERMISSIONS];
  try {
    permissionKeys = await resolveSessionPermissionKeys(supabase, userId, profile, workspaceActivo);
  } catch {
    permissionKeys = [...resolveUserPermissions({
      is_super_admin: profile?.is_super_admin === true,
      role: profile?.role,
      admin_permissions: profile?.admin_permissions ?? [],
      user_permissions: profile?.user_permissions ?? [],
    })];
  }

  let flags = {};
  try {
    // Tenant-aware: estándar + custom de la empresa del workspace activo (nunca otros tenants).
    flags = await resolveSessionFlags(supabase, userId, workspaceActivoId);
  } catch {
    flags = {};
  }

  const enriched = profile
    ? {
        ...profile,
        plan: membership.plan,
        membership_status: membership.status,
        membership_fecha_inicio: membership.fecha_inicio,
        membership_fecha_proximo_cobro: membership.fecha_proximo_cobro,
        permission_keys: permissionKeys,
        flags,
        workspace_activo_id: workspaceActivoId,
      }
    : null;

  return {
    user: user ? { id: user.id, email: user.email } : null,
    profile: enriched,
    membership,
    premiumFeatures,
    permission_keys: permissionKeys,
    flags,
    workspaces,
    workspace_activo_id: workspaceActivoId,
    workspace_activo: workspaceActivo,
  };
}

export async function switchWorkspace(supabase, userId, workspaceId) {
  await workspaceService.setActiveWorkspace(supabase, userId, workspaceId);
  return getSession(supabase, userId);
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
