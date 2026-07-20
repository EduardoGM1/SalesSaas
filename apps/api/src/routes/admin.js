import { Router } from "express";
import { authenticateApi } from "../middleware/auth.js";
import { requireApiAdmin } from "../middleware/admin-auth.js";
import { apiError, json } from "../lib/http.js";
import {
  canViewUserFinancialMetrics,
  effectivePermissions,
  hasAnyAdminAccess,
  hasAnyAdminNavPermission,
  isSuperAdmin,
} from "@salesapp/shared/auth/permissions.js";
import { parseAdminFilters, parseUserAdminFilters } from "../lib/admin/filters.js";
import { toCsv } from "../lib/admin/csv.js";
import {
  getOverview,
  getUsers,
  getGoals,
  getSellerOptions,
  getToolsUsage,
} from "../lib/admin/data.js";
import { parseJsonBody, runService } from "./route-utils.js";
import * as adminUsersService from "../services/admin-users-service.js";
import * as supportService from "../services/support-service.js";
import * as membershipService from "../services/membership-service.js";
import * as rolesService from "../services/roles-service.js";
import * as adminAuditService from "../services/admin-audit-service.js";

const router = Router();

async function adminAuth(req, res, perm) {
  const base = await authenticateApi(req, res);
  if (!base.ok) {
    apiError(res, base.message, base.status);
    return null;
  }
  const a = await requireApiAdmin(base, perm);
  if (!a.ok) {
    apiError(res, a.message, a.status);
    return null;
  }
  return a;
}

/** Roles CRUD / role_id: solo Superadmin. */
async function requireSuperAdminApi(req, res) {
  const base = await authenticateApi(req, res);
  if (!base.ok) {
    apiError(res, base.message, base.status);
    return null;
  }
  const { data: profile } = await base.supabase
    .from("profiles")
    .select("id, role, is_super_admin, admin_permissions")
    .eq("id", base.userId)
    .single();
  if (!profile || !isSuperAdmin(profile)) {
    apiError(res, "No autorizado.", 403);
    return null;
  }
  return { ...base, profile };
}

router.get("/me", async (req, res) => {
  const base = await authenticateApi(req, res);
  if (!base.ok) return apiError(res, base.message, base.status);
  const { data: profile, error } = await base.supabase
    .from("profiles")
    .select("id, role, is_super_admin, admin_permissions, role_id, user_permissions")
    .eq("id", base.userId)
    .single();
  if (error || !profile || profile.role !== "admin") {
    return apiError(res, "No autorizado.", 403);
  }
  const adminProfile = {
    id: profile.id,
    role: profile.role,
    is_super_admin: profile.is_super_admin ?? false,
    admin_permissions: profile.admin_permissions ?? [],
  };
  // Preferir keys del rol (catálogo nuevo); fallback a admin_permissions legacy.
  let permissionKeys = effectivePermissions(adminProfile);
  try {
    const ctx = await rolesService.loadUserPermissionContext(base.supabase, base.userId);
    if (ctx?.permission_keys?.length) permissionKeys = ctx.permission_keys;
  } catch {
    // fallback legacy
  }
  if (isSuperAdmin(adminProfile)) {
    for (const k of [
      "admin:roles",
      "ver_logs_administracion",
      "ver_metricas_financieras_usuarios",
      "ver_tickets_soporte",
      "responder_tickets_soporte",
    ]) {
      if (!permissionKeys.includes(k)) permissionKeys = [...permissionKeys, k];
    }
  }
  // Expandir legacy support:read para nav/gates
  if (permissionKeys.includes("support:read")) {
    for (const k of ["ver_tickets_soporte", "responder_tickets_soporte"]) {
      if (!permissionKeys.includes(k)) permissionKeys = [...permissionKeys, k];
    }
  }
  // Acceso: legacy admin_permissions O al menos una key de pestaña del rol.
  if (
    !isSuperAdmin(adminProfile)
    && !hasAnyAdminAccess(adminProfile)
    && !hasAnyAdminNavPermission(permissionKeys)
  ) {
    return apiError(res, "No autorizado.", 403);
  }
  json(res, {
    profile: { ...adminProfile, role_id: profile.role_id ?? null },
    permissions: permissionKeys,
    isSuperAdmin: isSuperAdmin(adminProfile),
    userId: base.userId,
  });
});

router.get("/roles", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  await runService(res, () => rolesService.listRoles(a.supabase, a.profile), { wrap: "data" });
});

