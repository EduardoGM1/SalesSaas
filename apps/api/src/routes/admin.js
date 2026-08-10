import { Router } from "express";
import { authenticateApi } from "../middleware/auth.js";
import { requireApiAdmin } from "../middleware/admin-auth.js";
import { apiError, json } from "../lib/http.js";
import {
  adminPermissionSetHas,
  effectivePermissions,
  expandAdminPermissionSet,
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
import { rateLimit } from "../middleware/rate-limit.js";
import * as adminUsersService from "../services/admin-users-service.js";
import * as supportService from "../services/support-service.js";
import * as membershipService from "../services/membership-service.js";
import * as rolesService from "../services/roles-service.js";
import * as adminAuditService from "../services/admin-audit-service.js";
import * as flagsService from "../services/flags-service.js";
import * as workspaceService from "../services/workspace-service.js";
import * as modulosCustomController from "../controllers/modulos-custom-controller.js";
import * as delegacionController from "../controllers/delegacion-controller.js";
import * as tenantRbacService from "../services/tenant-rbac-service.js";
import * as tenantAdminService from "../services/tenant-admin-service.js";
import * as royalHolidayService from "../services/royal-holiday-service.js";
import { requireEmpresaAdmin } from "../lib/tenant-access.js";

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
  const tenantContext = await tenantAdminService.getHierarchicalAdminContext(base.userId);
  const { data: profile, error } = await base.supabase
    .from("profiles")
    .select("id, role, is_super_admin, admin_permissions, role_id, user_permissions")
    .eq("id", base.userId)
    .single();
  if (error || !profile || (profile.role !== "admin" && !tenantContext)) {
    return apiError(res, "No autorizado.", 403);
  }
  const isPlatformAdmin = profile.role === "admin";
  const adminProfile = {
    id: profile.id,
    role: isPlatformAdmin || tenantContext ? "admin" : profile.role,
    is_super_admin: profile.is_super_admin ?? false,
    admin_permissions: profile.admin_permissions ?? [],
  };

  // Plataforma: rol ∪ overrides ∪ admin_permissions (nunca pisar con tenant).
  // Solo-tenant (empresa/sala sin role admin): permisos del alcance tenant.
  let permissionKeys = effectivePermissions(adminProfile);
  if (isPlatformAdmin) {
    try {
      const ctx = await rolesService.loadUserPermissionContext(base.supabase, base.userId);
      if (ctx?.permission_keys?.length) permissionKeys = ctx.permission_keys;
    } catch {
      // fallback legacy
    }
  } else if (tenantContext?.permissions?.length) {
    permissionKeys = tenantContext.permissions;
  }

  if (isSuperAdmin(adminProfile)) {
    for (const k of [
      "ver_resumen",
      "gestionar_usuarios",
      "ver_logs",
      "gestionar_metas",
      "ver_metricas",
      "gestionar_soporte",
      "gestionar_roles_permisos",
      "ver_metricas_financieras_usuarios",
      "usuarios.export_csv",
      "logs.export_csv",
      "metas.export_csv",
      "metricas.export_csv",
      "ventas.export_csv",
      "soporte.export_csv",
      "usuarios.cambiar_plan",
      "usuarios.desactivar_cuenta",
      "usuarios.gestionar_permisos",
    ]) {
      if (!permissionKeys.includes(k)) permissionKeys = [...permissionKeys, k];
    }
  }

  if (
    !isSuperAdmin(adminProfile)
    && !hasAnyAdminAccess(adminProfile)
    && !hasAnyAdminNavPermission(permissionKeys)
  ) {
    return apiError(res, "No autorizado.", 403);
  }

  // Admin de sistema siempre opera el panel de plataforma (aunque también sea gerente de sala).
  const scope = isPlatformAdmin ? "plataforma" : (tenantContext?.scope || "plataforma");

  json(res, {
    profile: { ...adminProfile, role_id: profile.role_id ?? null },
    permissions: permissionKeys,
    isSuperAdmin: isSuperAdmin(adminProfile),
    userId: base.userId,
    scope,
    empresaIds: tenantContext?.empresa_ids || [],
    workspaceIds: tenantContext?.workspace_ids || [],
  });
});

