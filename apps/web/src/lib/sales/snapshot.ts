/**
 * Único puente que queda en lib/sales.
 * db-store importa withSaleSnapshot y los tramos de ventas no pueden editar db-store.
 */
export {
  construirInstantaneaVenta as buildSaleSnapshot,
  conInstantaneaVenta as withSaleSnapshot,
} from "@/modulos/ventas/fachada-node.js";
