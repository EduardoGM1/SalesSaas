/**
 * Fachada pública — ventas (web).
 * Tramo A: UI, hook y acciones. Tramo B: dominio. API, sync y db-store fuera.
 */
export {
  ventaCancelada,
  ventaContable,
  tourDeVentaContable,
  ventaActivaEnAgenda,
  ventaCanceladaEnAgenda,
  ventasDelMes,
  ventasContablesDelMes,
  isSaleCancelled,
  isSaleCountable,
  isSaleTourCountable,
  isActiveAgendaSale,
  isCancelledAgendaSale,
  collectSalesForMonth,
  collectCountableSalesForMonth,
  fechaProcesoVenta,
  formularioVentaValido,
  resolveSaleProcessDate,
  isSaleFormValid,
  filaAgendaDeVenta,
  construirInstantaneaVenta,
  conInstantaneaVenta,
  buildSaleSnapshot,
  withSaleSnapshot,
  recopilarVentas,
  filtrarVentas,
  contarVentas,
  buscarVentaPorId,
  collectAllSales,
  filterSales,
  countAllSales,
  findSaleById,
} from "./fachada-node.js";

export { useSaleActions } from "./hooks/use-sale-actions.js";
export { saveClientSale, validateSaleForm } from "./servicios/acciones-venta.js";
export { SaleFields } from "./ui/sale-fields.jsx";
export { SaleDetailModal } from "./ui/sale-detail-modal.jsx";
export { SalesHistoryPage } from "./ui/sales-history-page.jsx";