router.get("/roles", async (req, res) => {
  const a = await adminAuth(req, res, null);
  if (!a) return;
  const set = expandAdminPermissionSet(a.permissions);
  // Lista completa (permission_keys) solo Superadmin — RPC admin_list_roles lo exige.
  const canFull = a.isSuperAdmin === true;
  const canLite = canFull
    || adminPermissionSetHas(set, "gestionar_usuarios")
    || adminPermissionSetHas(set, "gestionar_roles_permisos");
  if (!canLite) return apiError(res, "No autorizado.", 403);
  await runService(
    res,
    () => rolesService.listRoles(a.supabase, a.profile, { full: canFull }),
    { wrap: "data" },
  );
});

async function tenantActor(req, res) {
  const base = await authenticateApi(req, res);
  if (!base.ok) {
    apiError(res, base.message, base.status);
    return null;
  }
  return base;
}

router.get("/tenant/context", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => tenantAdminService.getHierarchicalAdminContext(a.userId),
    { wrap: "data" },
  );
});

router.get("/tenant/empresas/:empresaId/overview", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => tenantAdminService.getEmpresaOverview(a.userId, req.params.empresaId),
    { wrap: "data" },
  );
});

router.patch("/tenant/empresas/:empresaId", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => tenantAdminService.updateScopedEmpresa(a.userId, req.params.empresaId, body),
    { wrap: "data" },
  );
});

router.post("/tenant/empresas/:empresaId/branding/logo", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => tenantAdminService.uploadScopedEmpresaLogo(
      a.userId,
      req.params.empresaId,
      body.data_url || body.dataUrl,
      body.slot,
    ),
    { wrap: "data" },
  );
});

// GET /tenant/empresas/:empresaId/users/search?q= — usuarios asignables (misma empresa o sin organización).
router.get(
  "/tenant/empresas/:empresaId/users/search",
  rateLimit({ name: "tenant-user-search", windowMs: 60_000, max: 30 }),
  async (req, res) => {
    const a = await tenantActor(req, res);
    if (!a) return;
    await runService(
      res,
      () => tenantAdminService.searchAssignableUsers(a.userId, req.params.empresaId, req.query.q),
      { wrap: "data" },
    );
  },
);

router.get("/tenant/empresas/:empresaId/admins", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => tenantAdminService.listEmpresaAdmins(a.userId, req.params.empresaId),
    { wrap: "data" },
  );
});

router.post("/tenant/empresas/:empresaId/admins", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => tenantAdminService.upsertEmpresaAdmin(a.userId, req.params.empresaId, body),
    { wrap: "data", successStatus: 201 },
  );
});

router.delete("/tenant/empresas/:empresaId/admins/:userId", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => tenantAdminService.removeEmpresaAdmin(
      a.userId,
      req.params.empresaId,
      req.params.userId,
    ),
    { wrap: "data" },
  );
});

router.get("/tenant/empresas/:empresaId/salas", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => tenantAdminService.listScopedSalas(a.userId, req.params.empresaId),
    { wrap: "data" },
  );
});

router.post("/tenant/empresas/:empresaId/salas", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => tenantAdminService.createScopedSala(a.userId, req.params.empresaId, body),
    { wrap: "data", successStatus: 201 },
  );
});

router.patch("/tenant/workspaces/:workspaceId/gerente", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => tenantAdminService.setScopedSalaGerente(
      a.userId,
      req.params.workspaceId,
      body.usuario_id ?? body.user_id,
    ),
    { wrap: "data" },
  );
});

router.post("/tenant/workspaces/:workspaceId/members", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => tenantAdminService.addScopedSalaMember(a.userId, req.params.workspaceId, body),
    { wrap: "data", successStatus: 201 },
  );
});

router.delete("/tenant/workspaces/:workspaceId/members/:userId", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => tenantAdminService.removeScopedSalaMember(
      a.userId,
      req.params.workspaceId,
      req.params.userId,
    ),
    { wrap: "data" },
  );
});

router.get("/tenant/workspaces/:workspaceId/overview", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => tenantAdminService.getSalaOverview(a.userId, req.params.workspaceId),
    { wrap: "data" },
  );
});

router.get("/tenant/empresas/:empresaId/roles", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => tenantRbacService.listTenantRoles(a.userId, req.params.empresaId),
    { wrap: "data" },
  );
});

router.post("/tenant/empresas/:empresaId/roles", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => tenantRbacService.createTenantRole(a.userId, req.params.empresaId, body),
    { wrap: "data", successStatus: 201 },
  );
});

