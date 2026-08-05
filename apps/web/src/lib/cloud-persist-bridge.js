/**
 * Puente db-store → cloud-persist.
 */
import {
  persistProspectDelete,
  persistProspectUpsert,
} from "@/lib/prospects-persist.js";
import {
  persistActivityUpsert,
  persistCalendarDelete,
  persistCalendarUpsert,
  persistGoalUpsert,
  persistSaleDelete,
  persistToolUpsert,
  scheduleCloudPersist,
  scheduleSaleBundle,
} from "@/lib/cloud-persist.js";

let suspended = false;

export function suspendCloudPersist(on) {
  suspended = !!on;
}

export function notifyProspectSaved(client) {
  if (suspended || !client?.id) return;
  scheduleCloudPersist({
    type: "prospect",
    reason: "prospect-save",
    run: () => persistProspectUpsert(client),
  });
}

export function notifyProspectDeleted(id) {
  if (suspended || !id) return;
  scheduleCloudPersist({
    type: "prospect-delete",
    reason: "prospect-delete",
    run: () => persistProspectDelete(id),
  });
}

export function notifySaleRegistered(clientId, saleId) {
  if (suspended || !clientId || !saleId) return;
  scheduleSaleBundle(clientId, saleId);
}

export function notifySaleUpdated(clientId, saleId) {
  if (suspended || !clientId || !saleId) return;
  scheduleSaleBundle(clientId, saleId);
}

export function notifySaleDeleted(saleId) {
  if (suspended || !saleId) return;
  scheduleCloudPersist({
    type: "sale-delete",
    reason: "sale-delete",
    run: () => persistSaleDelete(saleId),
  });
}

export function notifyActivityAdded(clientId, activity) {
  if (suspended || !activity?.id) return;
  scheduleCloudPersist({
    type: "activity",
    reason: "activity",
    run: () => persistActivityUpsert(clientId, activity),
  });
}

export function notifyUserActivityAdded(activity) {
  notifyActivityAdded(null, activity);
}

export function notifyCalEntryAdded(year, month, day, entry) {
  if (suspended || !entry?.id) return;
  const entryDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  scheduleCloudPersist({
    type: "calendar",
    reason: "calendar",
    run: () => persistCalendarUpsert(entry, entryDate),
  });
}

export function notifyCalEntryDeleted(entryId) {
  if (suspended || !entryId) return;
  scheduleCloudPersist({
    type: "calendar-delete",
    reason: "calendar-delete",
    run: () => persistCalendarDelete(entryId),
  });
}

export function notifyGoalSaved(year, month, goal) {
  if (suspended) return;
  scheduleCloudPersist({
    type: "goal",
    reason: "goal",
    run: () => persistGoalUpsert(year, month, goal),
  });
}

export function notifyToolSaved(tool, mode, data, clientId) {
  if (suspended) return;
  scheduleCloudPersist({
    type: "tool",
    reason: "tool",
    run: () => persistToolUpsert(tool, mode, data, clientId),
  });
}

export function notifyClientCompleted(client) {
  notifyProspectSaved(client);
}
