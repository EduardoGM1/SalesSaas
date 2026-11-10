/**
 * Puente único que queda en lib/clients.
 * db-store importa estas funciones y el tramo de expediente no puede editar db-store.
 */
export {
  ensureProspectIdentity,
  clientDisplayName,
  activeClients,
} from "@/modulos/expediente/fachada-node.js";
