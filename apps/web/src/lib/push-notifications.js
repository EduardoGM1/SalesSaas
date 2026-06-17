import {
  getNotificationPermission,
  getPushStatus,
  isPushSupported,
  needsIosPwaInstall,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/onesignal.js";

export {
  getNotificationPermission,
  getPushStatus,
  isPushSupported,
  needsIosPwaInstall,
  subscribeToPush,
  unsubscribeFromPush,
};

export async function syncPushSubscription() {
  const status = await getPushStatus();
  if (!status.subscribed) return { synced: false, reason: "not_subscribed" };
  return { synced: true };
}
