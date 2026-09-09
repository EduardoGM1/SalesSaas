import { fetchSession } from "@/lib/session-api.js";
import { getRhOpcHomeHref, navOptionsFromSession } from "@/lib/nav-config.js";
import { safeNextPath } from "@/lib/safe-next.js";

/**
 * Ruta post-auth. Si `next` es explícito (distinto de `/`), se respeta.
 * Si el default es Agenda, OPC en sala RH aterriza en Premanifiesto.
 */
export async function resolvePostAuthPath(explicitNext) {
  const requested = safeNextPath(explicitNext, "/");
  if (requested !== "/") return requested;
  try {
    const session = await fetchSession();
    return getRhOpcHomeHref(navOptionsFromSession(session));
  } catch {
    return "/";
  }
}
