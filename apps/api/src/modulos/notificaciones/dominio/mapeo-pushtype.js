/**
 * PushType + deep links — reexporta contrato shared sin renombrar valores wire.
 */
import {
  PushType,
  resolvePushPathFromPayload,
  calendarPath,
  salesPath,
  networkPath,
  pushUrl,
} from "@salesapp/shared/push/notification-targets.js";

export {
  PushType,
  resolvePushPathFromPayload,
  calendarPath,
  salesPath,
  networkPath,
  pushUrl,
};

/** Alias español → mismo resolver de deep link. */
export function resolverRutaPushDesdePayload(payload) {
  return resolvePushPathFromPayload(payload);
}

/** PushType de recordatorio operativo según kind de agenda. */
export function tipoPushDeRecordatorio({ esFollow, esNota }) {
  if (esFollow) return PushType.FOLLOW_UP_REMINDER;
  if (esNota) return PushType.SCHEDULED_NOTE;
  return null;
}
