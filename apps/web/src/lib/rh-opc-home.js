import { RH_TOOL_FLAGS, ROYAL_HOLIDAY_EMPRESA_ID, WORKSHEET_ROYAL_HOLIDAY_FLAG } from "./auth/tool-flags.js";

/**
 * OPC en sala RH: el icono Calendario abre Premanifiesto (olas), no la Agenda CRM.
 */
export const RH_OPC_CALENDAR_HREF = "/ops/rh/premanifiesto";

export function shouldCompactRhFloorNav({
  workspaceTipo,
  isGerenteSala,
  isAdmin,
  roleSlug,
  flags,
  empresaId,
} = {}) {
  if (isAdmin || isGerenteSala) return false;
  if (workspaceTipo !== "sala_de_venta") return false;
  const inRhSala =
    empresaId === ROYAL_HOLIDAY_EMPRESA_ID
    || flags?.[WORKSHEET_ROYAL_HOLIDAY_FLAG] === true;
  if (!inRhSala) return false;
  const slug = String(roleSlug || "").toLowerCase();
  if (slug === "gerente") return false;
  if (slug === "liner" || slug === "cerrador" || slug === "opc") return true;
  if (flags?.[RH_TOOL_FLAGS.premanifiestoOpc] === true) return true;
  if (flags?.[RH_TOOL_FLAGS.premanifiestoRep] === true) return true;
  return false;
}

export function isRhOpcFloorNav({ roleSlug, flags } = {}) {
  const slug = String(roleSlug || "").toLowerCase();
  if (slug === "opc") return true;
  return flags?.[RH_TOOL_FLAGS.premanifiestoOpc] === true;
}

export function navOptionsFromSession(session) {
  const ws = session?.workspace_activo;
  const tipo = ws?.tipo || "personal";
  const flags = session?.flags ?? session?.profile?.flags;
  return {
    isAdmin: false,
    isGerenteSala: tipo === "sala_de_venta" && ws?.rol_en_workspace === "gerente",
    workspaceTipo: tipo,
    roleSlug: ws?.role_slug || null,
    empresaId: ws?.empresa_id || null,
    flags: flags && typeof flags === "object" ? flags : {},
  };
}

export function getRhOpcHomeHref(options = {}) {
  const inRhSala =
    options.empresaId === ROYAL_HOLIDAY_EMPRESA_ID
    || options.flags?.[WORKSHEET_ROYAL_HOLIDAY_FLAG] === true;
  if (options.workspaceTipo === "sala_de_venta" && inRhSala && isRhOpcFloorNav(options)) {
    return RH_OPC_CALENDAR_HREF;
  }
  return "/";
}
