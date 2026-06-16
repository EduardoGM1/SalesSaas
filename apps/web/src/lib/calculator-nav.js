/** Ruta de retorno para herramientas dentro o fuera de un expediente. */
export function resolveToolBackHref(clientId, sharedBackHref) {
  if (sharedBackHref) return sharedBackHref;
  return clientId ? `/clients/${clientId}` : "/tools";
}
