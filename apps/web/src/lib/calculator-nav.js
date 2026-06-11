/** Ruta de retorno para herramientas dentro o fuera de un expediente. */
export function resolveToolBackHref(clientId) {
  return clientId ? `/clients/${clientId}` : "/tools";
}
