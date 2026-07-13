import { messagesApi } from "@/lib/network-api.js";

let unreadCount = 0;
const listeners = new Set();
let inflight = null;

export function getUnreadMessagesCount() {
  return unreadCount;
}

export function subscribeUnreadMessages(listener) {
  listeners.add(listener);
  listener(unreadCount);
  return () => listeners.delete(listener);
}

function emit(next) {
  unreadCount = Math.max(0, Number(next) || 0);
  listeners.forEach((listener) => {
    try {
      listener(unreadCount);
    } catch {
      /* ignore subscriber errors */
    }
  });
}

/** Notifica a todos los badges (sidebar/topbar) para recargar el conteo. */
export function notifyUnreadMessagesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("messages:unread-changed"));
}

export async function refreshUnreadMessagesCount() {
  if (inflight) return inflight;
  inflight = messagesApi
    .unreadCount()
    .then((data) => {
      emit(data?.count ?? 0);
      return unreadCount;
    })
    .catch(() => unreadCount)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
