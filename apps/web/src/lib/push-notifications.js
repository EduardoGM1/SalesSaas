import { notificationsApi } from "@/lib/notifications-api.js";
import {
  getNotificationPermission,
  getPushStatus as getLocalPushStatus,
  isPushSupported,
  subscribeToPush as subscribeOneSignal,
  unsubscribeFromPush as unsubscribeOneSignal,
} from "@/lib/onesignal.js";

export { getNotificationPermission, isPushSupported };

export async function subscribeToPush() {
  await subscribeOneSignal();
}

export async function unsubscribeFromPush() {
  await unsubscribeOneSignal();
}

export async function syncPushSubscription() {
  const local = await getLocalPushStatus();
  if (!local.subscribed) return { synced: false, reason: "not_subscribed" };
  return { synced: true };
}

export async function getPushStatus() {
  const local = await getLocalPushStatus();
  if (!local.supported) return local;

  let pushConfigured = local.pushConfigured;
  try {
    const status = await notificationsApi.status();
    pushConfigured = status?.push_configured !== false;
  } catch {
    // Mantener valor local.
  }

  return {
    ...local,
    pushConfigured,
    provider: "onesignal",
  };
}