router.patch("/tenant/empresas/:empresaId/roles/:roleId", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => tenantRbacService.updateTenantRole(
      a.userId,
      req.params.empresaId,
      req.params.roleId,
      body,
    ),
    { wrap: "data" },
  );
});

router.delete("/tenant/empresas/:empresaId/roles/:roleId", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => tenantRbacService.deleteTenantRole(
      a.userId,
      req.params.empresaId,
      req.params.roleId,
    ),
    { wrap: "data" },
  );
});

router.get("/tenant/empresas/:empresaId/packages", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => tenantRbacService.listAccessPackages(a.userId, req.params.empresaId),
    { wrap: "data" },
  );
});

router.get("/tenant/empresas/:empresaId/flags", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => tenantRbacService.listTenantFlagCatalog(a.userId, req.params.empresaId),
    { wrap: "data" },
  );
});

router.get("/tenant/empresas/:empresaId/catalogo-rh", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(res, async () => {
    const admin = await requireEmpresaAdmin(a.userId, req.params.empresaId);
    return royalHolidayService.getCatalogoVigente(admin, req.params.empresaId);
  }, { wrap: "data" });
});

router.post("/tenant/empresas/:empresaId/catalogo-rh/publish", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res) || {};
  await runService(res, async () => {
    const admin = await requireEmpresaAdmin(a.userId, req.params.empresaId);
    return royalHolidayService.publishNuevaVersion(admin, req.params.empresaId, a.userId, body);
  }, { wrap: "data", successStatus: 201 });
});

router.get("/tenant/empresas/:empresaId/modulos-custom", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => modulosCustomController.listarFlagsEmpresa(a, req.params.empresaId),
    { wrap: "data" },
  );
});

router.post("/tenant/empresas/:empresaId/modulos-custom", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => modulosCustomController.crearModuloCustom(a, req.params.empresaId, body),
    { wrap: "data", successStatus: 201 },
  );
});

router.patch("/tenant/empresas/:empresaId/modulos-custom/:moduloId", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => modulosCustomController.actualizarModuloCustom(a, req.params.empresaId, req.params.moduloId, body),
    { wrap: "data" },
  );
});

router.get("/tenant/empresas/:empresaId/modulos-custom/:moduloId/datos", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => modulosCustomController.listarDatosModulo(a, req.params.empresaId, req.params.moduloId, req.query),
    { wrap: "data" },
  );
});

router.put("/tenant/empresas/:empresaId/modulos-custom/:moduloId/datos", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => modulosCustomController.upsertDatosModulo(a, req.params.empresaId, req.params.moduloId, body),
    { wrap: "data" },
  );
});

router.get("/tenant/empresas/:empresaId/permissions", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => tenantRbacService.listTenantPermissionCatalog(a.userId, req.params.empresaId),
    { wrap: "data" },
  );
});

router.get("/tenant/empresas/:empresaId/delegacion/techo", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => delegacionController.listarTechoDelegacion(a, { empresa_id: req.params.empresaId }),
    { wrap: "data" },
  );
});

router.get("/tenant/empresas/:empresaId/delegacion", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => delegacionController.listarPermisosDelegados(a, {
      asistente_id: req.query.asistente_id,
      empresa_id: req.params.empresaId,
    }),
    { wrap: "data" },
  );
});

router.put("/tenant/empresas/:empresaId/delegacion", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => delegacionController.reemplazarPermisosDelegados(a, {
      ...body,
      empresa_id: req.params.empresaId,
      sala_id: null,
    }),
    { wrap: "data" },
  );
});

router.get("/tenant/empresas/:empresaId/gerentes/:gerenteId/acceso-cruzado", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => delegacionController.listarAccesoCruzado(a, req.params.empresaId, req.params.gerenteId),
    { wrap: "data" },
  );
});

router.put("/tenant/empresas/:empresaId/gerentes/:gerenteId/acceso-cruzado", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => delegacionController.fijarAccesoCruzado(a, req.params.empresaId, req.params.gerenteId, body),
    { wrap: "data" },
  );
});

router.post("/tenant/empresas/:empresaId/packages", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => tenantRbacService.createAccessPackage(a.userId, req.params.empresaId, body),
    { wrap: "data", successStatus: 201 },
  );
});

