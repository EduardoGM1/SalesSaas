/**
 * Entrada Node (sin UI React): dominio y servicios puros para tests.
 * Tramo B. Sync, outbox, db-store y API quedan fuera.
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
} from "./dominio/contabilidad-ventas.ts";

export {
  fechaProcesoVenta,
  formularioVentaValido,
  resolveSaleProcessDate,
  isSaleFormValid,
} from "./dominio/validez-formulario.ts";

export { filaAgendaDeVenta } from "./dominio/fila-agenda-venta.ts";

export {
  construirInstantaneaVenta,
  conInstantaneaVenta,
  buildSaleSnapshot,
  withSaleSnapshot,
} from "./servicios/instantanea-venta.ts";

export {
  recopilarVentas,
  filtrarVentas,
  contarVentas,
  buscarVentaPorId,
  collectAllSales,
  filterSales,
  countAllSales,
  findSaleById,
} from "./servicios/recopilar-ventas.ts";
