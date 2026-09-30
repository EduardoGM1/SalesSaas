/**
 * Un 403 de PUT /tool-calculations es definitivo para ese prospecto+herramienta
 * mientras el expediente sigue abierto. No se reintenta ni se ensucia el outbox.
 * Al salir del expediente (último consumidor) se olvida, y al volver se intenta una vez.
 */
import { translate } from "@/lib/i18n.js";
import { toast } from "@/lib/toast";
import { useSyncStore } from "@/stores/sync-store";

const TOOLS = ["survey", "vacaciones", "worksheet"];
const denied = new Set();
const pending = new Set();
const scopes = new Map();

function keyOf(prospectId, tool) {
  return `${prospectId}:${tool}`;
}

function publish() {
  useSyncStore.getState().setToolEditDenied(denied.size > 0);
}

export function isToolWriteDenied(prospectId, tool) {
  if (!prospectId || !tool) return false;
  return denied.has(keyOf(prospectId, tool));
}

/** Mientras el PUT está en vuelo, el reconcile no reenvía esa clave. */
export function beginToolWrite(prospectId, tool) {
  if (!prospectId || prospectId === "libre" || !tool) return () => {};
  const key = keyOf(prospectId, tool);
  pending.add(key);
  return () => pending.delete(key);
}

export function markToolWriteDenied(prospectId, tool) {
  if (!prospectId || prospectId === "libre" || !tool) return;
  const key = keyOf(prospectId, tool);
  const wasNew = !denied.has(key);
  denied.add(key);
  publish();
  if (wasNew) {
    toast.error(translate("sync.editDeniedDetail"), {
      groupKey: `tool-write-denied:${prospectId}`,
    });
  }
}

/**
 * Refcount por expediente. Varias pantallas (detalle + carpeta) pueden retenerlo.
 * @returns {() => void}
 */
export function retainToolWriteScope(prospectId) {
  if (!prospectId) return () => {};
  scopes.set(prospectId, (scopes.get(prospectId) || 0) + 1);
  return () => {
    const next = (scopes.get(prospectId) || 1) - 1;
    if (next > 0) {
      scopes.set(prospectId, next);
      return;
    }
    scopes.delete(prospectId);
    for (const key of denied) {
      if (key.startsWith(`${prospectId}:`)) denied.delete(key);
    }
    publish();
  };
}

/** Copia del blob de sync sin las herramientas ya denegadas. No muta el store. */
export function omitDeniedToolWrites(db) {
  if (!db || (denied.size === 0 && pending.size === 0)) return db;
  let changed = false;
  const clients = { ...(db.clients || {}) };
  for (const [id, client] of Object.entries(clients)) {
    if (!client?.data) continue;
    let stripped = false;
    const data = { ...client.data };
    for (const tool of TOOLS) {
      if (data[tool] && (denied.has(keyOf(id, tool)) || pending.has(keyOf(id, tool)))) {
        delete data[tool];
        stripped = true;
      }
    }
    if (stripped) {
      clients[id] = { ...client, data };
      changed = true;
    }
  }
  const queuedDeletes = db.pendingDeletes;
  let pendingDeletes = queuedDeletes;
  if (Array.isArray(queuedDeletes?.tool_calculations)) {
    const tool_calculations = queuedDeletes.tool_calculations.filter((row) => {
      const key = keyOf(row?.prospect_id, row?.tool);
      return !denied.has(key) && !pending.has(key);
    });
    if (tool_calculations.length !== queuedDeletes.tool_calculations.length) {
      pendingDeletes = { ...queuedDeletes, tool_calculations };
      changed = true;
    }
  }
  if (!changed) return db;
  return { ...db, clients, pendingDeletes };
}