router.get("/permissions-catalog", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  json(res, { data: await rolesService.listPermissionCatalog() });
});

router.post("/roles", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => rolesService.createRole(a.supabase, a.profile, body, a.userId), { wrap: "data" });
});

router.patch("/roles/:id", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => rolesService.updateRole(a.supabase, a.profile, req.params.id, body, a.userId), { wrap: "data" });
});

router.delete("/roles/:id", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  await runService(res, () => rolesService.deleteRole(a.supabase, a.profile, req.params.id, a.userId), { wrap: "data" });
});

router.patch("/users/:id/role-id", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const roleId = body.role_id ?? body.roleId;
  await runService(res, () => rolesService.setUserRoleId(a.supabase, a.profile, req.params.id, roleId, a.userId), { wrap: "data" });
});

router.get("/logs", async (req, res) => {
  const a = await adminAuth(req, res, "ver_logs_administracion");
  if (!a) return;
  const filters = {
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
    actorId: typeof req.query.actor === "string" ? req.query.actor : undefined,
    accion: typeof req.query.accion === "string" ? req.query.accion : undefined,
    limit: req.query.limit,
    offset: req.query.offset,
  };
  await runService(res, () => adminAuditService.listAdminLogs(a.supabase, a.profile, filters), { wrap: "data" });
});

router.get("/export/logs", async (req, res) => {
  const a = await adminAuth(req, res, "ver_logs_administracion");
  if (!a) return;
  try {
    const filters = {
      from: typeof req.query.from === "string" ? req.query.from : undefined,
      to: typeof req.query.to === "string" ? req.query.to : undefined,
      actorId: typeof req.query.actor === "string" ? req.query.actor : undefined,
      accion: typeof req.query.accion === "string" ? req.query.accion : undefined,
    };
    const csv = await adminAuditService.exportAdminLogsCsv(a.supabase, a.profile, filters);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="logs-administracion.csv"');
    res.send(csv);
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al exportar.", 500);
  }
});

router.get("/users/:id/permission-context", async (req, res) => {
  const a = await adminAuth(req, res, "users:read");
  if (!a) return;
  await runService(res, () => rolesService.loadUserPermissionContext(a.supabase, req.params.id), { wrap: "data" });
});

router.get("/overview", async (req, res) => {
  const a = await adminAuth(req, res, "dashboard:read");
  if (!a) return;
  try {
    const data = await getOverview(a.supabase);
    json(res, { data });
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al cargar resumen.", 500);
  }
});

router.get("/sellers", async (req, res) => {
  const base = await authenticateApi(req, res);
  if (!base.ok) return apiError(res, base.message, base.status);
  const a = await requireApiAdmin(base, "dashboard:read");
  if (a.ok) {
    const data = await getSellerOptions(a.supabase);
    return json(res, { data });
  }
  for (const perm of ["goals:read", "tools:analytics", "users:read", "ver_logs_administracion"]) {
    const alt = await requireApiAdmin(base, perm);
    if (alt.ok) {
      const data = await getSellerOptions(alt.supabase);
      return json(res, { data });
    }
  }
  return apiError(res, a.message || "No autorizado.", a.status || 403);
});

router.get("/users", async (req, res) => {
  const a = await adminAuth(req, res, "users:read");
  if (!a) return;
  try {
    const filters = parseUserAdminFilters(req.query);
    const includeMetrics = canViewUserFinancialMetrics({
      isSuperAdmin: a.isSuperAdmin === true,
      permissions: a.permissions || [],
    });
    const data = await getUsers(a.supabase, filters, { includeMetrics });
    json(res, { data });
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al cargar usuarios.", 500);
  }
});

router.get("/goals", async (req, res) => {
  const a = await adminAuth(req, res, "goals:read");
  if (!a) return;
  const filters = parseAdminFilters(req.query);
  const data = await getGoals(a.supabase, filters);
  json(res, { data });
});

router.get("/tools-usage", async (req, res) => {
  const a = await adminAuth(req, res, "tools:analytics");
  if (!a) return;
  try {
    const filters = parseAdminFilters(req.query);
    const data = await getToolsUsage(a.supabase, filters);
    json(res, { data });
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al cargar uso de herramientas.", 500);
  }
});