router.patch("/tenant/empresas/:empresaId/packages/:packageId", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => tenantRbacService.updateAccessPackage(
      a.userId,
      req.params.empresaId,
      req.params.packageId,
      body,
    ),
    { wrap: "data" },
  );
});

router.delete("/tenant/empresas/:empresaId/packages/:packageId", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  await runService(
    res,
    () => tenantRbacService.deleteAccessPackage(
      a.userId,
      req.params.empresaId,
      req.params.packageId,
    ),
    { wrap: "data" },
  );
});

router.patch("/tenant/workspaces/:workspaceId/members/:userId/role", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => tenantRbacService.assignWorkspaceRole(
      a.userId,
      req.params.workspaceId,
      req.params.userId,
      body.role_id ?? body.roleId,
    ),
    { wrap: "data" },
  );
});

router.patch("/tenant/empresas/:empresaId/members/:userId/role", async (req, res) => {
  const a = await tenantActor(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => tenantRbacService.assignEmpresaRole(
      a.userId,
      req.params.empresaId,
      req.params.userId,
      body.role_id ?? body.roleId,
    ),
    { wrap: "data" },
  );
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
  const a = await adminAuth(req, res, "ver_logs");
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
  const a = await adminAuth(req, res, "logs.export_csv");
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
  const a = await adminAuth(req, res, "gestionar_usuarios");
  if (!a) return;
  await runService(res, () => rolesService.loadUserPermissionContext(a.supabase, req.params.id), { wrap: "data" });
});

router.get("/overview", async (req, res) => {
  const a = await adminAuth(req, res, "ver_resumen");
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
  const a = await requireApiAdmin(base, "ver_resumen");
  if (a.ok) {
    const data = await getSellerOptions(a.supabase);
    return json(res, { data });
  }
  for (const perm of ["gestionar_metas", "ver_metricas", "gestionar_usuarios", "ver_logs"]) {
    const alt = await requireApiAdmin(base, perm);
    if (alt.ok) {
      const data = await getSellerOptions(alt.supabase);
      return json(res, { data });
    }
  }
  return apiError(res, a.message || "No autorizado.", a.status || 403);
});

router.get("/users", async (req, res) => {
  const a = await adminAuth(req, res, "gestionar_usuarios");
  if (!a) return;
  try {
    const filters = parseUserAdminFilters(req.query);
    const includeMetrics = false;
    const data = await getUsers(a.supabase, filters, { includeMetrics });
    json(res, { data });
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al cargar usuarios.", 500);
  }
});

router.get("/goals", async (req, res) => {
  const a = await adminAuth(req, res, "gestionar_metas");
  if (!a) return;
  const filters = parseAdminFilters(req.query);
  const data = await getGoals(a.supabase, filters);
  json(res, { data });
});

router.get("/tools-usage", async (req, res) => {
  const a = await adminAuth(req, res, "ver_metricas");
  if (!a) return;
  try {
    const filters = parseAdminFilters(req.query);
    const data = await getToolsUsage(a.supabase, filters);
    json(res, { data });
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al cargar uso de herramientas.", 500);
  }
});

