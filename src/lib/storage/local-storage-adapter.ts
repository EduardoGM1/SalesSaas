import { STORAGE_KEY } from "./keys";
import { AppDatabase, emptyDatabase } from "./types";

export function loadDatabase(): AppDatabase {
  if (typeof window === "undefined") return emptyDatabase();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDatabase();
    const parsed = JSON.parse(raw) as Partial<AppDatabase>;
    return {
      clients: parsed.clients ?? {},
      libre: parsed.libre ?? {},
      cal: parsed.cal ?? {},
      goals: parsed.goals ?? {},
      userActivities: parsed.userActivities ?? [],
      settings: parsed.settings ?? emptyDatabase().settings,
    };
  } catch {
    return emptyDatabase();
  }
}

export function saveDatabase(db: AppDatabase): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

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
      onSuccess({
        clients: incoming.clients ?? {},
        libre: incoming.libre ?? {},
        cal: incoming.cal ?? {},
        goals: incoming.goals ?? {},
        userActivities: incoming.userActivities ?? [],
        settings: incoming.settings ?? emptyDatabase().settings,
      });
    } catch {
      onError();
    }
  };
  reader.readAsText(file);
}
