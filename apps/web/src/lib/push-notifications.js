import {
  getNotificationPermission,
  getPushStatus,
  isPushSupported,
  needsIosPwaInstall,
  restorePushSubscriptionIfNeeded,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/onesignal.js";
import { notificationsApi } from "@/lib/notifications-api.js";

export {
  getNotificationPermission,
  getPushStatus,
  isPushSupported,
  needsIosPwaInstall,
  restorePushSubscriptionIfNeeded,
  subscribeToPush,
  unsubscribeFromPush,
};

async function registerDeviceSubscription(subscriptionId) {
  if (!subscriptionId) return;
  try {
    await notificationsApi.registerDevice(subscriptionId);
  } catch {
    // El servidor puede no estar disponible; se reintentará al abrir la app.
  }
}

export async function syncPushSubscription() {
  const status = await getPushStatus();
  if (!status.subscribed || !status.subscriptionId) return { synced: false, reason: "not_subscribed" };
  await registerDeviceSubscription(status.subscriptionId);
  return { synced: true };
}

export { registerDeviceSubscription };
