import { ServiceError } from "../lib/service-error.js";
import { getCurrentMembership, listPremiumFeatures } from "./membership-service.js";
import { resolveUserPermissions } from "@salesapp/shared/auth/resolve-permissions.js";
import { resolveSessionFlags } from "./flags-service.js";
import * as workspaceService from "./workspace-service.js";
import { resolveSalaSessionPermissionKeys } from "../lib/workspace-permission-rpc.js";

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
 * - Sala: solo effective_workspace_permissions. Si el RPC falla → keys [] + unavailable
 *   (nunca profiles.role_id ni resolve_user_permission_keys).
 * - Personal / plataforma: profiles.role_id + overrides globales aditivos.
 * Superadmin de plataforma sigue usando el perfil global (justificado: no es tenant de sala).
 */
async function resolveSessionPermissionKeys(supabase, userId, profile, workspaceActivo) {
  if (profile?.is_super_admin === true && profile?.role === "admin") {
    return {
      keys: [...resolveUserPermissions({
        is_super_admin: true,
        role: "admin",
      })],
      status: "ok",
    };
  }

  const isSala = workspaceActivo?.tipo === "sala_de_venta" && workspaceActivo?.id;
  if (isSala) {
    return resolveSalaSessionPermissionKeys(supabase, userId, workspaceActivo.id);
  }

  // Workspace personal o sin sala: rol de plataforma en profiles.
  const rolePermissionKeys = await loadRolePermissionKeys(supabase, profile?.role_id);
  const { data: ovRows } = await supabase
    .from("usuario_permisos_override")
    .select("otorgado, permisos(clave)")
    .eq("usuario_id", userId);
  const overrides = (ovRows ?? [])
    .map((r) => ({ clave: r.permisos?.clave, otorgado: r.otorgado === true }))
    .filter((o) => o.clave);

  return {
    keys: [...resolveUserPermissions({
      is_super_admin: profile?.is_super_admin === true,
      role: profile?.role,
      role_permission_keys: rolePermissionKeys.length ? rolePermissionKeys : undefined,
      overrides,
      admin_permissions: profile?.admin_permissions ?? [],
      user_permissions: profile?.user_permissions ?? [],
    })],
    status: "ok",
  };
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

  let permissionKeys = [];
  let permissionsStatus = "ok";
  try {
    const resolved = await resolveSessionPermissionKeys(supabase, userId, profile, workspaceActivo);
    permissionKeys = Array.isArray(resolved.keys) ? resolved.keys : [];
    permissionsStatus = resolved.status || "ok";
  } catch {
    const isSala = workspaceActivo?.tipo === "sala_de_venta" && workspaceActivo?.id;
    if (isSala) {
      permissionKeys = [];
      permissionsStatus = "unavailable";
    } else {
      permissionKeys = [...resolveUserPermissions({
        is_super_admin: profile?.is_super_admin === true,
        role: profile?.role,
        admin_permissions: profile?.admin_permissions ?? [],
        user_permissions: profile?.user_permissions ?? [],
      })];
      permissionsStatus = "ok";
    }
  }

  let flags = {};
  let flagsStatus = "ok";
  try {
    const resolved = await resolveSessionFlags(supabase, userId, workspaceActivoId, {
      tipo: workspaceActivo?.tipo || null,
      isSuperAdmin: profile?.is_super_admin === true && profile?.role === "admin",
    });
    flags = resolved?.flags && typeof resolved.flags === "object" ? resolved.flags : {};
    flagsStatus = resolved?.status || "ok";
  } catch {
    const isSala = workspaceActivo?.tipo === "sala_de_venta" && workspaceActivo?.id;
    flags = {};
    flagsStatus = isSala ? "unavailable" : "ok";
  }

  const enriched = profile
    ? {
        ...profile,
        plan: membership.plan,
        membership_status: membership.status,
        membership_fecha_inicio: membership.fecha_inicio,
        membership_fecha_proximo_cobro: membership.fecha_proximo_cobro,
        permission_keys: permissionKeys,
        permissions_status: permissionsStatus,
        flags,
        flags_status: flagsStatus,
        workspace_activo_id: workspaceActivoId,
      }
    : null;

  return {
    user: user ? { id: user.id, email: user.email } : null,
    profile: enriched,
    membership,
    premiumFeatures,
    permission_keys: permissionKeys,
    permissions_status: permissionsStatus,
    flags,
    flags_status: flagsStatus,
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
