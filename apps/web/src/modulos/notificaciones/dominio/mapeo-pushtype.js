import { PushType } from "@salesapp/shared/push/notification-targets.js";

/** Bridge PushType (wire) → tipo in-app. */
export const PUSH_A_TIPO = {
  [PushType.MESSAGE]: "mensaje_nuevo",
  [PushType.CONNECTION_REQUEST]: "solicitud_contacto",
  [PushType.CONNECTION_ACCEPTED]: "solicitud_aceptada",
  [PushType.SHARED_PROSPECT]: "expediente_compartido",
  [PushType.PROSPECT_SECTION_CHANGED]: "expediente_compartido",
  [PushType.CLOSER_ASSIGNED]: "cerrador_asignado",
  [PushType.PROSPECT_TRANSFERRED]: "expediente_transferido",
  [PushType.FOLLOW_UP_REMINDER]: "followup_pendiente",
  [PushType.SALES_TO_PROCESS]: "venta_pendiente",
  [PushType.SCHEDULED_NOTE]: "nota_programada",
  [PushType.SUPPORT_REPLY]: "respuesta_soporte",
};

export function tipoInAppDesdePushType(pushType) {
  return PUSH_A_TIPO[pushType] ?? null;
}

export { PushType };
