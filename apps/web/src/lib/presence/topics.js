/** Topic de presencia privado por usuario (autorizado vía RLS en realtime.messages). */
export function presenceTopic(userId) {
  return `presence:user:${userId}`;
}

export function channelHasPresence(state) {
  return Object.values(state || {}).some(
    (entries) => Array.isArray(entries) && entries.length > 0,
  );
}
