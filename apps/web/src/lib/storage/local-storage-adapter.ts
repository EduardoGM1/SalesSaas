import {
  ACTIVE_WORKSPACE_KEY,
  OUTBOX_KEY,
  OUTBOX_LEGACY_PENDING_KEY,
  STORAGE_KEY,
  STORAGE_LEGACY_PENDING_KEY,
  STORAGE_SCHEMA_KEY,
  STORAGE_SCHEMA_VERSION,
  USER_PREFS_KEY,
  isActiveWorkspaceStorageKey,
  outboxStorageKey,
  workspaceStorageKey,
} from "./keys";
import {
  composeSettings,
  hasWorkspaceSettings,
  pickUserGlobalSettings,
  pickWorkspaceSettings,
} from "./settings-scope.js";
import { AppDatabase, emptyDatabase, emptyPendingDeletes } from "./types";
import { ensurePendingDeletes } from "@/lib/sync-pending-deletes.js";
import { isEmptyDb } from "@/lib/data/mappers";

function lsGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota / private mode
  }
}

function lsRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getActiveWorkspaceId(): string | null {
  const raw = lsGet(ACTIVE_WORKSPACE_KEY);
  const id = String(raw || "").trim();
  return id || null;
}

export function setActiveWorkspaceId(workspaceId: string | null | undefined): void {
  const id = String(workspaceId || "").trim();
  if (id) lsSet(ACTIVE_WORKSPACE_KEY, id);
  else lsRemove(ACTIVE_WORKSPACE_KEY);
}

export function currentWorkspaceStorageKey(): string | null {
  const id = getActiveWorkspaceId();
  return id ? workspaceStorageKey(id) : null;
}

export function isCurrentWorkspaceStorageEvent(key: string | null): boolean {
  return isActiveWorkspaceStorageKey(key, getActiveWorkspaceId());
}

export function getStoredWorkspacesMap(): Record<string, Record<string, unknown>> {
  const prefs = readUserPrefs();
  if (prefs.workspaces && typeof prefs.workspaces === "object") return prefs.workspaces;
  return {};
}

type UserPrefsBlob = Record<string, unknown> & {
  workspaces?: Record<string, Record<string, unknown>>;
};

function readUserPrefs(): UserPrefsBlob {
  const parsed = parseJson(lsGet(USER_PREFS_KEY));
  if (!parsed || typeof parsed !== "object") return {};
  return parsed as UserPrefsBlob;
}

function writeUserPrefs(prefs: UserPrefsBlob): void {
  lsSet(USER_PREFS_KEY, JSON.stringify(prefs));
}

function readWorkspaceBlob(workspaceId: string): Partial<AppDatabase> | null {
  const parsed = parseJson(lsGet(workspaceStorageKey(workspaceId)));
  if (!parsed || typeof parsed !== "object") return null;
  return parsed as Partial<AppDatabase>;
}

function writeWorkspaceBlob(workspaceId: string, db: AppDatabase): void {
  const scopedSettings = pickWorkspaceSettings(db.settings);
  const payload: AppDatabase = {
    ...db,
    settings: scopedSettings,
  };
  ensurePendingDeletes(payload);
  lsSet(workspaceStorageKey(workspaceId), JSON.stringify(payload));
}

