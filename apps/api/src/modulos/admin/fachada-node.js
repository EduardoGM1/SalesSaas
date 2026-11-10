/**
 * Superficie admin para servicios/cron fuera del router.
 */
export { ADMIN_AUDIT_ACTIONS, writeAdminLog } from "./servicios/admin-audit-service.js";
export { assertCanMutateTargetUser, loadTargetProfile } from "./lib/admin-peer-guard.js";
export { ensureEmpresaOperationalRoles } from "./servicios/empresa-roles-seed.js";
export { listCrossAccessSalasForUser } from "./servicios/delegacion-service.js";