router.get("/export/users", async (req, res) => {
  const a = await adminAuth(req, res, "users:export");
  if (!a) return;
  try {
    const filters = parseUserAdminFilters(req.query);
    const includeMetrics = canViewUserFinancialMetrics({
      isSuperAdmin: a.isSuperAdmin === true,
      permissions: a.permissions || [],
    });
    const users = await getUsers(a.supabase, filters, { includeMetrics });
    const ROLE_LABEL = { vendedor: "Vendedor", gerente: "Gerente", admin: "Admin" };
    const headers = includeMetrics
      ? ["Nombre", "Correo", "Rol", "Estado", "Expedientes", "Ventas", "Volumen", "Alta"]
      : ["Nombre", "Correo", "Rol", "Estado", "Alta"];
    const csv = toCsv(
      headers,
      users.map((u) => {
        const base = [
          u.name,
          u.email,
          ROLE_LABEL[u.role] ?? u.role,
          u.is_active ? "Activa" : "Desactivada",
        ];
        if (includeMetrics) base.push(u.prospects, u.sales, u.volume);
        base.push(u.created_at ? String(u.created_at).slice(0, 10) : "");
        return base;
      }),
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="usuarios-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al exportar.", 500);
  }
});

router.patch("/users/:id/role", async (req, res) => {
  const a = await adminAuth(req, res, "users:role");
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const role = typeof body.role === "string" ? body.role : "";
  await runService(res, () => adminUsersService.updateUserRole(a.supabase, req.params.id, role, a.userId), { wrap: "data" });
});

router.patch("/users/:id/status", async (req, res) => {
  const base = await authenticateApi(req, res);
  if (!base.ok) return apiError(res, base.message, base.status);
  const body = parseJsonBody(req, res);
  if (!body) return;
  const isActive = body.is_active ?? body.isActive;
  const perm = isActive ? "users:activate" : "users:deactivate";
  const a = await requireApiAdmin(base, perm);
  if (!a.ok) return apiError(res, a.message, a.status);
  await runService(res, () => adminUsersService.updateUserStatus(a.supabase, req.params.id, isActive, a.userId), { wrap: "data" });
});

router.patch("/users/:id/permissions", async (req, res) => {
  const a = await adminAuth(req, res, "users:permissions");
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const raw = Array.isArray(body.permissions) ? body.permissions : [];
  await runService(res, () => adminUsersService.updateUserPermissions(a.supabase, a.profile, req.params.id, raw, a.userId), { wrap: "data" });
});

router.patch("/users/:id/features", async (req, res) => {
  const a = await adminAuth(req, res, "users:permissions");
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const raw = Array.isArray(body.features) ? body.features : Array.isArray(body.permissions) ? body.permissions : [];
  await runService(res, () => adminUsersService.updateUserFeatures(a.supabase, a.profile, req.params.id, raw, a.userId), { wrap: "data" });
});

/** Asignar plan basico/pro (histórico de membresías). */
router.patch("/users/:id/membership", async (req, res) => {
  const a = await adminAuth(req, res, "users:role");
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const plan = body.plan ?? body.planNombre ?? body.nombre;
  await runService(
    res,
    () => membershipService.assignMembership(req.params.id, plan, { changedBy: a.userId }),
    { wrap: "data" },
  );
});

router.get("/support/requests", async (req, res) => {
  const a = await adminAuth(req, res, "ver_tickets_soporte");
  if (!a) return;
  const status = typeof req.query.status === "string" ? req.query.status : "all";
  const limit = req.query.limit;
  const offset = req.query.offset;
  await runService(
    res,
    () => supportService.listSupportRequestsForAdmin(a.supabase, { status, limit, offset }),
    { wrap: "data" },
  );
});

router.patch("/support/requests/:id", async (req, res) => {
  const a = await adminAuth(req, res, "ver_tickets_soporte");
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const status = body.status;
  await runService(
    res,
    () => supportService.updateSupportRequestStatus(a.supabase, req.params.id, status, a.userId),
    { wrap: "data" },
  );
});

router.get("/support/requests/:id/replies", async (req, res) => {
  const a = await adminAuth(req, res, "ver_tickets_soporte");
  if (!a) return;
  await runService(res, () => supportService.listSupportReplies(a.supabase, req.params.id), { wrap: "data" });
});

router.post("/support/requests/:id/replies", async (req, res) => {
  const a = await adminAuth(req, res, "responder_tickets_soporte");
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => supportService.replyToSupportRequest(a.supabase, req.params.id, {
      actorId: a.userId,
      cuerpo: body.cuerpo ?? body.body ?? body.reply,
    }),
    { wrap: "data" },
  );
});

export default router;