function adoptPendingLegacy(workspaceId: string): void {
  if (!workspaceId) return;
  if (readWorkspaceBlob(workspaceId)) {
    lsRemove(STORAGE_LEGACY_PENDING_KEY);
  } else {
    const pending = parseJson(lsGet(STORAGE_LEGACY_PENDING_KEY)) as Partial<AppDatabase> | null;
    if (pending && typeof pending === "object") {
      const scoped = pickWorkspaceSettings(pending.settings);
      const blob: AppDatabase = {
        clients: pending.clients ?? {},
        libre: pending.libre ?? {},
        cal: pending.cal ?? {},
        goals: pending.goals ?? {},
        sales: pending.sales ?? {},
        userActivities: pending.userActivities ?? [],
        settings: scoped,
        pendingDeletes: pending.pendingDeletes ?? emptyPendingDeletes(),
      };
      writeWorkspaceBlob(workspaceId, blob);
      const prefs = readUserPrefs();
      writeUserPrefs({
        ...prefs,
        ...pickUserGlobalSettings(pending.settings),
        workspaces: {
          ...((prefs.workspaces && typeof prefs.workspaces === "object") ? prefs.workspaces : {}),
          [workspaceId]: scoped,
        },
      });
    }
    lsRemove(STORAGE_LEGACY_PENDING_KEY);
  }

  if (!lsGet(outboxStorageKey(workspaceId))) {
    const pendingOutbox = lsGet(OUTBOX_LEGACY_PENDING_KEY);
    if (pendingOutbox) {
      lsSet(outboxStorageKey(workspaceId), pendingOutbox);
    }
  }
  lsRemove(OUTBOX_LEGACY_PENDING_KEY);
}

/**
 * Esquema 2: invalida la clave global `sts4_v1` (pre-fix) y la reparte en
 * `sts4_user_v1` + `sts4_v1:{workspaceId}`. Corre al hidratar el nuevo bundle
 * (tras invalidación SW / build-id).
 */
export function migrateLegacyStorageIfNeeded(): void {
  if (typeof window === "undefined") return;

  const schemaRaw = lsGet(STORAGE_SCHEMA_KEY);
  const schema = Number(schemaRaw) || 0;
  const legacyRaw = lsGet(STORAGE_KEY);

  if (schema >= STORAGE_SCHEMA_VERSION && !legacyRaw) return;

  if (legacyRaw) {
    const parsed = parseJson(legacyRaw) as Partial<AppDatabase> | null;
    if (parsed && typeof parsed === "object") {
      const globals = pickUserGlobalSettings(parsed.settings);
      const scoped = pickWorkspaceSettings(parsed.settings);
      const prefs = readUserPrefs();
      const wsId = getActiveWorkspaceId();
      writeUserPrefs({
        ...prefs,
        ...globals,
        workspaces: {
          ...((prefs.workspaces && typeof prefs.workspaces === "object") ? prefs.workspaces : {}),
          ...(wsId ? { [wsId]: scoped } : {}),
        },
      });
      if (wsId) {
        if (!readWorkspaceBlob(wsId)) {
          writeWorkspaceBlob(wsId, {
            clients: parsed.clients ?? {},
            libre: parsed.libre ?? {},
            cal: parsed.cal ?? {},
            goals: parsed.goals ?? {},
            sales: parsed.sales ?? {},
            userActivities: parsed.userActivities ?? [],
            settings: scoped,
            pendingDeletes: parsed.pendingDeletes ?? emptyPendingDeletes(),
          });
        }
      } else {
        lsSet(STORAGE_LEGACY_PENDING_KEY, legacyRaw);
      }
    }
    // Invalidar la clave global compartida para que no vuelva a mezclar salas.
    lsRemove(STORAGE_KEY);
  }

  const legacyOutbox = lsGet(OUTBOX_KEY);
  if (legacyOutbox) {
    const wsId = getActiveWorkspaceId();
    if (wsId) lsSet(outboxStorageKey(wsId), legacyOutbox);
    else lsSet(OUTBOX_LEGACY_PENDING_KEY, legacyOutbox);
    lsRemove(OUTBOX_KEY);
  }

  lsSet(STORAGE_SCHEMA_KEY, String(STORAGE_SCHEMA_VERSION));
}

