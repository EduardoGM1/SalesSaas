import { Router } from "express";
import { authenticateApi } from "../middleware/auth.js";
import { requireApiAdmin } from "../middleware/admin-auth.js";
import { apiError, json } from "../lib/http.js";
import {
  effectivePermissions,
  hasAnyAdminAccess,
  isSuperAdmin,
} from "@salesapp/shared/auth/permissions.js";
import { parseAdminFilters, parseUserAdminFilters } from "../lib/admin/filters.js";
import { toCsv } from "../lib/admin/csv.js";
import {
  getOverview,
  getSales,
  getUsers,
  getWorksheets,
  getWorksheetDetail,
  getCalendarEntries,
  getGoals,
  getActivities,
  getSellerOptions,
  prospectName,
} from "../lib/admin/data.js";
import { parseJsonBody, runService } from "./route-utils.js";
import * as adminUsersService from "../services/admin-users-service.js";

const router = Router();

const STATUS_LABELS = {
  "": "Sin estado",
  venta: "Venta",
  bback: "B-back",
  procesable: "Procesable",
  "no-procesable": "No procesable",
  perdido: "Perdido / cerrado",
  cerrado: "Cerrado",
  procesado: "Procesado",
};

function statusLabel(s) {
  return STATUS_LABELS[s || ""] || s || "Sin estado";
}

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

router.get("/me", async (req, res) => {
  const base = await authenticateApi(req, res);
  if (!base.ok) return apiError(res, base.message, base.status);
  const { data: profile, error } = await base.supabase
    .from("profiles")
    .select("id, role, is_super_admin, admin_permissions")
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
  if (!hasAnyAdminAccess(adminProfile)) {
    return apiError(res, "No autorizado.", 403);
  }
  json(res, {
    profile: adminProfile,
    permissions: effectivePermissions(adminProfile),
    isSuperAdmin: isSuperAdmin(adminProfile),
    userId: base.userId,
  });
});

router.get("/overview", async (req, res) => {
  const a = await adminAuth(req, res, "dashboard:read");
  if (!a) return;
  const data = await getOverview(a.supabase);
  json(res, { data });
});

router.get("/sellers", async (req, res) => {
  const a = await adminAuth(req, res, "dashboard:read");
  if (!a) return;
  const data = await getSellerOptions(a.supabase);
  json(res, { data });
});

router.get("/sales", async (req, res) => {
  const a = await adminAuth(req, res, "sales:read");
  if (!a) return;
  const filters = parseAdminFilters(req.query);
  const data = await getSales(a.supabase, filters);
  json(res, { data });
});

router.get("/users", async (req, res) => {
  const a = await adminAuth(req, res, "users:read");
  if (!a) return;
  const filters = parseUserAdminFilters(req.query);
  const data = await getUsers(a.supabase, filters);
  json(res, { data });
});

router.get("/worksheets", async (req, res) => {
  const a = await adminAuth(req, res, "worksheets:read");
  if (!a) return;
  const filters = parseAdminFilters(req.query);
  const data = await getWorksheets(a.supabase, filters);
  json(res, { data });
});

router.get("/worksheets/:id", async (req, res) => {
  const a = await adminAuth(req, res, "worksheets:read");
  if (!a) return;
  const data = await getWorksheetDetail(a.supabase, req.params.id);
  if (!data) return apiError(res, "Worksheet no encontrado.", 404);
  json(res, { data });
});

router.get("/calendar", async (req, res) => {
  const a = await adminAuth(req, res, "agenda:read");
  if (!a) return;
  const filters = parseAdminFilters(req.query);
  const data = await getCalendarEntries(a.supabase, filters);
  json(res, { data });
});

router.get("/goals", async (req, res) => {
  const a = await adminAuth(req, res, "goals:read");
  if (!a) return;
  const filters = parseAdminFilters(req.query);
  const data = await getGoals(a.supabase, filters);
  json(res, { data });
});

router.get("/activities", async (req, res) => {
  const a = await adminAuth(req, res, "activity:read");
  if (!a) return;
  const filters = parseAdminFilters(req.query);
  const data = await getActivities(a.supabase, filters);
  json(res, { data });
});

router.get("/export/sales", async (req, res) => {
  const a = await adminAuth(req, res, "sales:export");
  if (!a) return;
  const filters = parseAdminFilters(req.query);
  const sales = await getSales(a.supabase, filters);
  const csv = toCsv(
    ["Fecha", "Vendedor", "Expediente", "Contrato", "Estado", "Tours", "Volumen"],
    sales.map((s) => [
      s.sale_date,
      s.seller,
      prospectName(s.prospect),
      s.contract,
      statusLabel(s.status ?? undefined),
      s.tours,
      s.vol,
    ])
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="ventas-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

router.get("/export/users", async (req, res) => {
  const a = await adminAuth(req, res, "users:export");
  if (!a) return;
  const filters = parseUserAdminFilters(req.query);
  const users = await getUsers(a.supabase, filters);
  const ROLE_LABEL = { vendedor: "Vendedor", gerente: "Gerente", admin: "Admin" };
  const csv = toCsv(
    ["Nombre", "Correo", "Rol", "Estado", "Expedientes", "Ventas", "Volumen", "Alta"],
    users.map((u) => [
      u.name,
      u.email,
      ROLE_LABEL[u.role] ?? u.role,
      u.is_active ? "Activa" : "Desactivada",
      u.prospects,
      u.sales,
      u.volume,
      u.created_at ? String(u.created_at).slice(0, 10) : "",
    ])
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="usuarios-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

router.patch("/users/:id/role", async (req, res) => {
  const a = await adminAuth(req, res, "users:role");
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const role = typeof body.role === "string" ? body.role : "";
  await runService(res, () => adminUsersService.updateUserRole(a.supabase, req.params.id, role), { wrap: "data" });
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
  await runService(res, () => adminUsersService.updateUserStatus(a.supabase, req.params.id, isActive), { wrap: "data" });
});

router.patch("/users/:id/permissions", async (req, res) => {
  const a = await adminAuth(req, res, "users:permissions");
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const raw = Array.isArray(body.permissions) ? body.permissions : [];
  await runService(res, () => adminUsersService.updateUserPermissions(a.supabase, a.profile, req.params.id, raw), { wrap: "data" });
});

router.patch("/users/:id/features", async (req, res) => {
  const a = await adminAuth(req, res, "users:permissions");
  if (!a) return;
  const body = parseJsonBody(req, res);
  if (!body) return;
  const raw = Array.isArray(body.features) ? body.features : Array.isArray(body.permissions) ? body.permissions : [];
  await runService(res, () => adminUsersService.updateUserFeatures(a.supabase, a.profile, req.params.id, raw), { wrap: "data" });
});

export default router;
