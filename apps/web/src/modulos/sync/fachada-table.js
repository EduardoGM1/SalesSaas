/**
 * Entrada delgada: refresh puntual del dashboard (arrastra db-store).
 * No mezclar con fachada-node.
 */
export {
  applyDashboardTableChange,
  DASHBOARD_TABLES,
  TABLE_REST_PATHS,
  restPathsNotForTable,
} from "./servicios/sync-table-refresh.js";