router.get("/export/goals", async (req, res) => {
  const a = await adminAuth(req, res, "metas.export_csv");
  if (!a) return;
  try {
    const filters = parseAdminFilters(req.query);
    const goals = await getGoals(a.supabase, filters);
    const csv = toCsv(
      ["Vendedor", "Año", "Mes", "Volumen", "Tours", "Ventas", "Días", "Descansos"],
      goals.map((g) => [g.seller, g.year, g.month, g.vol, g.tours, g.ventas, g.dias, g.descansos]),
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="metas.csv"');
    res.send(csv);
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al exportar.", 500);
  }
});

router.get("/export/metas", async (req, res) => {
  const a = await adminAuth(req, res, "metas.export_csv");
  if (!a) return;
  try {
    const filters = parseAdminFilters(req.query);
    const goals = await getGoals(a.supabase, filters);
    const csv = toCsv(
      ["Vendedor", "Año", "Mes", "Volumen", "Tours", "Ventas", "Días", "Descansos"],
      goals.map((g) => [g.seller, g.year, g.month, g.vol, g.tours, g.ventas, g.dias, g.descansos]),
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="metas.csv"');
    res.send(csv);
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al exportar.", 500);
  }
});

router.get("/export/metrics", async (req, res) => {
  const a = await adminAuth(req, res, "metricas.export_csv");
  if (!a) return;
  try {
    const filters = parseAdminFilters(req.query);
    const data = await getToolsUsage(a.supabase, filters);
    const csv = toCsv(
      ["Herramienta", "Guardados", "Usuarios únicos", "Libre", "Vinculados"],
      (data.byTool || []).map((row) => [
        row.tool,
        row.saves,
        row.uniqueUsers,
        row.libre,
        row.linked,
      ]),
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="metricas.csv"');
    res.send(csv);
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al exportar.", 500);
  }
});

router.get("/export/support", async (req, res) => {
  const a = await adminAuth(req, res, "soporte.export_csv");
  if (!a) return;
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const statusFilter = status && status !== "all" ? status : undefined;
    const items = [];
    for (let offset = 0; offset < 5000; offset += 100) {
      const data = await supportService.listSupportRequestsForAdmin(a.supabase, {
        status: statusFilter,
        limit: 100,
        offset,
      });
      const batch = Array.isArray(data?.items) ? data.items : [];
      items.push(...batch);
      if (batch.length < 100) break;
    }
    const csv = toCsv(
      ["ID", "Estado", "Tipo", "Área", "Usuario", "Email", "Creado", "Actualizado"],
      items.map((t) => [
        t.id,
        t.status,
        t.request_type_label || t.request_type || "",
        t.app_area_label || t.app_area || "",
        t.user?.name || "",
        t.user?.email || "",
        t.created_at || "",
        t.updated_at || "",
      ]),
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="soporte.csv"');
    res.send(csv);
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al exportar.", 500);
  }
});

router.get("/export/users", async (req, res) => {
  const a = await adminAuth(req, res, "usuarios.export_csv");
  if (!a) return;
  try {
    const filters = parseUserAdminFilters(req.query);
    const users = await getUsers(a.supabase, filters, { includeMetrics: false });
    const ROLE_LABEL = { vendedor: "Liner", liner: "Liner", gerente: "Gerente", admin: "Admin", soporte: "Soporte" };
    const headers = ["Nombre", "Correo", "Rol", "Estado", "Alta", "Último acceso"];
    const csv = toCsv(
      headers,
      users.map((u) => [
        u.name,
        u.email,
        ROLE_LABEL[u.role] ?? u.role,
        u.is_active ? "Activa" : "Desactivada",
        u.created_at ? String(u.created_at).slice(0, 10) : "",
        u.last_seen_at ? String(u.last_seen_at).slice(0, 16).replace("T", " ") : "",
      ]),
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="usuarios-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al exportar.", 500);
  }
});

router.patch("/users/:id/role", async (req, res) => {
  const a = await adminAuth(req, res, "gestionar_usuarios");
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const role = typeof body.role === "string" ? body.role : "";
  await runService(
    res,
    () => adminUsersService.updateUserRole(a.supabase, req.params.id, role, a.userId, a.profile),
    { wrap: "data" },
  );
});

router.patch("/users/:id/status", async (req, res) => {
  const base = await authenticateApi(req, res);
  if (!base.ok) return apiError(res, base.message, base.status);
  const body = parseJsonBody(req, res);
  if (!body) return;
  const isActive = body.is_active ?? body.isActive;
  const a = await requireApiAdmin(base, "usuarios.desactivar_cuenta");
  if (!a.ok) return apiError(res, a.message, a.status);
  await runService(
    res,
    () => adminUsersService.updateUserStatus(a.supabase, req.params.id, isActive, a.userId, a.profile),
    { wrap: "data" },
  );
});

router.patch("/users/:id/permissions", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const raw = Array.isArray(body.permissions) ? body.permissions : [];
  await runService(res, () => adminUsersService.updateUserPermissions(a.supabase, a.profile, req.params.id, raw, a.userId), { wrap: "data" });
});

router.patch("/users/:id/features", async (req, res) => {
  const a = await adminAuth(req, res, null);
  if (!a) return;
  if (!a.isSuperAdmin) {
    const set = expandAdminPermissionSet(a.permissions || []);
    if (!adminPermissionSetHas(set, "usuarios.gestionar_permisos")) {
      return apiError(res, "No tienes permiso para gestionar funciones de usuario.", 403);
    }
  }
  const body = parseJsonBody(req, res);
  if (!body) return;
  const raw = Array.isArray(body.features) ? body.features : Array.isArray(body.permissions) ? body.permissions : [];
  await runService(
    res,
    () => adminUsersService.updateUserFeatures(a.supabase, a.profile, req.params.id, raw, a.userId, a.permissions),
    { wrap: "data" },
  );
});

/** Asignar plan basico/pro (histórico de membresías). */
router.patch("/users/:id/membership", async (req, res) => {
  const a = await adminAuth(req, res, "usuarios.cambiar_plan");
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const plan = body.plan ?? body.planNombre ?? body.nombre;
  await runService(
    res,
    () => membershipService.assignMembership(req.params.id, plan, {
      changedBy: a.userId,
      actorProfile: a.profile,
      supabase: a.supabase,
    }),
    { wrap: "data" },
  );
});

/** Catálogo + árbol de feature flags (motor genérico). */
router.get("/flags", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  await runService(res, () => flagsService.listFlagsTree(a.supabase, a.profile), { wrap: "data" });
});

/** Resumen read-only: empresas con configuración distinta al interruptor general. */
router.get("/flags/:id/empresas-resumen", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  await runService(
    res,
    () => flagsService.getFlagEmpresasResumen(a.profile, req.params.id),
    { wrap: "data" },
  );
});