function normalizeLoaded(parsed: Partial<AppDatabase>, workspaceId: string | null): AppDatabase {
  const prefs = readUserPrefs();
  const nestedWs =
    workspaceId && prefs.workspaces && typeof prefs.workspaces === "object"
      ? prefs.workspaces[workspaceId]
      : null;
  const blobWs = pickWorkspaceSettings(parsed.settings);
  const workspaceSettings = hasWorkspaceSettings(blobWs) ? blobWs : pickWorkspaceSettings(nestedWs);
  const db: AppDatabase = {
    clients: parsed.clients ?? {},
    libre: parsed.libre ?? {},
    cal: parsed.cal ?? {},
    goals: parsed.goals ?? {},
    sales: parsed.sales ?? {},
    userActivities: parsed.userActivities ?? [],
    settings: composeSettings(prefs, workspaceSettings),
    pendingDeletes: parsed.pendingDeletes ?? emptyPendingDeletes(),
  };
  ensurePendingDeletes(db);
  return db;
}

export function loadDatabase(): AppDatabase {
  if (typeof window === "undefined") return emptyDatabase();
  migrateLegacyStorageIfNeeded();
  try {
    const wsId = getActiveWorkspaceId();
    if (!wsId) {
      return normalizeLoaded({}, null);
    }
    adoptPendingLegacy(wsId);
    const parsed = readWorkspaceBlob(wsId) || {};
    return normalizeLoaded(parsed, wsId);
  } catch {
    return emptyDatabase();
  }
}

export function saveDatabase(db: AppDatabase): void {
  if (typeof window === "undefined") return;
  migrateLegacyStorageIfNeeded();
  ensurePendingDeletes(db);
  const wsId = getActiveWorkspaceId();
  const prefs = readUserPrefs();
  const globals = pickUserGlobalSettings(db.settings);
  const scoped = pickWorkspaceSettings(db.settings);
  writeUserPrefs({
    ...prefs,
    ...globals,
    workspaces: {
      ...((prefs.workspaces && typeof prefs.workspaces === "object") ? prefs.workspaces : {}),
      ...(wsId ? { [wsId]: scoped } : {}),
    },
  });
  if (wsId) writeWorkspaceBlob(wsId, db);
}

/**
 * Persiste el blob del workspace actual y carga el del destino.
 * No copia worksheetConfig/moneyBoxConfig/tourTypes entre salas.
 */
export function switchWorkspaceStorage(
  nextWorkspaceId: string | null | undefined,
  currentDb?: AppDatabase,
): AppDatabase {
  migrateLegacyStorageIfNeeded();
  const nextId = String(nextWorkspaceId || "").trim() || null;
  const prevId = getActiveWorkspaceId();
  if (currentDb && prevId) {
    const existing = readWorkspaceBlob(prevId);
    const wouldWipe = isEmptyDb(currentDb)
      && !hasWorkspaceSettings(currentDb.settings)
      && existing
      && !isEmptyDb({
        clients: existing.clients ?? {},
        sales: existing.sales ?? {},
        libre: existing.libre ?? {},
        cal: existing.cal ?? {},
        goals: existing.goals ?? {},
        userActivities: existing.userActivities ?? [],
      } as AppDatabase);
    if (!wouldWipe) saveDatabase(currentDb);
  }
  setActiveWorkspaceId(nextId);
  if (nextId) adoptPendingLegacy(nextId);
  return loadDatabase();
}

export { USER_PREFS_KEY };

export function exportDatabase(db: AppDatabase): void {
  const payload = {
    app: "Sales Timeshare",
    version: "v1-saas",
    exportedAt: new Date().toISOString(),
    data: db,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = URL.createObjectURL(blob);
  a.download = `sales-timeshare-respaldo-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function importDatabaseFile(
  file: File,
  onSuccess: (db: AppDatabase) => void,
  onError: () => void
): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result as string);
      const incoming = (parsed.data ?? parsed) as Partial<AppDatabase>;
      if (!incoming || typeof incoming !== "object") throw new Error("invalid");
      onSuccess(normalizeLoaded(incoming, getActiveWorkspaceId()));
    } catch {
      onError();
    }
  };
  reader.readAsText(file);
}
