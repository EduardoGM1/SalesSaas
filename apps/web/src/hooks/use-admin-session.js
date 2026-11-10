/** Shim legacy: la implementación vive en modulos/admin. */
export {
  useAdminSession,
  useAdminFetch,
  warmAdminSession,
  clearAdminSessionCache,
  prefetchAdminSession,
} from "@/modulos/admin/fachada-node.js";