router.patch("/flags/:id", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const def = body.default_global ?? body.defaultGlobal;
  await runService(
    res,
    () => flagsService.updateFlagDefault(a.supabase, a.profile, req.params.id, def),
    { wrap: "data" },
  );
});

router.put("/flags/:id/rules", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => flagsService.replaceFlagRules(a.supabase, a.profile, req.params.id, body.rules ?? body),
    { wrap: "data" },
  );
});

router.get("/planes", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  await runService(res, () => flagsService.listPlanesForFlags(a.profile), { wrap: "data" });
});

router.get("/empresas", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  await runService(res, () => workspaceService.listEmpresas(a.profile), { wrap: "data" });
});

router.post("/empresas", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => workspaceService.createEmpresa(a.profile, body), { wrap: "data", successStatus: 201 });
});

router.patch("/empresas/:id", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => workspaceService.updateEmpresa(a.profile, req.params.id, body), { wrap: "data" });
});

router.get("/salas", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  const empresaId = typeof req.query.empresa_id === "string" ? req.query.empresa_id : null;
  await runService(res, () => workspaceService.listSalas(a.profile, empresaId), { wrap: "data" });
});

router.post("/salas", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => workspaceService.createSala(a.profile, body), { wrap: "data", successStatus: 201 });
});

router.patch("/salas/:id", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => workspaceService.updateSala(a.profile, req.params.id, body), { wrap: "data" });
});

router.get("/salas/:id/members", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  await runService(res, () => workspaceService.listSalaMembersDetailed(a.profile, req.params.id), { wrap: "data" });
});

router.post("/salas/:id/members", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(res, () => workspaceService.addSalaMember(a.profile, req.params.id, body), { wrap: "data", successStatus: 201 });
});

router.post("/salas/:id/gerente", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const usuarioId = body.usuario_id || body.user_id;
  await runService(res, () => workspaceService.setSalaGerente(a.profile, req.params.id, usuarioId), { wrap: "data" });
});

router.delete("/salas/:id/members/:userId", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  await runService(res, () => workspaceService.removeSalaMember(a.profile, req.params.id, req.params.userId), { wrap: "data" });
});

router.post("/branding/logo", async (req, res) => {
  const a = await requireSuperAdminApi(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  await runService(
    res,
    () => workspaceService.uploadWorkspaceLogo(a.profile, {
      tipo: body.tipo,
      id: body.id,
      dataUrl: body.data_url || body.dataUrl,
      slot: body.slot,
    }),
    { wrap: "data" },
  );
});

router.get("/support/requests", async (req, res) => {
  const a = await adminAuth(req, res, "gestionar_soporte");
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
  const a = await adminAuth(req, res, "gestionar_soporte");
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
  const a = await adminAuth(req, res, "gestionar_soporte");
  if (!a) return;
  await runService(res, () => supportService.listSupportReplies(a.supabase, req.params.id), { wrap: "data" });
});

router.post("/support/requests/:id/replies", async (req, res) => {
  const a = await adminAuth(req, res, "gestionar_soporte");
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
